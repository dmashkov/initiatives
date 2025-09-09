'use client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import FeedbackForm from '@/components/FeedbackForm';

type Status = 'submitted' | 'in_review' | 'approved' | 'rejected';

type Initiative = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: Status;
  created_at: string;
  author_id: string | null;
  author_email?: string | null;
};

type Attachment = {
  id: string;
  path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
};

export default function InitiativeDetailsPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [it, setIt] = useState<Initiative | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [signedUrlById, setSignedUrlById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    (async () => {
      setLoading(true);
      setErrorMsg(null);

      // 1) инициатива
      const { data: row, error } = await supabase
        .from('initiatives')
        .select('id, title, description, category, status, created_at, author_id')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }
      if (!row) {
        setErrorMsg('Инициатива не найдена');
        setLoading(false);
        return;
      }

      // 2) email автора
      let authorEmail: string | null = null;
      if (row.author_id) {
        const { data: au } = await supabase
          .from('app_users')
          .select('email')
          .eq('id', row.author_id)
          .maybeSingle();
        authorEmail = au?.email ?? null;
      }

      setIt({ ...row, author_email: authorEmail } as Initiative);

      // 3) вложения
      const { data: atts, error: attErr } = await supabase
        .from('initiative_attachments')
        .select('id, path, mime_type, size_bytes, uploaded_at')
        .eq('initiative_id', id)
        .order('uploaded_at', { ascending: true });

      if (!attErr && atts) {
        const list = atts as Attachment[];
        setAttachments(list);

        const links: Record<string, string> = {};
        for (const a of list) {
          const { data: urlData } = await supabase
            .storage
            .from('attachments')
            .createSignedUrl(a.path, 3600);
          if (urlData?.signedUrl) links[a.id] = urlData.signedUrl;
        }
        setSignedUrlById(links);
      }

      setLoading(false);
    })();
  }, [id]);

  if (loading) return <p style={{ padding: 24, fontFamily: 'system-ui' }}>Загрузка…</p>;

  if (errorMsg) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui' }}>
        <nav style={{ marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/dashboard">← Личный кабинет</Link>
          <Link href="/search">Поиск</Link>
          <Link href="/ask">AI-помощник</Link>
          <Link href="/admin">Админка</Link>
          <Link href="/feedback">Обратная связь</Link>
        </nav>
        <h1>Детали инициативы</h1>
        <p style={{ color: '#DC2626' }}>Ошибка: {errorMsg}</p>
      </div>
    );
  }

  if (!it) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui' }}>
        <nav style={{ marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/dashboard">← Личный кабинет</Link>
          <Link href="/search">Поиск</Link>
          <Link href="/ask">AI-помощник</Link>
          <Link href="/admin">Админка</Link>
          <Link href="/feedback">Обратная связь</Link>
        </nav>
        <h1>Детали инициативы</h1>
        <p>Запись не найдена.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: '24px auto', fontFamily: 'system-ui' }}>
      <nav style={{ marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => router.back()}>← Назад</button>
        <Link href="/dashboard">ЛК</Link>
        <Link href="/search">Поиск</Link>
        <Link href="/ask">AI-помощник</Link>
        <Link href="/admin">Админка</Link>
        <Link href="/feedback">Обратная связь</Link>
      </nav>

      <h1 style={{ marginBottom: 4 }}>{it.title}</h1>
      <div style={{ color: '#6B7280', marginBottom: 16 }}>
        Создано: {new Date(it.created_at).toLocaleString()}
        {' · '}Статус: <b>{it.status}</b>
        {it.category ? <> {' · '}Категория: {it.category}</> : null}
        {it.author_email ? <> {' · '}Автор: {it.author_email}</> : null}
      </div>

      <section style={{ marginBottom: 24 }}>
        <h3>Описание</h3>
        <div style={{ whiteSpace: 'pre-wrap' }}>{it.description || '—'}</div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3>Вложения</h3>
        {attachments.length === 0 ? (
          <p>Нет файлов.</p>
        ) : (
          <ul>
            {attachments.map((a) => (
              <li key={a.id} style={{ marginBottom: 8 }}>
                {a.mime_type ?? 'file'} •{' '}
                {(a.size_bytes ?? 0) > 0 ? `${Math.round((a.size_bytes ?? 0) / 1024)} КБ` : '—'}{' '}
                — {new Date(a.uploaded_at).toLocaleString()}
                {' — '}
                {signedUrlById[a.id] ? (
                  <a href={signedUrlById[a.id]} target="_blank" rel="noreferrer">скачать</a>
                ) : (
                  <span>ссылка недоступна</span>
                )}
                <div style={{ fontSize: 12, color: '#666' }}>{a.path}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* -------- ФОРМА ОБРАТНОЙ СВЯЗИ -------- */}
      <section style={{ marginTop: 32 }}>
        <h3>Обратная связь по инициативе</h3>
        <p style={{ marginTop: 4, color: '#6B7280' }}>
          Поделитесь идеей, укажите проблему или задайте вопрос. Ваше сообщение увидит команда.
        </p>
        <FeedbackForm initiativeId={it.id} compact />
      </section>
      {/* -------------------------------------- */}
    </div>
  );
}
