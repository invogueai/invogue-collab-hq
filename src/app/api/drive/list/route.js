// GET /api/drive/list?dealId=...
// Returns all uploaded files for a deal, grouped into { deliverables: {[id]: files[]}, raw: files[] }

import { createClient } from '@supabase/supabase-js';
import { authenticate } from '../../../../lib/auth';

export const runtime = 'nodejs';

function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const dealId = searchParams.get('dealId');
    if (!dealId) {
      return Response.json({ ok: false, error: 'Missing dealId' }, { status: 400 });
    }

    const sb = adminSupabase();
    const { data, error } = await sb
      .from('deliverable_files')
      .select('*')
      .eq('deal_id', dealId)
      .order('uploaded_at', { ascending: false });

    if (error) {
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }

    const byDeliverable = {};
    const raw = [];
    for (const row of data || []) {
      if (row.is_raw) {
        raw.push(row);
      } else {
        const key = row.deliverable_id || 'unassigned';
        if (!byDeliverable[key]) byDeliverable[key] = [];
        byDeliverable[key].push(row);
      }
    }
    // Sort each bucket by version desc
    Object.values(byDeliverable).forEach(arr => arr.sort((a, b) => (b.version || 0) - (a.version || 0)));

    return Response.json({ ok: true, deliverables: byDeliverable, raw });
  } catch (e) {
    console.error('list error:', e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
