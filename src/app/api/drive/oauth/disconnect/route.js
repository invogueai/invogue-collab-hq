// POST /api/drive/oauth/disconnect
// Removes the stored refresh token (forces re-connection).

import { disconnectIntegration } from '../../../../../lib/drive';

export const runtime = 'nodejs';

export async function POST() {
  try {
    await disconnectIntegration();
    return Response.json({ ok: true });
  } catch (e) {
    console.error('oauth disconnect error:', e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
