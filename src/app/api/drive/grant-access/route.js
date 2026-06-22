// POST /api/drive/grant-access  { email, role? }
// Grants a team member access to the shared Drive. Admin only.
// Called automatically when a new user is added to the team so everyone
// can see and upload collaboration files. Non-fatal for the caller — user
// creation should still succeed even if Drive isn't connected.

import { authenticate, requireRole } from '../../../../lib/auth';
import { grantDriveAccess } from '../../../../lib/drive';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return Response.json({ ok: false, error: auth.error }, { status: 401 });
    const roleBlock = requireRole(auth.role, ['admin']);
    if (roleBlock) return roleBlock;

    const { email, role } = await req.json();
    if (!email) return Response.json({ ok: false, error: 'Missing email' }, { status: 400 });

    const result = await grantDriveAccess({ email, role: role || 'writer' });
    return Response.json({ ok: true, id: result.id, email: result.emailAddress, role: result.role });
  } catch (e) {
    console.error('grant-access error:', e);
    // GOOGLE_DRIVE_NOT_CONNECTED or any Drive error — surface but don't 500 hard
    return Response.json({ ok: false, error: e.message }, { status: 200 });
  }
}
