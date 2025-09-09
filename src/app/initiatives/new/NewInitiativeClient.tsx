'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { uploadAttachment } from '@/lib/uploadAttachment';

export default function NewInitiativeClient() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [appUserId, setAppUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('app_users').upsert(
        { auth_user_id: user.id, email: user.email!, full_name: user.user_metadata?.full_name ?? null },
        { onConflict: 'auth_user_id' },
      );

      const { data: me } = await supabase
        .from('app_users')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      setAuthorId(me?.id ?? null);
      setAppUserId(me?.id ?? null);
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!authorId || !appUserId) return alert('Нет авторизации. Войдите заново.');

    setSaving(true);

    // 1) создаём инициативу
    const { data: ins, error } = await supabase
      .from('initiatives')
      .insert({
        author_id: authorId,
        title,
        description,
        category: category || null,
        status: 'submitted',
      })
      .select('id')
      .single();

    if (error) {
      setSaving(false);
      return alert('Ошибка: ' + error.message);
    }

    const initiativeId = ins!.id as string;

    // 2) загружаем вложения (если есть)
    const files = fileRef.current?.files;
    if (files && files.length > 0) {
      try {
        const toUpload = Array.from(files).slice(0, 5);
        for (const file of toUpload) {
          if (file.size > 10 * 1024 * 1024) {
            alert(`Файл ${file.name} слишком большой (лимит 10 МБ). Пропущен.`);
            continue;
          }
          await uploadAttachment(file, initiativeId, appUserId);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(e);
        alert('Файл(ы) не загрузились: ' + msg);
      }
    }

    // 3) индексация для RAG (не блокирующая UX: ошибки — в консоль/alert)
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initiativeId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        console.warn('ingest failed:', j?.error ?? res.status);
      }
    } catch (e) {
      console.warn('ingest error:', e);
    }

    setSaving(false);
    alert('Инициатива отправлена.');
    router.push('/dashboard');
  }

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', fontFamily: 'system-ui' }}>
      <h1>Подать инициативу</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ margin: '8px 0' }}>
          <label>Название<br />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              style={{ width: '100%', padding: 8 }}
            />
          </label>
        </div>

        <div style={{ margin: '8px 0' }}>
          <label>Категория (необязательно)<br />
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ width: '100%', padding: 8 }}
            />
          </label>
        </div>

        <div style={{ margin: '8px 0' }}>
          <label>Описание<br />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={6}
              style={{ width: '100%', padding: 8 }}
            />
          </label>
        </div>

        <div style={{ margin: '8px 0' }}>
          <label>Вложения (до 5 файлов, ≤ 10 МБ каждый)<br />
            <input ref={fileRef} type="file" multiple />
          </label>
        </div>

        <button type="submit" disabled={saving} style={{ padding: 10 }}>
          {saving ? 'Сохранение…' : 'Отправить'}
        </button>
      </form>
    </div>
  );
}
