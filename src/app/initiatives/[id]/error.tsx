'use client';

export default function Error({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  return (
    <div style={{ maxWidth: 900, margin: '24px auto', fontFamily: 'system-ui' }}>
      <h1>Ошибка загрузки инициативы</h1>
      <p style={{ color: '#DC2626' }}>{error.message}</p>
      <button onClick={() => reset()} style={{ marginTop: 12, padding: '8px 12px' }}>
        Повторить
      </button>
    </div>
  );
}
