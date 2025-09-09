'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function NewInitiativePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // гарантируем наличие app_users
      await supabase.from('app_users').upsert({
        auth_user_id: user.id,
        email: user.email!,
        full_name: user.user_metadata?.full_name ?? null,
        // role: 'user', //Не указываем, чтобы не перезаписать существующую роль
      }, { onConflict: 'auth_user_id' });

      const { data: me } = await supabase
        .from('app_users')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      setAuthorId(me?.id ?? null);
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!authorId) return alert('Нет авторизации. Войдите заново.');

    setSaving(true);
    const { error } = await supabase.from('initiatives').insert({
      author_id: authorId,
      title,
      description,
      category: category || null,
      status: 'submitted',
    });
    setSaving(false);

    if (error) return alert('Ошибка: ' + error.message);
    alert('Инициатива отправлена.');
    router.push('/dashboard');
  }

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', fontFamily: 'system-ui' }}>
      <h1>Подать инициативу</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ margin: '8px 0' }}>
          <label>Название<br />
            <input value={title} onChange={(e) => setTitle(e.target.value)} required
              style={{ width: '100%', padding: 8 }} />
          </label>
        </div>
        <div style={{ margin: '8px 0' }}>
          <label>Категория (необязательно)<br />
            <input value={category} onChange={(e) => setCategory(e.target.value)}
              style={{ width: '100%', padding: 8 }} />
          </label>
        </div>
        <div style={{ margin: '8px 0' }}>
          <label>Описание<br />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} required
              rows={6} style={{ width: '100%', padding: 8 }} />
          </label>
        </div>
        <button type="submit" disabled={saving} style={{ padding: 10 }}>
          {saving ? 'Сохранение…' : 'Отправить'}
        </button>
      </form>
    </div>
  );
}
