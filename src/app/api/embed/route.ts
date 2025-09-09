import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const { q } = (await req.json()) as { q: string };
  if (!q || !q.trim()) return NextResponse.json({ error: 'q required' }, { status: 400 });

  const emb = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: q.trim(),
  });

  return NextResponse.json({ embedding: emb.data[0].embedding });
}
