import { Suspense } from 'react';
import NewInitiativeClient from './NewInitiativeClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function NewInitiativePage() {
  return (
    <Suspense fallback={<p style={{ padding: 24, fontFamily: 'system-ui' }}>Загрузка формы…</p>}>
      <NewInitiativeClient />
    </Suspense>
  );
}
