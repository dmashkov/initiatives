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
};

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>('');
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setEmail(user.email ?? '');

      // обновим/создадим профиль
      await supabase.from('app_users').upsert(
        {
          auth_user_id: user.id,
          email: user.email ?? null,
          full_name: (user.user_metadata as Record<string, unknown> | undefined)?.full_name ?? null,
        },
        { onConflict: 'auth_user_id' }
      );

      const { data: me } = await supabase
        .from('app_users')
        .select('id, role')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      setMyUserId(me?.id ?? null);
      setIsAdmin(me?.role === 'admin');

      if (me?.id) {
        const { data } = await supabase
          .from('initiatives')
          .select('id,title,status,created_at')
          .eq('author_id', me.id)
          .order('created_at', { ascending: false });
        setRows((data ?? []) as Row[]);
      }

      setLoading(false);
    })();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (loading) return <p style={{ padding: 24, fontFamily: 'system-ui' }}>Загрузка…</p>;

  return (
    <div style={{ maxWidth: 1000, margin: '24px auto', fontFamily: 'system-ui' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/initiatives/new">+ Подать инициативу</Link>
          <Link href="/search">Поиск</Link>
          <Link href="/ask">AI-помощник</Link>
          {isAdmin && <Link href="/admin">Админка</Link>}
        </div>
        <button onClick={signOut}>Выйти</button>
      </nav>

      <h1>Личный кабинет</h1>
      <p>Вы вошли как: <b>{email || '—'}</b></p>

      <h3 style={{ marginTop: 16 }}>Мои инициативы</h3>
      {rows.length === 0 ? (
        <p>Пока нет инициатив. <Link href="/initiatives/new">Добавить первую</Link>.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: 6 }}>Дата</th>
              <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: 6 }}>Название</th>
              <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: 6 }}>Статус</th>
              <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: 6 }}>Детали</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{r.title}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{r.status}</td>
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
