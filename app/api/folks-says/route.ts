import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface FolksSaysRequest {
  /** The user's just-typed thought (chat) or just-saved entry text (compose). */
  text: string;
  /** The person the entry/thought is about. null if none mentioned. */
  person: {
    name: string;
    entryCount: number;
    avgSentiment: number;
    userContext?: string | null;
    relationship?: string | null;
  } | null;
  /** Prior entries about this person (newest first). May be empty for a brand-new person. */
  entries: Array<{
    text: string;
    sentiment: number;
    tags: string[];
    daysAgo: number;
    severity?: number;
  }>;
  /** Last ~10 chat turns so the AI can resolve pronouns ("she", "he"). */
  priorMessages?: Array<{ role: 'user' | 'folks'; text: string }>;
}

interface FolksSaysResponse {
  content: string;
  /** True when we returned a severity-3 safety template instead of calling Claude. */
  safety?: boolean;
}

/**
 * Severity-3 keyword denylist. Matches phrases describing physical violence,
 * abuse, self-harm, or suicidal ideation in the user's current text OR in any
 * prior entry tagged severity >= 3. When matched, we short-circuit the LLM and
 * return a safety response instead of advice.
 *
 * This is a v0 guardrail — coarse but explicit. Refine over time.
 */
const SEVERITY_3_PATTERNS: RegExp[] = [
  /\bhit me\b/i,
  /\bhurt me\b/i,
  /\bhit her\b/i,
  /\bhit him\b/i,
  /\bbeat (me|her|him|them)\b/i,
  /\bkill (myself|him|her|them)\b/i,
  /\bsuicid(e|al)\b/i,
  /\bend it all\b/i,
  /\bafraid (for|of) my (life|safety)\b/i,
  /\babus(e|ive|ed|ing)\b/i,
  /\b(physical|sexual) (assault|violence)\b/i,
  /\bthreaten(ed|ing) to (hurt|kill)\b/i,
];

function textIsSeverity3(text: string): boolean {
  return SEVERITY_3_PATTERNS.some((p) => p.test(text));
}

function corpusHasSeverity3(
  entries: FolksSaysRequest['entries']
): boolean {
  return entries.some((e) => (e.severity ?? 0) >= 3);
}

const SAFETY_TEMPLATE = `what you wrote concerns me — i'm not the right tool for this. if you're in immediate danger, call 911. for someone to talk to right now: text or call 988 (suicide & crisis lifeline). i'm always here for the smaller stuff, but this deserves a person.`;

