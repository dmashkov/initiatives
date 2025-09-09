'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function AdminPage() {
  const router = useRouter();

  // состояние
  const [isAdmin, setIsAdmin] = useState(null);     // true/false
  const [myUserId, setMyUserId] = useState(null);   // app_users.id
  const [rows, setRows] = useState([]);             // список инициатив
  const [filter, setFilter] = useState('all');      // фильтр по статусу
  const [loading, setLoading] = useState(true);     // загрузка данных
  const [busyId, setBusyId] = useState(null);       // id строки, которую сохраняем

  const STATUSES = ['submitted', 'in_review', 'approved', 'rejected'];

  // загрузка роли и данных
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsAdmin(false); setLoading(false); return; }

      // получаем мою запись и роль из app_users
      const { data: me } = await supabase
        .from('app_users')
        .select('id, role')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      const admin = me?.role === 'admin';
      setIsAdmin(admin);
      setMyUserId(me?.id ?? null);

      if (!admin) { setLoading(false); return; }

      // загружаем инициативы с email автора
      const { data, error } = await supabase
        .from('initiatives')
        .select('id,title,status,created_at, author:app_users(email)')
        .order('created_at', { ascending: false });

      if (error) {
        alert('Ошибка загрузки: ' + error.message);
        setLoading(false);
        return;
      }
      setRows(data ?? []);
      setLoading(false);
    })();
  }, []);

  // смена статуса + запись в историю
  async function updateStatus(row, newStatus) {
    if (!myUserId) { alert('Нет прав/идентификатора пользователя.'); return; }
    if (row.status === newStatus) return;

    setBusyId(row.id);

    // 1) обновляем статус инициативы
    const { error } = await supabase
      .from('initiatives')
      .update({ status: newStatus })
      .eq('id', row.id);

    if (error) {
      setBusyId(null);
      alert('Не удалось обновить: ' + error.message);
      return;
    }

    // 2) логируем историю смены статуса
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

    // 3) обновим состояние таблицы
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, status: newStatus } : r)));
  }

  const visible = rows.filter(r => (filter === 'all' ? true : r.status === filter));

  if (loading) {
    return <p style={{ padding: 24, fontFamily: 'system-ui' }}>Загрузка…</p>;
  }

  if (isAdmin === false) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui' }}>
        <p>Недостаточно прав. <a href="/dashboard">Вернуться в ЛК</a></p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto', fontFamily: 'system-ui' }}>
      {/* Навигация: в ЛК и выход */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <a href="/dashboard">← В личный кабинет</a>
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

      {/* Фильтр и ручное обновление */}
      <div style={{ margin: '12px 0' }}>
        Фильтр:&nbsp;
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">все</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={() => router.refresh()} style={{ marginLeft: 12 }}>Обновить</button>
      </div>

      {/* Таблица инициатив */}
      {visible.length === 0 ? (
        <p>Нет записей.</p>
      ) : (
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
                    onChange={e => updateStatus(r, e.target.value)}
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {busyId === r.id && <span style={{ marginLeft: 8 }}>Сохранение…</span>}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
                  <a href={`/initiatives/${r.id}`}>Открыть</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
