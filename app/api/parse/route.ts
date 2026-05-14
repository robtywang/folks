import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { TAG_VOCABULARY, type ParseResponse } from '@/types';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ParseRequest {
  text: string;
  existingPeople: Array<{
    name: string;
    relationship?: string;
    entryCount: number;
    avgSentiment: number;
  }>;
  corrections?: Array<{
    text: string;
    aiSaid: string | null;
    userSaid: string | null;
  }>;
}

function buildPrompt(
  text: string,
  existingPeople: ParseRequest['existingPeople'],
  corrections: NonNullable<ParseRequest['corrections']> = []
): string {
  const peopleList = existingPeople.length === 0
    ? '(none yet — this is the user\'s first or earliest entries)'
    : existingPeople
        .map(
          (p) =>
            `- ${p.name}${p.relationship ? ` (${p.relationship}, ` : ' ('}${p.entryCount} entries, avg sentiment ${p.avgSentiment.toFixed(1)})`
        )
        .join('\n');

  const correctionsBlock =
    corrections.length === 0
      ? ''
      : `\nPRIOR CORRECTIONS (the AI got these wrong; the user fixed them — apply the same kind of judgment here):\n${corrections
          .map((c) => {
            const aiPart = c.aiSaid ? `"${c.aiSaid}"` : 'solo';
            const userPart = c.userSaid ? `"${c.userSaid}"` : 'solo';
            return `- entry: "${c.text}" → AI said ${aiPart}, user corrected to ${userPart}`;
          })
          .join('\n')}\n`;

  return `You parse entries for a friends-tracker app where users log interactions with people in their lives.

EXISTING PEOPLE IN USER'S CIRCLE:
${peopleList}
${correctionsBlock}
USER'S ENTRY:
"${text}"

Return JSON only, no preamble:
{
  "primary_person": "<existing name from list>" | "<new name>" | null,
  "is_new_person": boolean,
  "confidence": <0.0 to 1.0>,
  "is_solo": boolean,
  "sentiment": <integer 1-10>,
  "severity": <integer 0 | 1 | 2 | 3>,
  "tags": [<from fixed vocabulary, max 3>],
  "additional_people": [<other people mentioned secondarily>],
  "context_summary": "<short phrase capturing the moment>"
}

Tag vocabulary (use these exact strings only):
${TAG_VOCABULARY.join(', ')}

Rules:
- If the entry is about the user alone (no specific person), set primary_person: null, is_solo: true
- If primary_person matches an existing person (even partially — "Mikey" matches "Mike"), use the existing name
- If primary_person is a new name not in the list, set is_new_person: true
- Sentiment: 1-3 negative/draining, 4-6 neutral, 7-10 positive/warm
- Return empty tags array if unsure
- Confidence reflects how certain you are about the person attribution
- Severity rates the harm the OTHER PERSON caused, not the user's reaction:
    0 — normal entry, no harmful action (default — use this for the vast majority of entries)
    1 — mild conflict: verbal slights, minor disagreements, friction
    2 — trust violation: lying, manipulation, ghosting after vulnerability, breaking a meaningful promise
    3 — severe harm: physical violence, abuse, severe betrayal, threatening behavior
  Default to 0 unless the entry clearly describes the other person doing harm. Solo entries: severity 0.`;
}

export async function POST(req: NextRequest) {
  try {
    const body: ParseRequest = await req.json();

    if (!body.text || body.text.trim().length === 0) {
      return NextResponse.json({ error: 'Empty text' }, { status: 400 });
    }

    // 503 signals "no API key configured" so the client can fall back to the
    // mock parser for offline dev. Any other failure stays a 5xx and surfaces.
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'no_api_key' }, { status: 503 });
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: buildPrompt(body.text, body.existingPeople, body.corrections),
        },
      ],
    });

    const responseText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    // Extract JSON from response (handle possible markdown fences)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'No JSON in response', raw: responseText },
        { status: 500 }
      );
    }

    const parsed: ParseResponse = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error('Parse error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
