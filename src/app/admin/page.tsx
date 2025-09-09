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

export default function AdminPage() {
  const router = useRouter();

  // типы заданы явно — ошибки TS не будет
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [busyId, setBusyId] = useState<string | null>(null);

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
        <Link href="/dashboard">← В личный кабинет</Link>
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
              <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: 6 }}>Детали</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr key={r.id}>
                <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
                  {r.author?.email ?? '—'}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
                  {r.title}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
                  <select
                    value={r.status}
                    disabled={busyId === r.id}
                    onChange={e => updateStatus(r, e.target.value as Status)}
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {busyId === r.id && <span style={{ marginLeft: 8 }}>Сохранение…</span>}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
                  <Link href={`/initiatives/${r.id}`}>Открыть</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
