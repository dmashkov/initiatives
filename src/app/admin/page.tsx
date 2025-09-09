'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Status = 'submitted' | 'in_review' | 'approved' | 'rejected';

type Row = {
  id: string;
  title: string;
  status: Status;
  created_at: string;
  author?: { email?: string | null } | null;
};

type Attachment = {
  id: string;
  path: string;
  mime_type: string | null;
  size_bytes: number | null;
};

export default function AdminPage() {
  const router = useRouter();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // вложения
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingAttFor, setLoadingAttFor] = useState<string | null>(null);
  const [attachmentsByInitiative, setAttachmentsByInitiative] = useState<Record<string, Attachment[]>>({});
  const [signedUrlByAttachmentId, setSignedUrlByAttachmentId] = useState<Record<string, string>>({});
  const [deletingAttId, setDeletingAttId] = useState<string | null>(null);

  // RAG
  const [reindexingId, setReindexingId] = useState<string | null>(null);

  const STATUSES: Status[] = ['submitted', 'in_review', 'approved', 'rejected'];

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsAdmin(false); setLoading(false); return; }

      const { data: me } = await supabase
        .from('app_users')
        .select('id, role')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      const admin = me?.role === 'admin';
      setIsAdmin(admin);
      setMyUserId(me?.id ?? null);
      if (!admin) { setLoading(false); return; }

      const { data, error } = await supabase
        .from('initiatives')
        .select('id,title,status,created_at, author:app_users(email)')
        .order('created_at', { ascending: false });

      if (error) {
        alert('Ошибка загрузки: ' + error.message);
        setLoading(false);
        return;
      }
      setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
  }, []);

  async function updateStatus(row: Row, newStatus: Status) {
    if (!myUserId) { alert('Нет прав/идентификатора пользователя.'); return; }
    if (row.status === newStatus) return;

    setBusyId(row.id);

    const { error } = await supabase
      .from('initiatives')
      .update({ status: newStatus })
      .eq('id', row.id);

    if (error) {
      setBusyId(null);
      alert('Не удалось обновить: ' + error.message);
      return;
    }

    const { error: histErr } = await supabase
      .from('initiative_status_history')
      .insert({
        initiative_id: row.id,
        changed_by_user_id: myUserId,
        from_status: row.status,
        to_status: newStatus,
      });

    setBusyId(null);
    if (histErr) console.warn('История не записана:', histErr.message);

    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, status: newStatus } : r)));
  }

  const visible = rows.filter(r => (filter === 'all' ? true : r.status === filter));

  async function toggleAttachments(rowId: string) {
    if (expandedId === rowId) { setExpandedId(null); return; }
    setExpandedId(rowId);

    if (attachmentsByInitiative[rowId]) return; // уже загружены

    setLoadingAttFor(rowId);
    const { data: atts, error } = await supabase
      .from('initiative_attachments')
      .select('id, path, mime_type, size_bytes')
      .eq('initiative_id', rowId)
      .order('uploaded_at', { ascending: true });

    setLoadingAttFor(null);
    if (error) {
      alert('Не удалось загрузить вложения: ' + error.message);
      return;
    }

    const list = (atts ?? []) as Attachment[];
    setAttachmentsByInitiative(prev => ({ ...prev, [rowId]: list }));

    // подписанные ссылки (1 час)
    const links: Record<string, string> = {};
    for (const a of list) {
      const { data: urlData } = await supabase.storage.from('attachments').createSignedUrl(a.path, 3600);
      if (urlData?.signedUrl) links[a.id] = urlData.signedUrl;
    }
    setSignedUrlByAttachmentId(prev => ({ ...prev, ...links }));
  }

  async function deleteAttachment(att: Attachment, initiativeId: string) {
    if (!confirm('Удалить файл окончательно?')) return;
    setDeletingAttId(att.id);

    const { error: remErr } = await supabase.storage.from('attachments').remove([att.path]);
    if (remErr) {
      setDeletingAttId(null);
      alert('Не удалось удалить файл из хранилища: ' + remErr.message);
      return;
    }

    const { error: delErr } = await supabase
      .from('initiative_attachments')
      .delete()
      .eq('id', att.id);

    setDeletingAttId(null);

    if (delErr) {
      alert('Файл удалён из бакета, но запись в БД не удалена: ' + delErr.message);
    }

    setAttachmentsByInitiative(prev => ({
      ...prev,
      [initiativeId]: (prev[initiativeId] ?? []).filter(a => a.id !== att.id),
    }));
    setSignedUrlByAttachmentId(prev => {
      const copy = { ...prev };
      delete copy[att.id];
      return copy;
    });
  }

  async function reindex(initiativeId: string) {
    if (reindexingId) return;
    setReindexingId(initiativeId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const r = await fetch('/api/ingest', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ initiativeId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { error?: string })?.error ?? `HTTP ${r.status}`);
      alert('Переиндексация завершена.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert('Индексирование не удалось: ' + msg);
    } finally {
      setReindexingId(null);
    }
  }

  if (loading) return <p style={{ padding: 24, fontFamily: 'system-ui' }}>Загрузка…</p>;
  if (isAdmin === false) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui' }}>
        <p>Недостаточно прав. <Link href="/dashboard">Вернуться в ЛК</Link></p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto', fontFamily: 'system-ui' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/dashboard">← В личный кабинет</Link>
          <Link href="/search">Поиск</Link>
        </div>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace('/login');
          }}
        >
          Выйти
        </button>
      </nav>

      <h1>Администрирование</h1>

      <div style={{ margin: '12px 0' }}>
        Фильтр:&nbsp;
        <select value={filter} onChange={e => setFilter(e.target.value as 'all' | Status)}>
          <option value="all">все</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={() => router.refresh()} style={{ marginLeft: 12 }}>Обновить</button>
      </div>

      {visible.length === 0 ? <p>Нет записей.</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: 6 }}>Дата</th>
              <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: 6 }}>Автор</th>
              <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: 6 }}>Название</th>
              <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: 6 }}>Статус</th>
              <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: 6 }}>Вложения</th>
              <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: 6 }}>Детали / RAG</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <FragmentWithAttachments
                key={r.id}
                row={r}
                busyId={busyId}
                expandedId={expandedId}
                loadingAttFor={loadingAttFor}
                attachments={attachmentsByInitiative[r.id]}
                signed={signedUrlByAttachmentId}
                deletingAttId={deletingAttId}
                reindexingId={reindexingId}
                onToggle={() => toggleAttachments(r.id)}
                onUpdateStatus={(s) => updateStatus(r, s)}
                onDeleteAtt={(att) => deleteAttachment(att, r.id)}
                onReindex={() => reindex(r.id)}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Вспомогательная строка с разворачиваемым списком вложений */
