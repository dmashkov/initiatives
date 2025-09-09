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

export default function AskPage() {
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [answer, setAnswer] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'finding' | 'answering'>('idle');

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;

    setAnswer('');
    setMatches([]);
    setLoading(true);
    setPhase('finding');

    try {
      // 1) эмбеддинг вопроса
      const r = await fetch('/api/embed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q }),
      });
      const j = (await r.json()) as { embedding?: number[]; error?: string };
      if (!r.ok || !j.embedding) throw new Error(j.error ?? 'embed failed');

      // 2) поиск похожих чанков (RLS ограничит доступ видимыми инициативами)
      const { data, error } = await supabase.rpc('match_chunks', {
        query_embedding: j.embedding,
        match_count: 10,
      });
      if (error) throw error;
      const got = (data ?? []) as MatchRow[];
      setMatches(got);

      setPhase('answering');

      // 3) запрос к AI с контекстом
      const a = await fetch('/api/answer', {
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
      const aj = (await a.json()) as { answer?: string; error?: string };
      if (!a.ok || !aj.answer) throw new Error(aj.error ?? 'answer failed');
      setAnswer(aj.answer);
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
      <nav style={{ marginBottom: 12 }}>
        <Link href="/dashboard">← Личный кабинет</Link>&nbsp;&nbsp;
        <Link href="/search">Поиск</Link>
      </nav>

      <h1>AI-помощник</h1>
      <form onSubmit={handleAsk}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Сформулируйте вопрос по инициативам…"
          style={{ width: '100%', padding: 10 }}
        />
        <button type="submit" disabled={loading} style={{ marginTop: 8, padding: 10 }}>
          {phase === 'finding' ? 'Ищу контекст…' : phase === 'answering' ? 'Генерирую ответ…' : 'Спросить'}
        </button>
      </form>

      {answer && (
        <div style={{ marginTop: 18, padding: 12, background: '#fafafa', whiteSpace: 'pre-wrap' }}>
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
