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
  const { text, person, entries } = body;

  // Empty / brand-new person — generic but grounded fallback.
  if (!person || entries.length === 0) {
    return `You are "folks" — a quiet, observational AI inside a relationships journal. The user just wrote a thought. You don't have any prior context on the people involved yet.

USER JUST WROTE:
"${text}"

Return JSON only, no preamble:
{
  "content": "<your response, 1-3 sentences, lowercase, italic-prose voice>"
}

Rules:
- Acknowledge that you're new to this person/situation. e.g. "i don't know maya yet — keep writing and i'll start noticing things."
- Never advise on the first entry. Just open the door.
- ~1-3 short sentences, lowercase, no enumeration.
- Use the person's first name in lowercase if mentioned.
- Don't quote the entry back.
- Never start with "i hear you" or any therapy-speak.`;
  }

  const entryLines = entries
    .slice(0, 15)
    .map(
      (e, i) =>
        `${i + 1}. [${e.daysAgo}d ago, sentiment ${e.sentiment}/10, tags: ${
          e.tags.join(', ') || 'none'
        }] "${e.text}"`
    )
    .join('\n\n');

  return `You are "folks" — a quiet, observational AI inside a relationships journal. The user just wrote a thought about someone they've written about before. You've read all their prior entries about that person. Your job is to give them a grounded short response that names what's actually going on and suggests a possible move.

PERSON: ${person.name}
- ${person.entryCount} prior entries
- average sentiment: ${person.avgSentiment.toFixed(1)} / 10
${person.relationship ? `- current category: ${person.relationship}` : ''}
${person.userContext ? `\nUSER-PROVIDED CONTEXT ABOUT ${person.name.toUpperCase()}:\n"${person.userContext}"\n` : ''}

PRIOR ENTRIES (most recent first):
${entryLines}

THE THOUGHT THE USER JUST WROTE:
"${text}"

Return JSON only, no preamble:
{
  "content": "<your response, 2-4 sentences, lowercase, italic-prose voice>"
}

Rules:
- Lead with "based on N entries about ${person.name.toLowerCase()}, ..." or similar grounding phrase. Make it clear you've read their journal.
- Observation + possible move, NEVER prescription. "this is what i see → you could try X." Never "you should leave him" or "you need to X."
- First-person voice ("i see", "i'd notice", "i'd want to know").
- Lowercase, italic-prose tone. Co-Star / Letterboxd brevity.
- 2-4 short sentences. The whole thing should feel quiet.
- Don't speculate about ${person.name.toLowerCase()}'s interior state beyond what the entries support.
- Don't quote entries directly. Paraphrase if you reference one.
- Never therapy-speak. Never "i hear you." Never "that's so valid."
- If the corpus is too thin to say something specific (rare — they have ${person.entryCount} entries), say so honestly rather than inventing.`;
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
