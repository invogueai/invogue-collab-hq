// GET /api/drive/oauth/status
// Returns whether Google Drive is connected and by whom.

import { authenticate, requireRole } from '../../../../../lib/auth';
import { getConnectionStatus } from '../../../../../lib/drive';

export const runtime = 'nodejs';

export async function GET(req) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return Response.json({ ok: false, error: auth.error }, { status: 401 });
    const roleBlock = requireRole(auth.role, ['admin','negotiator','approver']);
    if (roleBlock) return roleBlock;

    const status = await getConnectionStatus();
    return Response.json({ ok: true, ...status });
  } catch (e) {
    console.error('oauth status error:', e);
    return Response.json({ ok: false, connected: false, error: e.message });
  }
}
