'use client';

import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from 'react';
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
        {
          auth_user_id: user.id,
          email: user.email ?? null,
          full_name: (user.user_metadata as Record<string, unknown> | undefined)?.full_name ?? null,
        },
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

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!authorId || !appUserId) {
      alert('Нет авторизации. Войдите заново.');
      return;
    }

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

    if (error || !ins?.id) {
      setSaving(false);
      alert('Ошибка: ' + (error?.message ?? 'не удалось создать запись'));
      return;
    }

    const initiativeId = String(ins.id);

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
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(err);
        alert('Файл(ы) не загрузились: ' + msg);
      }
    }

    // 3) индексация для RAG — c Bearer-токеном
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ initiativeId }),
      });

      if (!res.ok) {
        // аккуратно разбираем JSON без any
        let serverError: string | undefined;
        try {
          const j: unknown = await res.json();
          if (j && typeof j === 'object' && 'error' in j) {
            serverError = String((j as { error?: unknown }).error ?? '');
          }
        } catch {
          /* ignore parse error */
        }
        console.warn('ingest failed:', serverError ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn('ingest error:', err instanceof Error ? err.message : String(err));
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
              onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
              required
              style={{ width: '100%', padding: 8 }}
            />
          </label>
        </div>

        <div style={{ margin: '8px 0' }}>
          <label>Категория (необязательно)<br />
            <input
              value={category}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setCategory(e.target.value)}
              style={{ width: '100%', padding: 8 }}
            />
          </label>
        </div>

        <div style={{ margin: '8px 0' }}>
          <label>Описание<br />
            <textarea
              value={description}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
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
