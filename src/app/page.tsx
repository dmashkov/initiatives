export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Главная</h1>
      <p><a href="/login">Войти</a> → затем попадёте в <a href="/dashboard">ЛК</a>.</p>
    </main>
  );
}
