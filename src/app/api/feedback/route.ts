import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type Body = {
  message?: string;
  category?: 'bug' | 'idea' | 'question' | 'other';
  email?: string;
  page?: string;
  initiativeId?: string;
  rating?: number;
};

export async function POST(req: NextRequest) {
  try {
    const { message, category, email, page, initiativeId, rating } = (await req.json()) as Body;

    const text = (message ?? '').trim();
    if (text.length < 5) {
      return NextResponse.json({ error: 'Сообщение слишком короткое (минимум 5 символов).' }, { status: 400 });
    }

    // Создаём обычный supabase-js клиент и пробрасываем Authorization, если пользователь вошёл
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    );

    // Получим пользователя (если в заголовке передан токен)
    const { data: { user } } = await supabase.auth.getUser();

    const row = {
      author_auth_id: user?.id ?? null,
      email: email ?? null,
      page: page ?? null,
      initiative_id: initiativeId ?? null,
      category: (category ?? 'other') as Body['category'],
      message: text,
      rating: typeof rating === 'number' ? rating : null,
      meta: null as unknown as Record<string, unknown> | null,
    };

    const { data, error } = await supabase.from('feedback').insert(row).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // (опционально) Уведомление через вебхук — не блокируем ответ
    const hook = process.env.FEEDBACK_WEBHOOK_URL;
    if (hook) {
      fetch(hook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: `📝 Новый отзыв: ${row.category}\nСообщение: ${row.message}\nСтраница: ${row.page ?? '-'}\nПользователь: ${user?.email ?? row.email ?? 'гость'}`,
        }),
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
