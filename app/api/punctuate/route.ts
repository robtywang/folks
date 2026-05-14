import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface PunctuateRequest {
  text: string;
  /** Names already in the user's circle. Lets the model correct obvious
   *  speech-recognition mistakes ("ran" → "Fran") instead of preserving them. */
  knownNames?: string[];
}

function buildSystem(knownNames: string[]): string {
  const namesList =
    knownNames.length > 0
      ? `\n\nKNOWN PEOPLE IN THE USER'S CIRCLE (correct misheard transcriptions against this list when it's clearly the same name — e.g. "ran" → "Fran", "may" → "Maya", "saraah" → "Sarah"):\n${knownNames.map((n) => `- ${n}`).join('\n')}\n`
      : '';

  return `You clean up voice transcripts. The input is raw words from speech recognition with no punctuation or capitalization. Your job: return the same content with appropriate punctuation, capitalization, sentence breaks, and obvious-error corrections.

RULES:
- Add punctuation: commas, periods, question marks where natural.
- Capitalize the first letter of each sentence.
- Capitalize proper nouns (people's names, places, brand names).
- Keep contractions intact.
- Preserve the user's casual register — don't formalize.
- If a known person's name is clearly mis-transcribed (the list below), correct it.
- DO NOT add new words, paraphrase, or change the user's meaning. Corrections are limited to: (a) punctuation, (b) capitalization, (c) name correction against the known list.
- Return ONLY the cleaned text — no preamble, no explanation, no quotes around it.${namesList}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'no_api_key' }, { status: 503 });
    }

    const body: PunctuateRequest = await req.json();
    const raw = (body.text ?? '').trim();
    if (!raw) {
      return NextResponse.json({ text: '' });
    }
    // Skip the API call for trivially short inputs — not worth the latency.
    if (raw.length < 10) {
      return NextResponse.json({ text: raw });
    }

    const knownNames = Array.isArray(body.knownNames) ? body.knownNames : [];
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: buildSystem(knownNames),
      messages: [{ role: 'user', content: raw }],
    });

    const text =
      message.content[0].type === 'text' ? message.content[0].text.trim() : raw;

    return NextResponse.json({ text });
  } catch (err) {
    console.error('Punctuate error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
