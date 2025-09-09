'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type MatchRow = {
  id: string;
  initiative_id: string;
  content: string;
  similarity: number; // 0..1
};

// Узкая проверка на "похож на объект-словарь"
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Безопасный разбор JSON с понятной ошибкой, если прилетел HTML/текст */
async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const ct = res.headers.get('content-type') || '';
  const raw = await res.text();

  if (!ct.includes('application/json')) {
    throw new Error(`${url} -> ${res.status} ${res.statusText}; non-JSON: ${raw.slice(0, 180)}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`${url} -> invalid JSON`);
  }

  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    if (isRecord(data) && typeof data.error === 'string') msg = data.error;
    throw new Error(`${url} -> ${msg}`);
  }

  return data as T;
}

export default function AskPage() {
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'finding' | 'answering'>('idle');

  async function handleAsk(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!q.trim()) return;

    setAnswer('');
    setMatches([]);
    setLoading(true);
    setPhase('finding');

    try {
      // 1) Эмбеддинг вопроса
      const { embedding } = await fetchJSON<{ embedding: number[] }>('/api/embed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q }),
      });

      // 2) Поиск релевантных чанков с порогом схожести
      const { data, error } = await supabase.rpc('match_chunks', {
        query_embedding: embedding,
        match_count: 10,
        min_similarity: 0.78,
      });
      if (error) throw new Error(error.message);

      const got = (data ?? []) as MatchRow[];
      if (got.length === 0) {
        setMatches([]);
        setAnswer(
          'Ничего релевантного не нашли в базе инициатив. ' +
            'Попробуйте переформулировать запрос или воспользуйтесь поиском.'
        );
        setPhase('idle');
        setLoading(false);
        return;
      }
      setMatches(got);

      // 3) Генерация ответа на основе контекста
      setPhase('answering');
      const { answer } = await fetchJSON<{ answer: string }>('/api/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: q,
          contexts: got.map((m) => ({
            initiative_id: m.initiative_id,
            content: m.content,
            similarity: m.similarity,
          })),
        }),
      });

      setAnswer(answer || 'Недостаточно информации в доступных фрагментах.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert('Ошибка: ' + msg);
    } finally {
      setPhase('idle');
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '24px auto', fontFamily: 'system-ui' }}>
      <nav style={{ marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/dashboard">← Личный кабинет</Link>
        <Link href="/search">Поиск</Link>
        <Link href="/admin">Админка</Link>
        <Link href="/feedback">Обратная связь</Link>
      </nav>

      <h1>AI-помощник</h1>
      <form onSubmit={handleAsk}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Сформулируйте вопрос по инициативам…"
          style={{ width: '100%', padding: 10, border: '1px solid #D0D5DD', borderRadius: 6 }}
        />
        <button type="submit" disabled={loading} style={{ marginTop: 8, padding: 10 }}>
          {phase === 'finding' ? 'Ищу контекст…' : phase === 'answering' ? 'Генерирую ответ…' : 'Спросить'}
        </button>
      </form>

      {answer && (
        <div
          style={{
            marginTop: 18,
            padding: 12,
            background: '#FAFAFA',
            border: '1px solid #EEE',
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {answer}
        </div>
      )}

      {matches.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h3>Контекст (для справки)</h3>
          <ul>
            {matches.map((m, i) => (
              <li key={m.id} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: '#666' }}>
                  [#{i + 1}] релевантность: {(m.similarity * 100).toFixed(1)}% —{' '}
                  <Link href={`/initiatives/${m.initiative_id}`}>/initiatives/{m.initiative_id}</Link>
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {m.content.length > 600 ? m.content.slice(0, 600) + '…' : m.content}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
