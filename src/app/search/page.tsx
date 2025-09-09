'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

type MatchRow = {
  id: string;
  initiative_id: string;
  content: string;
  similarity: number;
};

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    try {
      const r = await fetch('/api/embed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q }),
      });
      const j = (await r.json()) as { embedding: number[]; error?: string };
      if (!r.ok || !j.embedding) throw new Error(j.error ?? 'embed failed');

      const { data, error } = await supabase.rpc('match_chunks', {
        query_embedding: j.embedding,
        match_count: 8,
      });
      if (error) throw error;
      setRows((data as MatchRow[]) ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert('Ошибка поиска: ' + msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '24px auto', fontFamily: 'system-ui' }}>
      <h1>Поиск по инициативам</h1>
      <form onSubmit={handleSearch}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Например: парковки во дворах"
          style={{ width: '100%', padding: 10 }}
        />
        <button type="submit" disabled={loading} style={{ marginTop: 8, padding: 10 }}>
          {loading ? 'Ищу…' : 'Искать'}
        </button>
      </form>

      {rows.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3>Результаты</h3>
          <ul>
            {rows.map((r) => (
              <li key={r.id} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#666' }}>
                  релевантность: {(r.similarity * 100).toFixed(1)}%
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {r.content.slice(0, 500)}
                  {r.content.length > 500 ? '…' : ''}
                </div>
                <div>
                  <Link href={`/initiatives/${r.initiative_id}`}>Открыть инициативу</Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
