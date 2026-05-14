import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface InsightsRequest {
  person: {
    name: string;
    entryCount: number;
    avgSentiment: number;
    userContext?: string | null;
  };
  /** Pre-detected statistical patterns. The model phrases these; it does not find them. */
  patterns: Array<{
    fact: string;
    support: number;
    delta?: number;
  }>;
  /** Small entry sample for tonal context only (not for pattern detection). */
  entrySample: Array<{
    text: string;
    sentiment: number;
    tags: string[];
    daysAgo: number;
    weekday: string;
  }>;
}

function buildPrompt(body: InsightsRequest): string {
  const { person, patterns, entrySample } = body;

  const patternLines = patterns
    .map((p, i) => {
      const supportFrag =
        p.delta !== undefined
          ? ` (n=${p.support}, delta=${p.delta.toFixed(1)})`
          : ` (n=${p.support})`;
      return `${i + 1}. ${p.fact}${supportFrag}`;
    })
    .join('\n');

  const sampleLines = entrySample
    .map(
      (e, i) =>
        `${i + 1}. [${e.daysAgo}d ago, ${e.weekday}, sentiment ${e.sentiment}/10, tags: ${
          e.tags.join(', ') || 'none'
        }] "${e.text}"`
    )
    .join('\n');

  return `You phrase pre-detected behavioural patterns as short observational lines for a friends-tracker app.

CRITICAL: You do NOT find patterns. The statistical analysis has already been done. Your only job is to render the facts below as natural-sounding one-liners. If you state something that isn't in the facts list, you are inventing — do not do this.

PERSON: ${person.name}
- ${person.entryCount} entries logged
- avg sentiment ${person.avgSentiment.toFixed(1)} / 10
${person.userContext ? `\nUSER-PROVIDED CONTEXT:\n"${person.userContext}"\n` : ''}

DETECTED PATTERNS (n = entries supporting the pattern):
${patternLines || '(none — return an empty insights array)'}

ENTRY SAMPLE (tonal context only, NOT for finding new patterns):
${sampleLines}

Return JSON only, no preamble:
{
  "insights": [
    "<one-sentence rendering of pattern 1, ~60-100 chars, lowercase>",
    "<another>",
    "<optional third>"
  ]
}

Rules:
- Render each detected pattern as one short observational line. One pattern → one insight. Maximum 3 insights.
- Use the person's first name in lowercase.
- Acknowledge weak signal when support is low. If n < 5, phrase as "early signal:" or "so far:" instead of as a confident pattern.
- Never advisory ("you should reach out"). Just observation.
- Don't quote entries directly. Paraphrase if you reference one.
- If the patterns list is empty, return an empty insights array. Do not invent.
- Don't restate the average sentiment as an insight.`;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'no_api_key' }, { status: 503 });
    }

    const body: InsightsRequest = await req.json();
    if (!body.patterns || !Array.isArray(body.patterns)) {
      return NextResponse.json({ error: 'bad_payload' }, { status: 400 });
    }

    // Nothing detected locally — don't burn a Claude call.
    if (body.patterns.length === 0) {
      return NextResponse.json({ insights: [] });
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
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
    console.error('Insights error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
