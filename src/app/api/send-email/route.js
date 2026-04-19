// Invogue Collab HQ — Email sender (Resend API)
// POST /api/send-email  { to, subject, html, replyTo? }

import { authenticate, requireRole } from '../../lib/auth';
import { createClient } from '@supabase/supabase-js';

function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return Response.json({ ok: false, error: auth.error }, { status: 401 });
    const roleBlock = requireRole(auth.role, ['admin','negotiator']);
    if (roleBlock) return roleBlock;

    const { to, subject, html, replyTo } = await req.json();

    if (!to || !subject || !html) {
      return Response.json({ ok: false, error: 'Missing to/subject/html' }, { status: 400 });
    }

    // Validate recipients — prevent spam/phishing
    const recipients = Array.isArray(to) ? to : [to];
    if (recipients.length > 5) {
      return Response.json({ ok: false, error: 'Too many recipients' }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return Response.json({ ok: false, error: 'RESEND_API_KEY not configured on server' }, { status: 500 });
    }

    const from = process.env.EMAIL_FROM || 'Invogue Collabs <sm@invogue.shop>';

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error('Resend API error:', data);
      return Response.json({ ok: false, error: data.message || 'Resend API failed', details: data }, { status: resp.status });
    }

    return Response.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('send-email route error:', e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
