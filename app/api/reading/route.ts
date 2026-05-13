import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { READING_CATEGORIES } from '@/lib/reading';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ReadingRequest {
  person: {
    name: string;
    closenessScore: number;
    closenessTrend: number;
    avgSentiment: number;
    entryCount: number;
    currentRelationship?: string;
    userContext?: string | null;
  };
  entries: Array<{
    text: string;
    sentiment: number;
    tags: string[];
    daysAgo: number;
  }>;
}

function buildPrompt(body: ReadingRequest): string {
  const { person, entries } = body;

  const entryLines = entries
    .map(
      (e, i) =>
        `${i + 1}. [${e.daysAgo}d ago, sentiment ${e.sentiment}/10, tags: ${
          e.tags.join(', ') || 'none'
        }] "${e.text}"`
    )
    .join('\n\n');

  return `You generate "readings" for a friends-tracker app. A reading has three parts: (1) a category label, (2) a short observational summary, (3) a list of short "inferences" — behavioral patterns you can read from the entries (like "coffee buddy", "running partner", "venting friend").

PERSON: ${person.name}
- ${person.entryCount} entries logged
- average sentiment: ${person.avgSentiment.toFixed(1)} / 10
- closeness score: ${person.closenessScore.toFixed(1)} / 10
- recent trend: ${person.closenessTrend.toFixed(2)}
${person.currentRelationship ? `- current category: ${person.currentRelationship}` : ''}
${person.userContext ? `\nUSER-PROVIDED CONTEXT (the user wrote this themselves about ${person.name}):\n"${person.userContext}"\n` : ''}

ENTRIES (most recent first):
${entryLines}

Return JSON only, no preamble:
{
  "category": "<one of: ${READING_CATEGORIES.join(', ')}>",
  "summary": "<1–3 sentences, lowercase, observational, in a quiet literary voice>",
  "inferences": [<2-4 short behavioral patterns, lowercase, like "coffee buddy", "weekend hang", "supportive listener". empty array if not enough data.>]
}

Rules:
- Category reflects the actual relational dynamic, not what the user might call them.
- "something more" is for relationships edging toward romantic/intimate but unestablished.
- "complicated" is for genuinely mixed sentiment, not just one bad day.
- "drifting" is for a clear recent decline.
- If USER-PROVIDED CONTEXT is given, weight it heavily — the user knows things you don't (their actual relation, history, names of people involved).
- Summary tone: observational, gentle, Co-Star / Letterboxd brevity. Never advisory ("you should..."). Never therapy-speak.
- Inferences should be specific patterns visible in the entries — activities they do together, communication patterns, recurring contexts. 2-4 items, lowercase, terse.
- Use the person's first name in lowercase in the summary.
- Don't quote the entries directly — paraphrase.`;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'no_api_key' }, { status: 503 });
    }

    const body: ReadingRequest = await req.json();

    if (!body.entries || body.entries.length === 0) {
      return NextResponse.json({ error: 'no_entries' }, { status: 400 });
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
    console.error('Reading error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
