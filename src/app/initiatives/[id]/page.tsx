'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

export default function InitiativePage() {
  const params = useParams();            // { id: '...' }
  const id = params?.id;
  const [it, setIt] = useState(null);
  const [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    (async () => {
      // Инициатива + email автора
      const { data: init } = await supabase
        .from('initiatives')
        .select('id,title,description,category,status,created_at, author:app_users(email)')
        .eq('id', id)
        .maybeSingle();
      setIt(init ?? null);

      // Комментарии
      const { data: cmts } = await supabase
        .from('initiative_comments')
        .select('id,body,created_at, author:app_users(email)')
        .eq('initiative_id', id)
        .order('created_at', { ascending: true });
      setComments(cmts ?? []);

      // История статусов
      const { data: hist } = await supabase
        .from('initiative_status_history')
        .select('id,from_status,to_status,changed_at, changed_by:app_users(email)')
        .eq('initiative_id', id)
        .order('changed_at', { ascending: true });
      setHistory(hist ?? []);

      setLoading(false);
    })();
  }, [id]);

  if (loading) return <p style={{ padding: 24, fontFamily: 'system-ui' }}>Загрузка…</p>;
  if (!it)     return <p style={{ padding: 24, fontFamily: 'system-ui' }}>Инициатива не найдена.</p>;

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
