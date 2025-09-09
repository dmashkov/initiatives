import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chunkText } from '@/lib/chunk';
import OpenAI from 'openai';

export const runtime = 'nodejs'; // на Netlify так надёжнее

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const { initiativeId } = (await req.json()) as { initiativeId?: string };
  if (!initiativeId) {
    return NextResponse.json({ error: 'initiativeId required' }, { status: 400 });
  }

  // ❗️ cookies() — асинхронная в вашей сборке
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          const v = cookieStore.get(name);
          return v?.value;
        },
        // set/remove не нужны в этом эндпоинте
        set() {},
        remove() {},
      },
    }
  );

  // проверяем пользователя
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me, error: meErr } = await supabaseAdmin
    .from('app_users')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500 });
  if (!me) return NextResponse.json({ error: 'User not found' }, { status: 403 });

  const isAdmin = me.role === 'admin';

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

  // очищаем предыдущие чанки
  await supabaseAdmin.from('doc_chunks').delete().eq('initiative_id', initiativeId);

  // --- 1) заголовок+описание
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

  // --- 2) текстовые вложения (txt/md/json)
  const { data: atts, error: attsErr } = await supabaseAdmin
    .from('initiative_attachments')
    .select('path, mime_type')
    .eq('initiative_id', initiativeId);

  if (attsErr) return NextResponse.json({ error: attsErr.message }, { status: 500 });

  const textLike = (mime: string | null) =>
    !!mime && (mime.startsWith('text/') || mime.includes('markdown') || mime.includes('json'));

  const chunks: string[] = [];
  for (const a of (atts ?? [])) {
    if (!textLike(a.mime_type)) continue;
    const { data: signed, error: signErr } = await supabaseAdmin
      .storage.from('attachments')
      .createSignedUrl(a.path, 600);
    if (signErr || !signed?.signedUrl) continue;

    const resp = await fetch(signed.signedUrl);
    const txt = await resp.text();
    chunks.push(...chunkText(txt, 1000, 150));
  }

  if (chunks.length) {
    const emb2 = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: chunks,
    });
    const rows2 = chunks.map((content, i) => ({
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
