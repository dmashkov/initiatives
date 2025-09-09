'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function AuthCallback() {
  const router = useRouter();
  const sp = useSearchParams();

  useEffect(() => {
    const code = sp.get('code');
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const hasAccessToken = hash.includes('access_token=');

    (async () => {
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          router.replace('/dashboard');
        } else if (hasAccessToken) {
          router.replace('/dashboard');
        } else {
          router.replace('/login');
        }
      } catch (e: any) {
        alert('Не удалось войти: ' + (e?.message ?? e));
        router.replace('/login');
      }
    })();
  }, [router, sp]);

  return <p style={{ padding: 24, fontFamily: 'system-ui' }}>Вход…</p>;
}
