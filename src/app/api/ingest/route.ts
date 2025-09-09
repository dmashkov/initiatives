import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chunkText } from '@/lib/chunk';
import OpenAI from 'openai';

export const runtime = 'nodejs'; // на Netlify надёжнее node runtime

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
  const { initiativeId } = (await request.json()) as { initiativeId?: string };
  if (!initiativeId) {
    return NextResponse.json({ error: 'initiativeId required' }, { status: 400 });
  }

  // ВАЖНО: создаём ответ-обёртку, чтобы Supabase мог обновить cookies
  const response = new NextResponse();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          // Удаление — это по сути set с пустым значением и макс. сроком в прошлом
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // 1) Текущий пользователь (если токен просрочен, Supabase обновит и положит Set-Cookie в `response`)
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500, headers: response.headers });
  }
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: response.headers });
  }

  // 2) Моя запись и роль
  const { data: me, error: meErr } = await supabaseAdmin
    .from('app_users')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500, headers: response.headers });
  if (!me) return NextResponse.json({ error: 'User not found' }, { status: 403, headers: response.headers });

  const isAdmin = me.role === 'admin';

  // 3) Инициатива
  const { data: ini, error: iniErr } = await supabaseAdmin
    .from('initiatives')
    .select('id, title, description, author_id')
    .eq('id', initiativeId)
    .maybeSingle();
  if (iniErr) return NextResponse.json({ error: iniErr.message }, { status: 500, headers: response.headers });
  if (!ini) return NextResponse.json({ error: 'Initiative not found' }, { status: 404, headers: response.headers });
  if (!isAdmin && ini.author_id !== me.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: response.headers });
  }

  // 4) Чистим прошлый индекс
  await supabaseAdmin.from('doc_chunks').delete().eq('initiative_id', initiativeId);

  // 5) Индексация описания
  const baseText = `${ini.title}\n\n${ini.description ?? ''}`;
  const baseChunks = chunkText(baseText, 1000, 150);
  if (baseChunks.length) {
    const emb = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: baseChunks,
    });
    const rows = baseChunks.map((content, i) => ({
      initiative_id: initiativeId,
      source: 'initiative' as const,
      chunk_index: i,
      content,
      embedding: emb.data[i].embedding as unknown as number[],
    }));
    const { error } = await supabaseAdmin.from('doc_chunks').insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: response.headers });
  }

  // 6) Индексация текстовых вложений
  const { data: atts, error: attsErr } = await supabaseAdmin
    .from('initiative_attachments')
    .select('path, mime_type')
    .eq('initiative_id', initiativeId);
  if (attsErr) return NextResponse.json({ error: attsErr.message }, { status: 500, headers: response.headers });

  const isTextLike = (mime: string | null) =>
    !!mime && (mime.startsWith('text/') || mime.includes('markdown') || mime.includes('json'));

  const allChunks: string[] = [];
  for (const a of (atts ?? [])) {
    if (!isTextLike(a.mime_type)) continue;
    const { data: signed, error: signErr } = await supabaseAdmin
      .storage.from('attachments')
      .createSignedUrl(a.path, 600);
    if (signErr || !signed?.signedUrl) continue;

    const resp = await fetch(signed.signedUrl);
    const txt = await resp.text();
    allChunks.push(...chunkText(txt, 1000, 150));
  }

  if (allChunks.length) {
    const emb2 = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: allChunks,
    });
    const rows2 = allChunks.map((content, i) => ({
      initiative_id: initiativeId,
      source: 'attachment' as const,
      chunk_index: baseChunks.length + i,
      content,
      embedding: emb2.data[i].embedding as unknown as number[],
    }));
    const { error } = await supabaseAdmin.from('doc_chunks').insert(rows2);
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: response.headers });
  }

  // Возвращаем JSON и прокидываем Set-Cookie из `response`
  return NextResponse.json({ ok: true }, { headers: response.headers });
}
