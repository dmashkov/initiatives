import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chunkText } from '@/lib/chunk';
import OpenAI from 'openai';

export const runtime = 'nodejs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
  const { initiativeId } = (await request.json()) as { initiativeId?: string };
  if (!initiativeId) {
    return NextResponse.json({ error: 'initiativeId required' }, { status: 400 });
  }

  // Читаем Bearer-токен из заголовка Authorization
  const auth = request.headers.get('authorization') || request.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Auth session missing!' }, { status: 401 });
  }

  // Проверяем токен и получаем пользователя
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: userErr?.message || 'Unauthorized' }, { status: 401 });
  }
  const user = userData.user;

  // Роль/права
  const { data: me, error: meErr } = await supabaseAdmin
    .from('app_users')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500 });
  if (!me) return NextResponse.json({ error: 'User not found' }, { status: 403 });
  const isAdmin = me.role === 'admin';

  // Проверяем инициативу
  const { data: ini, error: iniErr } = await supabaseAdmin
    .from('initiatives')
    .select('id, title, description, author_id')
    .eq('id', initiativeId)
    .maybeSingle();
  if (iniErr) return NextResponse.json({ error: iniErr.message }, { status: 500 });
  if (!ini) return NextResponse.json({ error: 'Initiative not found' }, { status: 404 });
  if (!isAdmin && ini.author_id !== me.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Чистим прошлый индекс
  await supabaseAdmin.from('doc_chunks').delete().eq('initiative_id', initiativeId);

  // 1) Индексируем заголовок+описание
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2) Индексируем текстовые вложения
  const { data: atts, error: attsErr } = await supabaseAdmin
    .from('initiative_attachments')
    .select('path, mime_type')
    .eq('initiative_id', initiativeId);
  if (attsErr) return NextResponse.json({ error: attsErr.message }, { status: 500 });

  const isTextLike = (mime: string | null) =>
    !!mime && (mime.startsWith('text/') || mime.includes('markdown') || mime.includes('json'));

  const allChunks: string[] = [];
  for (const a of atts ?? []) {
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
