'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function FeedbackPage() {
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase
        .from('app_users')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      setUserId(me?.id ?? null);
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('feedback').insert({
      user_id: userId, // можно null — политика разрешает анонимный фидбек
      message,
    });
    if (error) return alert('Ошибка: ' + error.message);
    setMessage('');
    alert('Спасибо! Сообщение отправлено.');
  }

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', fontFamily: 'system-ui' }}>
      <h1>Обратная связь</h1>
      <form onSubmit={handleSubmit}>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} required
          rows={5} style={{ width: '100%', padding: 8 }} />
        <div style={{ marginTop: 8 }}>
          <button type="submit" style={{ padding: 10 }}>Отправить</button>
        </div>
      </form>
    </div>
  );
}
