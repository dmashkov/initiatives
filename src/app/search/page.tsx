'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type RawRow = {
  id: string;
  initiative_id: string;
  content: string;
  similarity?: number;
  distance?: number;
};

type MatchRow = {
  id: string;
  initiative_id: string;
  content: string;
  similarity: number; // 0..1
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function hasStringError(v: unknown): v is { error: string } {
  return typeof v === 'object' && v !== null && 'error' in v && typeof (v as { error: unknown }).error === 'string';
}

/** Безопасный разбор JSON + внятные сообщения */
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
    if (hasStringError(data)) msg = data.error;
    throw new Error(`${url} -> ${msg}`);
  }

  return data as T;
}

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [minSimPct, setMinSimPct] = useState<number>(65);
  const minSim = useMemo(() => Math.max(0, Math.min(1, minSimPct / 100)), [minSimPct]);

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
      // 1) эмбеддинг запроса
      const { embedding } = await fetchJSON<{ embedding: number[] }>('/api/embed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q }),
      });

      // 2) RPC с настраиваемым порогом
      const { data, error } = await supabase.rpc('match_chunks', {
        query_embedding: embedding,
        match_count: 20,
        min_similarity: minSim,
      });
      if (error) throw new Error(error.message);

      const raw = (data ?? []) as RawRow[];

      // Унифицируем similarity (если вдруг пришла distance)
      const unified: MatchRow[] = raw.map((r) => ({
        id: r.id,
        initiative_id: r.initiative_id,
        content: r.content,
        similarity:
          typeof r.similarity === 'number'
            ? r.similarity
            : typeof r.distance === 'number'
            ? Math.max(0, Math.min(1, 1 - r.distance))
            : 0,
      }));

      const final = unified.filter((m) => m.similarity >= 0.01);
      setMatches(final);

      if (final.length === 0) {
        setErrorMsg(
          'Совпадений не найдено при текущем пороге. Снизьте порог или переформулируйте запрос.'
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

        {/* Порог релевантности */}
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ whiteSpace: 'nowrap' }}>Порог релевантности:</label>
          <input
            type="range"
            min={40}
            max={95}
            step={1}
            value={minSimPct}
            onChange={(e) => setMinSimPct(Number(e.target.value))}
          />
          <span style={{ width: 44, textAlign: 'right' }}>{minSimPct}%</span>
        </div>

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
