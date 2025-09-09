import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { q } = (await req.json()) as { q?: string };
    const text = (q ?? '').trim();
    if (!text) return NextResponse.json({ error: 'q required' }, { status: 400 });

    const r = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    const embedding = r.data?.[0]?.embedding;
    if (!embedding) return NextResponse.json({ error: 'no embedding' }, { status: 500 });

    return NextResponse.json({ embedding });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
