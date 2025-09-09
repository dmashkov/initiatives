'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Status = 'submitted' | 'in_review' | 'approved' | 'rejected';

type Initiative = {
  id: string;
  title: string;
  description: string;
  category: string | null;
  status: Status | string;
  created_at: string;
  author?: { email?: string | null } | null;
};

type Comment = {
  id: string;
  body: string;
  created_at: string;
  author?: { email?: string | null } | null;
};

type History = {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_at: string;
  changed_by?: { email?: string | null } | null;
};

type Attachment = {
  id: string;
  path: string;
  mime_type: string | null;
  size_bytes: number | null;
};

export default function InitiativePage() {
  const params = useParams<{ id: string }>();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const [it, setIt] = useState<Initiative | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!id) return;

    (async () => {
      // Инициатива + автор
      const { data: init } = await supabase
        .from('initiatives')
        .select('id,title,description,category,status,created_at, author:app_users(email)')
        .eq('id', id as string)
        .maybeSingle();
      setIt((init as unknown as Initiative) ?? null);

      // Комментарии
      const { data: cmts } = await supabase
        .from('initiative_comments')
        .select('id,body,created_at, author:app_users(email)')
        .eq('initiative_id', id as string)
        .order('created_at', { ascending: true });
      setComments(((cmts ?? []) as Comment[]));

      // История статусов
      const { data: hist } = await supabase
        .from('initiative_status_history')
        .select('id,from_status,to_status,changed_at, changed_by:app_users(email)')
        .eq('initiative_id', id as string)
        .order('changed_at', { ascending: true });
      setHistory(((hist ?? []) as History[]));

      // Вложения
      const { data: atts } = await supabase
        .from('initiative_attachments')
        .select('id, path, mime_type, size_bytes')
        .eq('initiative_id', id as string)
        .order('uploaded_at', { ascending: true });

      const list = ((atts ?? []) as Attachment[]);
      setAttachments(list);

      // Подписанные ссылки (на 1 час)
      const links: Record<string, string> = {};
      for (const a of list) {
        const { data: urlData } = await supabase
          .storage
          .from('attachments')
          .createSignedUrl(a.path, 3600);
        if (urlData?.signedUrl) links[a.id] = urlData.signedUrl;
      }
      setSigned(links);

      setLoading(false);
    })();
  }, [id]);

  if (loading) return <p style={{ padding: 24, fontFamily: 'system-ui' }}>Загрузка…</p>;
  if (!it) return <p style={{ padding: 24, fontFamily: 'system-ui' }}>Инициатива не найдена.</p>;

  return (
    <div style={{ maxWidth: 900, margin: '24px auto', fontFamily: 'system-ui' }}>
      <p><Link href="/admin">← Назад к списку</Link></p>

      <h1>{it.title}</h1>
      <p><b>Автор:</b> {it.author?.email ?? '—'}</p>
      <p><b>Статус:</b> {it.status}</p>
      <p><b>Категория:</b> {it.category ?? '—'}</p>
      <p><b>Создано:</b> {new Date(it.created_at).toLocaleString()}</p>

      <h3 style={{ marginTop: 24 }}>Описание</h3>
      <p style={{ whiteSpace: 'pre-wrap' }}>{it.description}</p>

      <h3 style={{ marginTop: 24 }}>Вложения</h3>
      {attachments.length === 0 ? (
        <p>Нет приложенных файлов.</p>
      ) : (
        <ul>
          {attachments.map(a => (
            <li key={a.id}>
              {a.mime_type ?? 'file'} • {(a.size_bytes ?? 0) > 0 ? `${Math.round((a.size_bytes ?? 0)/1024)} КБ` : ''}
              {' — '}
              {signed[a.id] ? (
                <a href={signed[a.id]} target="_blank" rel="noreferrer">скачать</a>
              ) : (
                <span>ссылка недоступна</span>
              )}
              <div style={{ fontSize: 12, color: '#666' }}>{a.path}</div>
            </li>
          ))}
        </ul>
      )}

      <h3 style={{ marginTop: 24 }}>История статусов</h3>
      {history.length === 0 ? <p>Пока нет записей.</p> : (
        <ul>
          {history.map(h => (
            <li key={h.id}>
              {new Date(h.changed_at).toLocaleString()} — {h.from_status ?? '—'} → <b>{h.to_status}</b>
              {h.changed_by?.email ? ` (изменил: ${h.changed_by.email})` : ''}
            </li>
          ))}
        </ul>
      )}

      <h3 style={{ marginTop: 24 }}>Комментарии</h3>
      {comments.length === 0 ? <p>Пока нет комментариев.</p> : (
        <ul>
          {comments.map(c => (
            <li key={c.id}>
              <b>{c.author?.email ?? '—'}</b> · {new Date(c.created_at).toLocaleString()}
              <div style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
