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
  entries: Array<{
    text: string;
    sentiment: number;
    tags: string[];
    daysAgo: number;
    weekday: string; // 'mon' | 'tue' | ...
    hour: number; // 0–23
  }>;
}

function buildPrompt(body: InsightsRequest): string {
  const { person, entries } = body;
  const entryLines = entries
    .map(
      (e, i) =>
        `${i + 1}. [${e.daysAgo}d ago, ${e.weekday} ${e.hour}:00, sentiment ${e.sentiment}/10, tags: ${
          e.tags.join(', ') || 'none'
        }] "${e.text}"`
    )
    .join('\n');

  return `You generate concise behavioural insight cards for a friends-tracker app.

Given entries about ${person.name}, return 2–3 short observational insights about patterns you can see. Each insight is one sentence, lowercase, observational, in a quiet literary voice — like a Co-Star reading.

PERSON: ${person.name}
- ${person.entryCount} entries logged
- avg sentiment ${person.avgSentiment.toFixed(1)} / 10
${person.userContext ? `\nUSER-PROVIDED CONTEXT:\n"${person.userContext}"\n` : ''}

ENTRIES (most recent first):
${entryLines}

Return JSON only, no preamble:
{
  "insights": [
    "<one-sentence observation, ~60-100 chars, lowercase>",
    "<another>",
    "<optional third>"
  ]
}

Rules:
- Each insight surfaces a PATTERN, not a single moment. e.g. "${person.name} is most energizing on weekends" not "${person.name} was fun on saturday."
- Patterns to look for: day-of-week sentiment, time-of-day sentiment, recurring tag combos, sentiment trajectory, response to specific contexts (work / family / dating / etc.), gaps between entries.
- Never advisory ("you should reach out"). Never therapy-speak. Just observation.
- Use the person's first name in lowercase.
- If you genuinely can't see 3 patterns, return 2. If not even 2, return 1. Don't invent.
- Don't quote entries directly — paraphrase.
- Skip insights that just restate the average sentiment.`;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'no_api_key' }, { status: 503 });
    }

    const body: InsightsRequest = await req.json();
    if (!body.entries || body.entries.length < 3) {
      return NextResponse.json({ error: 'not_enough_entries' }, { status: 400 });
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
