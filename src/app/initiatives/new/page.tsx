import dynamic from 'next/dynamic';

export const dynamic = 'force-dynamic'; // не кешировать и не пытаться SSG
export const revalidate = 0;

const NewInitiativeClient = dynamic(() => import('./NewInitiativeClient'), {
  ssr: false,
  loading: () => <p style={{ padding: 24, fontFamily: 'system-ui' }}>Загрузка формы…</p>,
});

export default function NewInitiativePage() {
  return <NewInitiativeClient />;
}
