// GET /api/drive/oauth/start
// Redirects the user to Google's consent screen.
// After approval, Google sends them back to /api/drive/oauth/callback with a code.

import { getAuthorizationUrl, makeStateToken } from '../../../../../lib/drive';

export const runtime = 'nodejs';

export async function GET(req) {
  try {
    const state = makeStateToken();
    const url = getAuthorizationUrl({ state, hd: 'invogue.shop' });

    // Store the state token in a short-lived cookie so we can verify the callback.
    // httpOnly + secure + sameSite=lax is the standard CSRF-safe config for OAuth.
    const headers = new Headers();
    headers.set('Location', url);
    headers.set('Set-Cookie', `drive_oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);

    return new Response(null, { status: 302, headers });
  } catch (e) {
    console.error('oauth start error:', e);
    return new Response(`OAuth start failed: ${e.message}`, { status: 500 });
  }
}
