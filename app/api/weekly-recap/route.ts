import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface WeeklyRecapRequest {
  weekStart: number; // unix ms, last Sunday 00:00 local
  /** Pre-aggregated stats so Opus phrases observed facts, not invents them. */
  stats: {
    totalEntries: number;
    peopleMentioned: number;
    avgSentiment: number;
    topPeople: Array<{
      name: string;
      entryCount: number;
      avgSentiment: number;
      lastSeenDaysAgo: number;
      gapNotable?: string; // e.g. "first time mentioning in 3 weeks"
    }>;
  };
  /** A small sample of actual entry text for tonal grounding. Capped to 8. */
  entrySample: Array<{
    personName: string | null;
    text: string;
    sentiment: number;
    tags: string[];
    daysAgo: number;
  }>;
  userName?: string | null;
}

function buildPrompt(body: WeeklyRecapRequest): string {
  const { stats, entrySample, userName } = body;

  const topPeopleLines = stats.topPeople
    .map(
      (p) =>
        `- ${p.name}: ${p.entryCount} entries this week, avg sentiment ${p.avgSentiment.toFixed(1)}/10, last seen ${p.lastSeenDaysAgo}d ago${p.gapNotable ? `, ${p.gapNotable}` : ''}`
    )
    .join('\n');

  const sampleLines = entrySample
    .map(
      (e, i) =>
        `${i + 1}. ${e.personName ? `[about ${e.personName.toLowerCase()}]` : '[solo]'} [${e.daysAgo}d ago, sentiment ${e.sentiment}/10, tags: ${
          e.tags.join(', ') || 'none'
        }] "${e.text}"`
    )
    .join('\n');

  return `You write the weekly digest for a friends-tracker journal app. The user gets ONE digest per week, on Sunday morning. It summarises the social shape of the past 7 days based on the entries they logged.

${userName ? `USER: ${userName}\n` : ''}WEEK STATS (pre-computed — these are facts):
- ${stats.totalEntries} entries logged this week
- ${stats.peopleMentioned} people mentioned
- average sentiment across all entries: ${stats.avgSentiment.toFixed(1)} / 10

TOP MENTIONED PEOPLE THIS WEEK:
${topPeopleLines}

ENTRY SAMPLE (for tonal grounding, do NOT quote directly):
${sampleLines}

Return JSON only, no preamble:
{
  "content": "<the full recap, plain text, 4-7 short lines>"
}

STRUCTURE the recap as:
1. Opening: 1-2 sentences about the week's social shape (count + tone + who was on the user's mind most).
2. 2-3 per-friend observations for the top mentioned people, each as an IMPLICIT-PROMPT observation. "first time mentioning marcus in 3 weeks" — not "you should text marcus." "all warmth this week with sarah" — not "keep that going."
3. Closing: one short observational line that holds the week.

VOICE (CRITICAL):
- Lowercase, italic-prose tone. Co-Star / Letterboxd brevity.
- Observational, never advisory. Never therapy-speak.
- Never use "you should..." or imperatives.
- Use first names in lowercase.
- One observation per line. Newlines between sections.
- Do not enumerate (no "1.", "2."). Each line stands on its own.
- ~40-100 chars per line. The whole digest should feel quiet.
- Don't invent. If the stats say someone was the most mentioned, write that. Don't speculate beyond what the numbers + sample show.`;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'no_api_key' }, { status: 503 });
    }

    const body: WeeklyRecapRequest = await req.json();

    if (!body.stats || body.stats.totalEntries < 3) {
      return NextResponse.json({ error: 'not_enough_entries' }, { status: 400 });
    }

    const message = await client.messages.create({
      model: 'claude-opus-4-7',
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
    console.error('Weekly recap error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
