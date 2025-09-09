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

// Узкий type guard
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Безопасный разбор JSON + внятные сообщения об ошибках */
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

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!q.trim()) return;

    setLoading(true);
    setErrorMsg(null);
    setMatches([]);

    try {
      // 1) Получаем эмбеддинг запроса
      const { embedding } = await fetchJSON<{ embedding: number[] }>('/api/embed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q }),
      });

      // 2) Ищем подходящие чанки (RAG) c порогом релевантности
      const { data, error } = await supabase.rpc('match_chunks', {
        query_embedding: embedding,
        match_count: 20,
        min_similarity: 0.78, // при желании повысьте до 0.82
      });
      if (error) throw new Error(error.message);

      const got = (data ?? []) as MatchRow[];
      setMatches(got);

      if (got.length === 0) {
        setErrorMsg(
          'Ничего релевантного не нашли. Попробуйте переформулировать запрос ' +
          'или задайте вопрос на странице AI-помощника.'
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg('Ошибка поиска: ' + msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '24px auto', fontFamily: 'system-ui' }}>
      <nav style={{ marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/dashboard">← Личный кабинет</Link>
        <Link href="/ask">AI-помощник</Link>
        <Link href="/admin">Админка</Link>
        <Link href="/feedback">Обратная связь</Link>
      </nav>

      <h1>Поиск по инициативам</h1>

      <form onSubmit={handleSearch} style={{ marginTop: 8 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ключевые слова или вопрос…"
          style={{
            width: '100%',
            padding: 10,
            border: '1px solid #D0D5DD',
            borderRadius: 6,
            background: 'white',
          }}
        />
        <button type="submit" disabled={loading} style={{ marginTop: 8, padding: 10 }}>
          {loading ? 'Ищу…' : 'Поиск'}
        </button>
      </form>

      {errorMsg && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: 6,
            color: '#991B1B',
            whiteSpace: 'pre-wrap',
          }}
        >
          {errorMsg}
        </div>
      )}

      {matches.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h3>Найденные фрагменты</h3>
          <ul>
            {matches.map((m, i) => (
              <li key={m.id} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#666' }}>
                  [#{i + 1}] релевантность: {(m.similarity * 100).toFixed(1)}% —{' '}
                  <Link href={`/initiatives/${m.initiative_id}`}>/initiatives/{m.initiative_id}</Link>
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {m.content.length > 700 ? m.content.slice(0, 700) + '…' : m.content}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
