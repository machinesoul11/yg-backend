/**
 * Supabase Client Configuration
 * 
 * This provides Supabase clients for both server-side and client-side usage.
 * Note: This project primarily uses Prisma for database operations.
 * Use these clients only for Supabase-specific features like Auth, Storage, Realtime, etc.
 */

import { createClient } from '@supabase/supabase-js';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
}

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

/**
 * Public Supabase client (for client-side usage)
 * Uses the anon key which respects Row Level Security (RLS) policies
 */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

/**
 * Admin Supabase client (for server-side usage only)
 * Uses the service role key which bypasses RLS policies
 * 
 * ⚠️ WARNING: Only use this on the server side!
 * Never expose this client to the browser.
 */
export const getSupabaseAdmin = () => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing env.SUPABASE_SERVICE_ROLE_KEY - required for admin operations');
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
};

/**
 * Usage Examples:
 * 
 * Client-side (React components):
 * ```tsx
 * import { supabase } from '@/lib/supabase';
 * 
 * // Query with RLS enabled
 * const { data, error } = await supabase
 *   .from('users')
 *   .select('*')
 *   .eq('id', userId);
 * ```
 * 
 * Server-side (API routes, Server Components):
 * ```tsx
 * import { getSupabaseAdmin } from '@/lib/supabase';
 * 
 * const supabaseAdmin = getSupabaseAdmin();
 * 
 * // Admin query (bypasses RLS)
 * const { data, error } = await supabaseAdmin
 *   .from('users')
 *   .select('*');
 * ```
 * 
 * Note: For most database operations, prefer using Prisma:
 * ```tsx
 * import { prisma } from '@/lib/db';
 * 
 * const users = await prisma.user.findMany();
 * ```
 */
