import { Suspense } from 'react';
import CallbackClient from './CallbackClient';

export const dynamic = 'force-dynamic'; // не пытаться статически генерировать

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<p style={{ padding: 24 }}>Вход…</p>}>
      <CallbackClient />
    </Suspense>
  );
}
