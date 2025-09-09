// src/app/api/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // нужен сервис-ключ
);

const BUCKET = 'attachments';
const MODEL = 'text-embedding-3-small'; // 1536 dim

function normalize(text: string) {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ') // неразрывные пробелы
    .trim();
}

function chunkText(t: string, size = 900, overlap = 150) {
  const chunks: string[] = [];
  let i = 0;
  while (i < t.length) {
    const end = Math.min(i + size, t.length);
    let cut = end;
    // мягко режем по ближайшему пробелу/точке
    const soft = t.lastIndexOf(' ', end - 20);
    if (soft > i + 200) cut = soft;
    chunks.push(t.slice(i, cut));
    i = cut - overlap;
    if (i < 0) i = 0;
  }
  return chunks.map((c) => c.trim()).filter(Boolean);
}

async function embedBatch(texts: string[]) {
  const res = await openai.embeddings.create({
    model: MODEL,
    input: texts
  });
  return res.data.map((d) => d.embedding as number[]);
}

async function extractAttachmentText(path: string, mime: string | null) {
  const dl = await supabaseAdmin.storage.from(BUCKET).download(path);
  if (dl.error || !dl.data) throw new Error(`download failed: ${path}`);
  const buf = Buffer.from(await dl.data.arrayBuffer());
  const ext = path.toLowerCase();

  if ((mime?.includes('pdf')) || ext.endsWith('.pdf')) {
    const parsed = await pdf(buf);
    return normalize(parsed.text || '');
  }
  if ((mime?.includes('word')) || ext.endsWith('.docx')) {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return normalize(value || '');
  }
  if ((mime?.startsWith('text/')) || ext.endsWith('.txt')) {
    return normalize(buf.toString('utf8'));
  }
  // другие типы пока пропускаем (изображения, xlsx и т.п.)
  return '';
}

export async function POST(req: NextRequest) {
  try {
    // (опционально) поддержим параметры
    const body = await req.json().catch(() => ({}));
    const reindexAll = body?.all === true;

    // 0) Полный reset по запросу
    if (reindexAll) {
      await supabaseAdmin.from('doc_chunks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }

    // 1) все инициативы
    const { data: inits, error: inErr } = await supabaseAdmin
      .from('initiatives')
      .select('id, title, description');
    if (inErr) throw new Error(inErr.message);

    // 2) все вложения
    const { data: atts, error: attErr } = await supabaseAdmin
      .from('initiative_attachments')
      .select('id, initiative_id, path, mime_type');
    if (attErr) throw new Error(attErr.message);

    // 3) Собираем документы для индексации
    type Doc = { initiative_id: string; text: string; source: string };
    const docs: Doc[] = [];

    for (const it of inits ?? []) {
      const base = normalize(`${it.title ?? ''}\n\n${it.description ?? ''}`);
      if (base) docs.push({ initiative_id: it.id, text: base, source: `initiative:${it.id}` });
    }

    for (const a of atts ?? []) {
      try {
        const text = await extractAttachmentText(a.path, a.mime_type);
        if (text) docs.push({
          initiative_id: a.initiative_id,
          text,
          source: `attachment:${a.path}`
        });
      } catch (e) {
        console.warn('extract failed', a.path, e);
      }
    }

    // 4) Чанкуем и индексируем порциями по 64
    let inserted = 0;
    for (const d of docs) {
      const chunks = chunkText(d.text);
      if (chunks.length === 0) continue;

      // эмбеддим батчами
      for (let i = 0; i < chunks.length; i += 64) {
        const part = chunks.slice(i, i + 64);
        const embs = await embedBatch(part);

        const rows = part.map((content, idx) => ({
          initiative_id: d.initiative_id,
          content,
          embedding: embs[idx],
          source: d.source
        }));

        const { error: insErr } = await supabaseAdmin.from('doc_chunks').insert(rows);
        if (insErr) throw new Error(insErr.message);
        inserted += rows.length;
      }
    }

    return NextResponse.json({ ok: true, inserted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
