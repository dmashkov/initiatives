import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { message, category, email, page, initiativeId, rating } =
    (await req.json()) as {
      message?: string;
      category?: 'bug'|'idea'|'question'|'other';
      email?: string;
      page?: string;
      initiativeId?: string;
      rating?: number;
    };

  if (!message || message.trim().length < 5) {
    return NextResponse.json({ error: 'Сообщение слишком короткое' }, { status: 400 });
  }

  // Готовим ответ, чтобы Supabase мог обновить куки при необходимости
  const response = new NextResponse();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) =>
          response.cookies.set({ name, value, ...options }),
        remove: (name: string, options: CookieOptions) =>
          response.cookies.set({ name, value: '', ...options }),
      },
    }
  );

  // Пытаемся связать отзыв с текущим пользователем (если он вошёл)
  const { data: { user } } = await supabase.auth.getUser();

  const row = {
    author_auth_id: user?.id ?? null,
    email: email ?? null,
    page: page ?? null,
    initiative_id: initiativeId ?? null,
    category: (category ?? 'other') as 'bug'|'idea'|'question'|'other',
    message: message.trim(),
    rating: typeof rating === 'number' ? rating : null,
    meta: null as unknown as Record<string, unknown> | null,
  };

  const { error, data } = await supabase.from('feedback').insert(row).select('id').single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: response.headers });
  }

  // (необязательно) вебхук-уведомление — Slack/Telegram/почта
  const hook = process.env.FEEDBACK_WEBHOOK_URL;
  if (hook) {
    // не блокируем ответ пользователю
    fetch(hook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: `📝 Новый отзыв: ${row.category}\nСообщение: ${row.message}\nСтраница: ${row.page ?? '-'}\nПользователь: ${user?.email ?? email ?? 'гость'}`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, id: data.id }, { headers: response.headers });
}
