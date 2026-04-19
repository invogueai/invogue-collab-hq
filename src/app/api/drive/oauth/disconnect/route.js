// POST /api/drive/oauth/disconnect
// Removes the stored refresh token (forces re-connection).

import { authenticate, requireRole } from '../../../../../lib/auth';
import { disconnectIntegration } from '../../../../../lib/drive';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return Response.json({ ok: false, error: auth.error }, { status: 401 });
    const roleBlock = requireRole(auth.role, ['admin']);
    if (roleBlock) return roleBlock;

    await disconnectIntegration();
    return Response.json({ ok: true });
  } catch (e) {
    console.error('oauth disconnect error:', e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
