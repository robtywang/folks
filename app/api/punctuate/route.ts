import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface PunctuateRequest {
  text: string;
}

const SYSTEM_PROMPT = `You clean up voice transcripts. The input is raw words from speech recognition with no punctuation or capitalization. Your job: return the exact same words with appropriate punctuation, capitalization, and sentence breaks.

RULES:
- Preserve every word. Do not add, remove, or rephrase words.
- Capitalize the first letter of each sentence.
- Capitalize proper nouns (people's names, places, brand names).
- Add commas, periods, and question marks where natural.
- Keep contractions (don't → don't, I'm → I'm).
- Keep the user's lowercase aesthetic for casual words.
- Return ONLY the punctuated text — no preamble, no explanation, no quotes around it.`;

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

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
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
