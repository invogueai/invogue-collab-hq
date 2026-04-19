// Server-side authentication helper for API routes.
// Verifies the Supabase JWT from the Authorization header and returns the user's role.

import { createClient } from '@supabase/supabase-js';

function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Authenticate the request. Returns { user, role, error }.
 * Usage in a route:
 *   const auth = await authenticate(req);
 *   if (auth.error) return Response.json({ ok: false, error: auth.error }, { status: 401 });
 */
export async function authenticate(req) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return { user: null, role: null, error: 'No authorization token' };

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    // Create a client with the user's token to verify it
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user?.email) return { user: null, role: null, error: 'Invalid or expired token' };

    // Look up role from users table
    const sb = adminSupabase();
    const { data: dbUser } = await sb
      .from('users')
      .select('id, role, status')
      .ilike('email', user.email)
      .eq('status', 'active')
      .single();

    if (!dbUser) return { user: null, role: null, error: 'User not found or inactive' };

    return { user: { ...user, dbId: dbUser.id }, role: dbUser.role, error: null };
  } catch (e) {
    return { user: null, role: null, error: 'Auth failed: ' + e.message };
  }
}

/**
 * Quick role check helper.
 * Returns a 403 Response if the role is not in the allowed list, or null if ok.
 */
export function requireRole(role, allowed) {
  if (!allowed.includes(role)) {
    return Response.json(
      { ok: false, error: `Forbidden — requires ${allowed.join(' or ')} role` },
      { status: 403 }
    );
  }
  return null;
}
