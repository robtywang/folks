import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    aiReady: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
