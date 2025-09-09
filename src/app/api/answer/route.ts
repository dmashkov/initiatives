import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Тот же порог, что и в БД
const MIN_SIM = 0.78;

type Ctx = { initiative_id: string; content: string; similarity: number };

export async function POST(req: NextRequest) {
  try {
    const { question, contexts } = (await req.json()) as {
      question?: string;
      contexts?: Ctx[];
    };

    const q = (question ?? '').trim();
    if (!q) return NextResponse.json({ error: 'question is required' }, { status: 400 });

    const ctx: Ctx[] = Array.isArray(contexts) ? contexts : [];

    // фильтруем и ограничиваем цитируемый контекст
    const strong = ctx.filter(c => (c.similarity ?? 0) >= MIN_SIM).slice(0, 6);

    if (strong.length === 0) {
      // Чёткий, человеко-понятный ответ без галлюцинаций
      return NextResponse.json({
        answer:
          'Недостаточно информации по вопросу в базе инициатив. Уточните формулировку или воспользуйтесь поиском по сайту.',
      });
    }

    // Готовим компактный контекст
    const numbered = strong.map((c, i) => {
      const head = c.content.replace(/\s+/g, ' ').slice(0, 1200); // safety
      return `[#${i + 1}] /initiatives/${c.initiative_id}\n${head}`;
    });

    const system = [
      'Ты помощник по базе "Инициатив".',
      'Отвечай ТОЛЬКО на основе приведённых сниппетов.',
      'Если сведений недостаточно — прямо скажи об этом и предложи уточнить запрос.',
      'В конце, если уместно, укажи источники в формате [#N].',
    ].join(' ');

    const user = `Вопрос: ${q}\n\nКонтекст:\n${numbered.join('\n\n')}\n\nНапомню: если контекст не покрывает вопрос — ответь, что данных недостаточно.`;

    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const answer =
      r.choices?.[0]?.message?.content?.trim() ||
      'Недостаточно информации в доступных фрагментах.';

    return NextResponse.json({ answer });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
