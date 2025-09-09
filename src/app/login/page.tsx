'use client';

import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function LoginPage() {
  const [email, setEmail] = useState('');

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${siteUrl}/auth/callback` },
    });
    if (error) {
      alert('Ошибка: ' + error.message);
      return;
    }
    alert('Письмо отправлено. Откройте ссылку из письма.');
  };

  return (
    <div style={{ maxWidth: 420, margin: '40px auto', fontFamily: 'system-ui' }}>
      <h1>Вход по e-mail</h1>
      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: '100%', padding: 10, margin: '8px 0' }}
        />
        <button type="submit" style={{ padding: 10 }}>Отправить magic-link</button>
      </form>
    </div>
  );
}
