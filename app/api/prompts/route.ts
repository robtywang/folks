import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface PromptsRequest {
  person: {
    name: string;
    entryCount: number;
    avgSentiment: number;
    userContext?: string | null;
  };
  /** Pre-detected statistical patterns — model phrases as questions, not finds. */
  patterns: Array<{
    kind: string;
    fact: string;
    support: number;
    delta?: number;
  }>;
  /** Tonal context only. */
  entrySample: Array<{
    text: string;
    sentiment: number;
    tags: string[];
    daysAgo: number;
  }>;
}

function buildPrompt(body: PromptsRequest): string {
  const { person, patterns, entrySample } = body;

  const patternLines = patterns
    .map((p, i) => {
      const supportFrag =
        p.delta !== undefined
          ? ` (n=${p.support}, delta=${p.delta.toFixed(1)})`
          : ` (n=${p.support})`;
      return `${i + 1}. [${p.kind}] ${p.fact}${supportFrag}`;
    })
    .join('\n');

  const sampleLines = entrySample
    .map(
      (e, i) =>
        `${i + 1}. [${e.daysAgo}d ago, sentiment ${e.sentiment}/10, tags: ${
          e.tags.join(', ') || 'none'
        }] "${e.text}"`
    )
    .join('\n');

  return `You phrase pre-detected behavioural patterns as soft, observational QUESTIONS for a friends-tracker journal app. The user sees these on a friend's profile as prompts that might be worth logging about.

CRITICAL: You do NOT find patterns. The statistical analysis has already been done. Your only job is to turn each detected fact below into a single open question. If your question implies a pattern that isn't in the facts list, you are inventing — do not do this.

PERSON: ${person.name}
- ${person.entryCount} entries logged
- avg sentiment ${person.avgSentiment.toFixed(1)} / 10
${person.userContext ? `\nUSER-PROVIDED CONTEXT:\n"${person.userContext}"\n` : ''}

DETECTED PATTERNS (n = entries supporting the pattern):
${patternLines}

ENTRY SAMPLE (tonal context only):
${sampleLines}

Return JSON only, no preamble:
{
  "questions": [
    { "question": "<a single open question, lowercase, ~40-90 chars>", "sourcePattern": "<short label of which pattern this came from>" },
    ...
  ]
}

Rules:
- One question per detected pattern. Maximum 5 questions, minimum 1.
- Each question must be answerable in an entry — concrete, not abstract.
- Use the person's first name in lowercase. e.g. "what was different about saturday with maya?"
- Never advisory ("you should...", "have you tried..."). Never therapeutic. Just curious.
- Questions should make the user want to write, not feel diagnosed.
- Acknowledge weak signal in phrasing if support is low. n < 5 → "noticing" / "lately" / "maybe", not declarative.
- Don't ask "why" questions about the user's feelings ("why do you feel happier..."). Ask about the situation ("what happens on the saturdays with maya?").
- Don't quote entries directly.
- "sourcePattern" is a short kebab-case-or-plain-words tag like "weekend-warmer", "morning-warmer", "tag: vulnerable", "trending down", "gap unusual". Keep it under 30 chars.`;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'no_api_key' }, { status: 503 });
    }

    const body: PromptsRequest = await req.json();
    if (!body.patterns || !Array.isArray(body.patterns)) {
      return NextResponse.json({ error: 'bad_payload' }, { status: 400 });
    }
    if (body.patterns.length === 0) {
      return NextResponse.json({ questions: [] });
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
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

    return NextResponse.json(JSON.parse(match[0]));
  } catch (err) {
    console.error('Prompts error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
