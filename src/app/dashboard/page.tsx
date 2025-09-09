'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Initiative = {
  id: string;
  title: string;
  status: 'submitted' | 'in_review' | 'approved' | 'rejected';
  created_at: string;
};

export default function Dashboard() {
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<'user' | 'admin' | null>(null);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // 1) Кто вошёл
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        setLoading(false);
        return;
      }
      setEmail(user.email);

      // 2) Гарантируем запись в app_users (уникальность по auth_user_id)
      await supabase.from('app_users').upsert(
        {
          auth_user_id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name ?? null,
          // role: 'user', // при первом входе — обычный пользователь? Не указываем, чтобы не перезаписать существующую
        },
        { onConflict: 'auth_user_id' },
      );

      // 3) Получаем свой app_users.id и роль
      const { data: me, error: meErr } = await supabase
        .from('app_users')
        .select('id, role')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (meErr) {
        console.error(meErr);
        setLoading(false);
        return;
      }

      const myId = me?.id ?? null;
      setRole((me?.role as 'user' | 'admin') ?? 'user');

      // 4) Загружаем свои инициативы
      if (myId) {
        const { data, error } = await supabase
          .from('initiatives')
          .select('id, title, status, created_at')
          .eq('author_id', myId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error(error);
        } else {
          setInitiatives((data ?? []) as Initiative[]);
        }
      }

      setLoading(false);
    })();
  }, []);

  // Если не вошли — подсказываем
  if (!email) {
    return (
      <div style={{ maxWidth: 720, margin: '40px auto', fontFamily: 'system-ui' }}>
        <h1>Личный кабинет</h1>
        <p>Вы не вошли. Перейдите на <a href="/login">/login</a> и выполните вход.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '40px auto', fontFamily: 'system-ui' }}>
      <h1>Личный кабинет</h1>
      <p>Вы вошли как: <b>{email}</b></p>

      {role === 'admin' && (
        <p style={{ marginTop: 8 }}>
          <a href="/admin">Перейти в админку</a>
        </p>
      )}

      <p style={{ marginTop: 16 }}>
        <a href="/initiatives/new">➕ Подать инициативу</a>
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
