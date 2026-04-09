// GET /api/drive/oauth/callback?code=...&state=...
// Google redirects back here after the user approves.
// We verify the state cookie, exchange the code for tokens, and save the refresh_token.

import {
  exchangeCodeForTokens,
  getUserEmailFromAccessToken,
  saveIntegration,
} from '../../../../../lib/drive';

export const runtime = 'nodejs';

function renderResultPage({ ok, message, email }) {
  const color = ok ? '#4ade80' : '#f87171';
  const emoji = ok ? '✅' : '❌';
  const title = ok ? 'Google Drive Connected' : 'Connection Failed';
  const body = ok
    ? `<p>Connected as <b>${email || 'unknown'}</b>. You can close this tab and return to the dashboard.</p>`
    : `<p style="color:#f87171">${message}</p>`;
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${title}</title>
<style>
  body { background:#0f0f14; color:#f6dfc1; font-family:-apple-system,sans-serif; padding:60px 20px; max-width:560px; margin:0 auto; text-align:center; }
  .card { background:#1a1a22; border:1px solid #2a2a36; border-radius:10px; padding:32px; }
  h1 { color:${color}; margin:0 0 12px; font-size:22px; }
  p { color:#b6a48b; line-height:1.6; }
  a { display:inline-block; margin-top:18px; background:#770A1C; color:#f6dfc1; padding:10px 20px; border-radius:7px; text-decoration:none; font-weight:700; }
</style></head>
<body>
  <div class="card">
    <div style="font-size:48px;margin-bottom:8px;">${emoji}</div>
    <h1>${title}</h1>
    ${body}
    <a href="/">Back to Dashboard</a>
  </div>
  <script>setTimeout(()=>{try{window.opener&&window.opener.postMessage({type:'drive_oauth_done',ok:${ok}},'*')}catch(e){}},200)</script>
</body></html>`;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return new Response(renderResultPage({ ok: false, message: `Google returned: ${error}` }), {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    if (!code) {
      return new Response(renderResultPage({ ok: false, message: 'No authorization code received' }), {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Verify state cookie (CSRF protection)
    const cookieHeader = req.headers.get('cookie') || '';
    const stateCookie = cookieHeader.split(';').map(s => s.trim()).find(s => s.startsWith('drive_oauth_state='));
    const storedState = stateCookie ? stateCookie.slice('drive_oauth_state='.length) : null;
    if (!storedState || storedState !== state) {
      return new Response(renderResultPage({ ok: false, message: 'State mismatch — possible CSRF attempt. Try again.' }), {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return new Response(renderResultPage({
        ok: false,
        message: 'Google did not return a refresh_token. Revoke the app at https://myaccount.google.com/permissions and try again.',
      }), {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const email = await getUserEmailFromAccessToken(tokens.access_token);
    await saveIntegration({ refreshToken: tokens.refresh_token, email });

    // Clear state cookie + render success
    const headers = new Headers({
      'Content-Type': 'text/html; charset=utf-8',
      'Set-Cookie': 'drive_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
    });
    return new Response(renderResultPage({ ok: true, email }), { status: 200, headers });
  } catch (e) {
    console.error('oauth callback error:', e);
    return new Response(renderResultPage({ ok: false, message: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}
