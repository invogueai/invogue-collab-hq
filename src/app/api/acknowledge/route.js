// Invogue Collab HQ — Influencer Acknowledgement Endpoint
// GET /api/acknowledge?token=<UUID>
//
// This is a PUBLIC endpoint (no auth required) — the influencer clicks
// a link in their confirmation email to agree to the collaboration terms.
// The token is a unique UUID stored in the deal row when the email is sent.

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LOGO_URL = "https://raw.githubusercontent.com/invogueai/invogue-collab-hq/main/public/invogue-logo.png";

function htmlPage(title, body) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Invogue</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#F6F4F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1A1A;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .card{background:#fff;border-radius:12px;max-width:520px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,.08);overflow:hidden}
  .header{background:#770A1C;padding:28px 32px;text-align:center}
  .header img{max-height:40px;max-width:180px}
  .body{padding:36px 32px;text-align:center}
  .icon{font-size:56px;margin-bottom:16px}
  h1{font-size:22px;font-weight:700;margin-bottom:10px}
  p{font-size:14px;color:#555;line-height:1.65;margin-bottom:8px}
  .footer{background:#770A1C;padding:18px 32px;text-align:center}
  .footer span{color:#F6DFC1;font-size:11px;opacity:.8}
</style></head>
<body><div class="card">
  <div class="header"><img src="${LOGO_URL}" alt="Invogue"/></div>
  <div class="body">${body}</div>
  <div class="footer"><span>Invogue · Own your Inner Bold · <a href="https://invogue.shop" style="color:#F6DFC1;text-decoration:none">invogue.shop</a></span></div>
</div></body></html>`;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token || token.length < 10) {
      const html = htmlPage('Invalid Link', `
        <div class="icon">⚠️</div>
        <h1>Invalid Link</h1>
        <p>This acknowledgement link is invalid or incomplete. Please use the link from your confirmation email.</p>
      `);
      return new Response(html, { status: 400, headers: { 'Content-Type': 'text/html' } });
    }

    const sb = supabaseAdmin();

    // Look up the deal by acknowledge token
    const { data: deal, error: fetchErr } = await sb
      .from('deals')
      .select('id, influencer_name, status, acknowledged_at, acknowledge_token')
      .eq('acknowledge_token', token)
      .single();

    if (fetchErr || !deal) {
      const html = htmlPage('Link Not Found', `
        <div class="icon">🔍</div>
        <h1>Link Not Found</h1>
        <p>We couldn't find a collaboration matching this link. It may have expired or already been processed.</p>
      `);
      return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html' } });
    }

    // Already acknowledged
    if (deal.acknowledged_at) {
      const ackDate = new Date(deal.acknowledged_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const html = htmlPage('Already Acknowledged', `
        <div class="icon">✅</div>
        <h1>Already Acknowledged</h1>
        <p>Hi <b>${deal.influencer_name}</b>, you've already acknowledged this collaboration on <b>${ackDate}</b>.</p>
        <p>No further action is needed. Our team will be dispatching your products shortly!</p>
      `);
      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }

    // Record acknowledgement
    const ts = new Date().toISOString();
    const { error: updateErr } = await sb
      .from('deals')
      .update({ status: 'acknowledged', acknowledged_at: ts })
      .eq('id', deal.id);

    if (updateErr) {
      console.error('Acknowledge update failed:', updateErr);
      const html = htmlPage('Error', `
        <div class="icon">❌</div>
        <h1>Something went wrong</h1>
        <p>We couldn't record your acknowledgement. Please try clicking the link again, or contact your collaboration manager.</p>
      `);
      return new Response(html, { status: 500, headers: { 'Content-Type': 'text/html' } });
    }

    // Also insert an audit log entry
    try {
      await sb.from('audit_log').insert({
        deal_id: deal.id,
        user_name: deal.influencer_name,
        action: 'Influencer acknowledged collaboration terms',
        detail: `Acknowledged via email link at ${ts}`,
        created_at: ts
      });
    } catch (e) {
      console.error('Audit log insert failed (non-fatal):', e);
    }

    const html = htmlPage('Terms Acknowledged!', `
      <div class="icon">🎉</div>
      <h1>Thank You, ${deal.influencer_name}!</h1>
      <p>Your acknowledgement has been recorded successfully. Our logistics team will now prepare and dispatch your products.</p>
      <p style="margin-top:16px;color:#770A1C;font-weight:600;">We're excited to collaborate with you!</p>
    `);
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });

  } catch (e) {
    console.error('Acknowledge route error:', e);
    const html = htmlPage('Error', `
      <div class="icon">❌</div>
      <h1>Something went wrong</h1>
      <p>Please try again or contact your collaboration manager.</p>
    `);
    return new Response(html, { status: 500, headers: { 'Content-Type': 'text/html' } });
  }
}