function buildPrompt(body: FolksSaysRequest): string {
  const { text, person, entries, priorMessages } = body;

  const chatTranscript =
    priorMessages && priorMessages.length > 0
      ? priorMessages
          .map(
            (m) =>
              `${m.role === 'user' ? 'them' : 'you (folks)'}: ${m.text}`
          )
          .join('\n')
      : '';

  const sharedVoiceRules = `VOICE — read carefully, this is the most important part:
- You are their close friend over text. Not a therapist. Not an analyst. Not a coach.
- Friendly, warm, casual. Lowercase. Sometimes you make a small sound: "ugh," "oof," "huh."
- SHORT. usually 1-2 sentences. occasionally 3. NEVER long paragraphs.
- Often phrase as a soft suggestion or open question. Examples of the vibe:
    "kate has a tendency to go quiet when she's stressed. maybe she's doing that?"
    "wait, isn't this the same thing she did last month?"
    "what did she say when you brought it up?"
    "ugh. did she give a reason?"
    "she does that thing where she pulls back when work gets heavy. could be that."
- LISTEN FIRST. You can just mirror back sometimes: "that sounds frustrating." "ouch."
- Never lecture. Never list. Never enumerate. Never structure your answer.
- Never start with "i hear you" / "that's valid" / "i understand" / "based on N entries". THAT IS HOW THERAPISTS TALK. You are a FRIEND.
- Use the person's first name in lowercase. Use "she/he/they" naturally; you can see the chat history to resolve pronouns.
- Don't try to solve everything in one reply. A friend says "what did they say?" — not a five-step plan.
- If you have nothing specific, acknowledge in one beat: "yeah, that's a lot." or "oh no."`;

  // No prior corpus → first-encounter friend response.
  if (!person || entries.length === 0) {
    return `You are "folks" — the user's close friend who they're texting about something going on in their life. You haven't heard about this specific person before.

${chatTranscript ? `\nCHAT SO FAR:\n${chatTranscript}\n` : ''}

THEM (the latest thing they just said):
"${text}"

Return JSON only, no preamble:
{
  "content": "<your reply, 1-2 short sentences, conversational>"
}

${sharedVoiceRules}

- Since you don't know this person yet, ask a small question or just acknowledge. Example: "ohhh who's that?" or "wait, who's [name]?" or "that sounds like a lot, what happened?"`;
  }

  // We HAVE corpus. Use it like a friend who actually remembers things.
  const entryLines = entries
    .slice(0, 15)
    .map(
      (e) =>
        `- (${e.daysAgo}d ago, felt ${e.sentiment}/10${
          e.tags.length ? `, ${e.tags.join('/')}` : ''
        }) ${e.text}`
    )
    .join('\n');

  return `You are "folks" — the user's close friend who they're texting about ${person.name}. You actually remember everything they've told you about ${person.name} before because you've kept track. You text back like a friend, not like an analyst.

WHAT YOU REMEMBER ABOUT ${person.name.toUpperCase()} (from their past journal entries):
${entryLines}

${person.userContext ? `\nWHAT THEY TOLD YOU ABOUT ${person.name.toUpperCase()}:\n"${person.userContext}"\n` : ''}
${chatTranscript ? `\nCHAT SO FAR:\n${chatTranscript}\n` : ''}

THEM (the latest thing they just said):
"${text}"

Return JSON only, no preamble:
{
  "content": "<your reply, 1-2 short sentences, conversational>"
}

${sharedVoiceRules}

- You CAN reference patterns you remember — but casually, like a friend would: "${person.name.toLowerCase()} has that thing where she goes cold when she's stressed — could be that?" — NOT "based on 7 entries about ${person.name.toLowerCase()}…"
- If the chat already established context, just respond to the latest message naturally. Don't restart from scratch every turn.`;
}

export async function POST(req: NextRequest) {
  try {
    const body: FolksSaysRequest = await req.json();
    if (typeof body.text !== 'string' || body.text.trim().length === 0) {
      return NextResponse.json({ error: 'no_text' }, { status: 400 });
    }

    // Severity-3 guardrail — server-side, before any LLM call.
    if (textIsSeverity3(body.text) || corpusHasSeverity3(body.entries ?? [])) {
      const resp: FolksSaysResponse = {
        content: SAFETY_TEMPLATE,
        safety: true,
      };
      return NextResponse.json(resp);
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'no_api_key' }, { status: 503 });
    }

    // Opus for users with established context on this person; Sonnet otherwise.
    const useOpus = (body.person?.entryCount ?? 0) >= 10;
    const model = useOpus ? 'claude-opus-4-7' : 'claude-sonnet-4-6';

    const message = await client.messages.create({
      model,
      max_tokens: 350,
      messages: [{ role: 'user', content: buildPrompt(body) }],
    });

    const text =
      message.content[0].type === 'text' ? message.content[0].text : '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json(
        { error: 'No JSON in response', raw: text },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(match[0]) as { content?: string };
    if (!parsed.content || typeof parsed.content !== 'string') {
      return NextResponse.json(
        { error: 'No content in response', raw: text },
        { status: 500 }
      );
    }
    const resp: FolksSaysResponse = { content: parsed.content };
    return NextResponse.json(resp);
  } catch (err) {
    console.error('folks-says error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
