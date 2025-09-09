'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function Dashboard() {
  const [email, setEmail] = useState(null);
  const [role, setRole] = useState(null); // 'user' | 'admin'
  const [initiatives, setInitiatives] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) { setLoading(false); return; }
      setEmail(user.email);

      // не перезатираем роль
      await supabase.from('app_users').upsert(
        { auth_user_id: user.id, email: user.email, full_name: user.user_metadata?.full_name ?? null },
        { onConflict: 'auth_user_id' },
      );

      const { data: me } = await supabase
        .from('app_users')
        .select('id, role')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      const myId = me?.id ?? null;
      setRole(me?.role ?? 'user');

      if (myId) {
        const { data } = await supabase
          .from('initiatives')
          .select('id, title, status, created_at')
          .eq('author_id', myId)
          .order('created_at', { ascending: false });

        setInitiatives(data ?? []);
      }

      setLoading(false);
    })();
  }, []);

  if (!email) {
    return (
      <div style={{ maxWidth: 720, margin: '40px auto', fontFamily: 'system-ui' }}>
        <h1>Личный кабинет</h1>
        <p>Вы не вошли. Перейдите на <Link href="/login">/login</Link> и выполните вход.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '40px auto', fontFamily: 'system-ui' }}>
      <h1>Личный кабинет</h1>
      <p>Вы вошли как: <b>{email}</b></p>

      {role === 'admin' && (
        <p style={{ marginTop: 8 }}>
          <Link href="/admin">Перейти в админку</Link>
        </p>
      )}

      <p style={{ marginTop: 16 }}>
        <Link href="/initiatives/new">➕ Подать инициативу</Link>
      </p>

      <h2 style={{ marginTop: 24 }}>Мои инициативы</h2>
      {loading ? (
        <p>Загрузка…</p>
      ) : initiatives.length === 0 ? (
        <p>Пока нет инициатив.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: 6 }}>Дата</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: 6 }}>Название</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: 6 }}>Статус</th>
            </tr>
          </thead>
          <tbody>
            {initiatives.map((it) => (
              <tr key={it.id}>
                <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
                  {new Date(it.created_at).toLocaleString()}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{it.title}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{it.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