function FragmentWithAttachments(props: {
  row: Row;
  busyId: string | null;
  expandedId: string | null;
  loadingAttFor: string | null;
  attachments?: Attachment[];
  signed: Record<string, string>;
  deletingAttId: string | null;
  reindexingId: string | null;
  onToggle: () => void;
  onUpdateStatus: (newStatus: Status) => void;
  onDeleteAtt: (a: Attachment) => void;
  onReindex: () => void;
}) {
  const {
    row, busyId, expandedId, loadingAttFor, attachments,
    signed, deletingAttId, reindexingId,
    onToggle, onUpdateStatus, onDeleteAtt, onReindex
  } = props;

  const STATUSES: Status[] = ['submitted', 'in_review', 'approved', 'rejected'];
  const expanded = expandedId === row.id;

  return (
    <>
      <tr>
        <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
          {new Date(row.created_at).toLocaleString()}
        </td>
        <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
          {row.author?.email ?? '—'}
        </td>
        <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{row.title}</td>
        <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
          <select
            value={row.status}
            disabled={busyId === row.id}
            onChange={e => onUpdateStatus(e.target.value as Status)}
          >
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {busyId === row.id && <span style={{ marginLeft: 8 }}>Сохранение…</span>}
        </td>
        <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
          <button onClick={onToggle}>{expanded ? 'Скрыть' : 'Показать'}</button>
          {loadingAttFor === row.id && <span style={{ marginLeft: 8 }}>Загрузка…</span>}
        </td>
        <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
          <Link href={`/initiatives/${row.id}`}>Открыть</Link>
          <button
            onClick={onReindex}
            disabled={reindexingId === row.id}
            style={{ marginLeft: 12 }}
          >
            {reindexingId === row.id ? 'Индексирую…' : 'Индексировать'}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={6} style={{ background: '#fafafa', borderBottom: '1px solid #eee', padding: 12 }}>
            <b>Вложения:</b>
            {!attachments || attachments.length === 0 ? (
              <p style={{ marginTop: 6 }}>Нет файлов.</p>
            ) : (
              <ul style={{ marginTop: 6 }}>
                {attachments.map(a => (
                  <li key={a.id} style={{ marginBottom: 6 }}>
                    {a.mime_type ?? 'file'} • {(a.size_bytes ?? 0) > 0 ? `${Math.round((a.size_bytes ?? 0)/1024)} КБ` : ''}
                    {' — '}
                    {signed[a.id] ? (
                      <a href={signed[a.id]} target="_blank" rel="noreferrer">скачать</a>
                    ) : (
                      <span>ссылка недоступна</span>
                    )}
                    <button
                      disabled={deletingAttId === a.id}
                      onClick={() => onDeleteAtt(a)}
                      style={{ marginLeft: 12 }}
                    >
                      {deletingAttId === a.id ? 'Удаление…' : 'Удалить'}
                    </button>
                    <div style={{ fontSize: 12, color: '#666' }}>{a.path}</div>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
