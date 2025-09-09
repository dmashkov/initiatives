'use client';

import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Props = {
  page?: string;
  initiativeId?: string;
  compact?: boolean;
};

export default function FeedbackForm({ page, initiativeId, compact }: Props) {
  const [sending, setSending] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setOk(false);

    const form = new FormData(e.currentTarget);

    // honeypot
    if (String(form.get('website') || '').trim().length > 0) {
      setOk(true);
      (e.currentTarget as HTMLFormElement).reset();
      return;
    }

    const payload = {
      message: String(form.get('message') || ''),
      category: (form.get('category') as string) || 'other',
      email: (form.get('email') as string) || undefined,
      rating: Number(form.get('rating') || 0) || undefined,
      page: page ?? (typeof window !== 'undefined' ? window.location.pathname : undefined),
      initiativeId: initiativeId || undefined,
    };

    if (!payload.message || payload.message.trim().length < 5) {
      setErr('Сообщение слишком короткое (минимум 5 символов).');
      return;
    }

    setSending(true);
    try {
      // возьмём токен текущего пользователя (если он вошёл)
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j?.error as string) || res.statusText);

      setOk(true);
      (e.currentTarget as HTMLFormElement).reset();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: 640, marginTop: compact ? 8 : 16 }}>
      {/* Honeypot */}
      <div style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>
        <label>
          Ваш сайт (не заполняйте)
          <input name="website" autoComplete="off" tabIndex={-1} />
        </label>
      </div>

      <div style={{ margin: '8px 0' }}>
        <label>
          Категория<br />
          <select name="category" defaultValue="other" style={{ width: '100%' }}>
            <option value="bug">Ошибка</option>
            <option value="idea">Идея / улучшение</option>
            <option value="question">Вопрос</option>
            <option value="other">Другое</option>
          </select>
        </label>
      </div>

      <div style={{ margin: '8px 0' }}>
        <label>
          Сообщение<br />
          <textarea
            name="message"
            rows={6}
            placeholder="Опишите вашу проблему / идею / вопрос…"
            style={{ width: '100%' }}
            required
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ flex: '1 1 220px' }}>
          E-mail (по желанию)<br />
          <input name="email" type="email" placeholder="you@example.com" style={{ width: '100%' }} />
        </label>

        <fieldset style={{ border: 0, padding: 0, margin: 0, flex: '1 1 200px' }}>
          <legend style={{ fontSize: 12, color: '#6B7280' }}>Оценка (1–5, по желанию)</legend>
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <input type="radio" name="rating" value={n} /> {n}
              </label>
            ))}
            <label style={{ marginLeft: 8, fontSize: 12, color: '#6B7280' }}>
              <input type="radio" name="rating" value="" defaultChecked /> нет оценки
            </label>
          </div>
        </fieldset>
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="submit" disabled={sending}>{sending ? 'Отправка…' : 'Отправить'}</button>
        {ok && <span style={{ color: '#16A34A' }}>Спасибо! Отзыв отправлен.</span>}
        {err && <span style={{ color: '#DC2626' }}>Ошибка: {err}</span>}
      </div>
    </form>
  );
}
