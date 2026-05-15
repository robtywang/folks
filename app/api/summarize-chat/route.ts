import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface SummarizeChatRequest {
  /** Just the user-role thoughts from the chat, in order. */
  messages: string[];
}

/**
 * Compile a series of in-the-moment chat thoughts into a single coherent
 * journal entry. Reads in first-person, preserves the user's voice, captures
 * what happened + how they felt. The user gets to edit before saving.
 */
function buildPrompt(messages: string[]): string {
  const joined = messages.map((m, i) => `${i + 1}. ${m}`).join('\n');
  return `The user just had a chat session venting about something going on. Below are the things they said, in order — fragments, half-thoughts, the way you'd text a friend at night.

Compile these into a single first-person journal entry AND lightly clean up grammar, punctuation, and obvious typos along the way. The goal: keep the user's voice exactly, but make the final text read smoothly as a journal entry rather than as text fragments.

THEIR THOUGHTS (in order):
${joined}

Return JSON only, no preamble:
{
  "content": "<the compiled and lightly grammar-fixed journal entry — single paragraph by default, no line breaks unless meaningful>"
}

Rules:
- First-person. Preserve "i" / "me" / "my" exactly as in their messages.
- Lowercase by default unless they used capitals (names always keep their case; "I" if they capitalized it).
- LIGHT grammar + punctuation cleanup: fix obvious typos, add missing commas / periods, capitalize after periods if appropriate, fix dropped articles ("a", "the") that read weirdly. Do NOT rewrite sentences. Do NOT change word choice.
- Smooth the flow — fragments → connected sentences — without inventing details.
- Keep the same names, same events, same emotional tone.
- Don't add reassurance. Don't add advice. Don't conclude with a moral.
- If they repeated something, dedupe naturally.
- ~50-150 words typically. A long chat can be longer; a short one shorter.`;
}

export async function POST(req: NextRequest) {
  try {
    const body: SummarizeChatRequest = await req.json();
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: 'no_messages' }, { status: 400 });
    }

    // Trivial case: single short message — return it as-is, no LLM call.
    const cleaned = body.messages.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      return NextResponse.json({ error: 'empty' }, { status: 400 });
    }
    if (cleaned.length === 1 && cleaned[0]!.length < 80) {
      return NextResponse.json({ content: cleaned[0] });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      // Graceful fallback — concat with newlines.
      return NextResponse.json({ content: cleaned.join(' ') });
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{ role: 'user', content: buildPrompt(cleaned) }],
    });

    const text =
      message.content[0].type === 'text' ? message.content[0].text : '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ content: cleaned.join(' ') });
    }

    const parsed = JSON.parse(match[0]) as { content?: string };
    if (!parsed.content || typeof parsed.content !== 'string') {
      return NextResponse.json({ content: cleaned.join(' ') });
    }
    return NextResponse.json({ content: parsed.content });
  } catch (err) {
    console.error('summarize-chat error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
