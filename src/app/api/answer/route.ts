import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Ctx = {
  initiative_id: string;
  content: string;
  similarity?: number;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { question?: string; contexts?: Ctx[] };
  const question = (body.question ?? '').trim();
  const contexts = Array.isArray(body.contexts) ? body.contexts : [];

  if (!question) {
    return NextResponse.json({ error: 'question required' }, { status: 400 });
  }

  // Защита от слишком длинного контекста: берём до 10 кусков, сортируем по similarity (если есть)
  const top = contexts
    .slice(0, 50)
    .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
    .slice(0, 10);

  const contextText = top
    .map((c, i) => `[#${i + 1}] (initiative ${c.initiative_id})\n${c.content}`)
    .join('\n\n');

  const sys =
`Ты — помощник, отвечающий кратко и по делу НА РУССКОМ.
Используй ТОЛЬКО предоставленные фрагменты контекста. Если сведений недостаточно — явно скажи об этом.
В конце ответа дай блок "Источники:", перечислив номера фрагментов вида [#1], [#2] и ссылки вида /initiatives/<id> без повторов.`;

  const userPrompt =
`Вопрос: ${question}

Контекстные фрагменты:
${contextText || '(контекста нет)'}
`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: userPrompt },
      ],
    });

    const answer = resp.choices?.[0]?.message?.content?.trim() || 'Нет ответа.';
    return NextResponse.json({ answer });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
