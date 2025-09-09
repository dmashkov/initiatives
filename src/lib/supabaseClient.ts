import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: { persistSession: true, autoRefreshToken: true },
  }
);

// ⬇️ ВРЕМЕННО для отладки: доступ к клиенту из консоли
// Не мешает серверу (выполняется только в браузере) и отключится в проде.
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  (window as any).supabase = supabase;
}
