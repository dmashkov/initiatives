import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chunkText } from '@/lib/chunk';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const { initiativeId } = (await req.json()) as { initiativeId: string };
  if (!initiativeId) return NextResponse.json({ error: 'initiativeId required' }, { status: 400 });

  // текущий пользователь (для проверки прав)
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set() {}, remove() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabaseAdmin
    .from('app_users')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!me) return NextResponse.json({ error: 'User not found' }, { status: 403 });
  const isAdmin = me.role === 'admin';

  const { data: ini } = await supabaseAdmin
    .from('initiatives')
    .select('id, title, description, author_id')
    .eq('id', initiativeId)
    .maybeSingle();

  if (!ini) return NextResponse.json({ error: 'Initiative not found' }, { status: 404 });
  if (!isAdmin && ini.author_id !== me.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // очищаем старые чанки
  await supabaseAdmin.from('doc_chunks').delete().eq('initiative_id', initiativeId);

  // 1) индексируем заголовок+описание
  const baseText = `${ini.title}\n\n${ini.description}`;
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

  // 2) индексируем текстовые вложения (txt/md/json)
  const { data: atts } = await supabaseAdmin
    .from('initiative_attachments')
    .select('path, mime_type')
    .eq('initiative_id', initiativeId);

  const textLike = (mime: string | null) =>
    !!mime && (mime.startsWith('text/') || mime.includes('markdown') || mime.includes('json'));

  if (atts && atts.length) {
    const chunks: string[] = [];
    for (const a of atts) {
      if (!textLike(a.mime_type)) continue;
      const { data: signed } = await supabaseAdmin
        .storage.from('attachments')
        .createSignedUrl(a.path, 600);
      if (!signed?.signedUrl) continue;
      const resp = await fetch(signed.signedUrl);
      const txt = await resp.text();
      chunks.push(...chunkText(txt, 1000, 150));
    }
    if (chunks.length) {
      const emb2 = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: chunks,
      });
      const offset = baseChunks.length;
      const rows2 = chunks.map((content, i) => ({
        initiative_id: initiativeId,
        source: 'attachment' as const,
        chunk_index: offset + i,
        content,
        embedding: emb2.data[i].embedding as unknown as number[],
      }));
      const { error } = await supabaseAdmin.from('doc_chunks').insert(rows2);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
