import NextDynamic from 'next/dynamic';

export const dynamic = 'force-dynamic'; // не пытаться SSG/кешировать
export const revalidate = 0;

const NewInitiativeClient = NextDynamic(() => import('./NewInitiativeClient'), {
  ssr: false,
  loading: () => <p style={{ padding: 24, fontFamily: 'system-ui' }}>Загрузка формы…</p>,
});

export default function NewInitiativePage() {
  return <NewInitiativeClient />;
}
