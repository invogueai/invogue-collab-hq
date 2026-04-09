// GET /api/drive/oauth/status
// Returns whether Google Drive is connected and by whom.

import { getConnectionStatus } from '../../../../../lib/drive';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const status = await getConnectionStatus();
    return Response.json({ ok: true, ...status });
  } catch (e) {
    console.error('oauth status error:', e);
    return Response.json({ ok: false, connected: false, error: e.message });
  }
}
