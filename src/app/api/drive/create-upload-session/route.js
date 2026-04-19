// POST /api/drive/create-upload-session
// Initiates a Google Drive resumable upload session.
// Client then PUTs the file bytes directly to Google's upload URL (bypassing Vercel).
//
// Body: {
//   dealId, collabId, campaignName, influencerName, productLabel,
//   deliverableId,            // null for raw clips
//   deliverableType,          // "Reel" | "Story" | ... (ignored for raw)
//   isRaw: boolean,
//   fileName,                 // original name from user's machine
//   mimeType,
//   sizeBytes
// }
// Returns: { uploadUrl, finalFileName, version, parentFolderId }
//
// The client must then:
//  1) PUT the file body to `uploadUrl` with the correct Content-Type
//  2) On success, Google returns a JSON body with the new file ID
//  3) POST /api/drive/finalize-upload with that fileId to persist to DB

import { createClient } from '@supabase/supabase-js';
import { authenticate, requireRole } from '../../../../lib/auth';
import {
  ensureDealFolderTree,
  ensureInvoiceFolderTree,
  createResumableUploadSession,
  buildFileName,
  nextVersionFor,
} from '../../../../lib/drive';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Service-role client — routes run on the server and need to bypass RLS
function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

function extFromFilename(name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(name || '');
  return m ? m[1] : '';
}

export async function POST(req) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return Response.json({ ok: false, error: auth.error }, { status: 401 });
    const roleBlock = requireRole(auth.role, ['admin','negotiator','approver']);
    if (roleBlock) return roleBlock;

    const body = await req.json();
    const {
      dealId, collabId, campaignName, influencerName, productLabel,
      deliverableId, deliverableType, isRaw, fileName, mimeType, sizeBytes,
      invoiceMode, monthLabel,
    } = body;

    if (!dealId || !fileName) {
      return Response.json({ ok: false, error: 'Missing dealId or fileName' }, { status: 400 });
    }

    const sb = adminSupabase();

    // Ensure folder tree exists (cached after first create)
    let parentFolderId;
    if (invoiceMode) {
      const { monthFolderId } = await ensureInvoiceFolderTree({ monthLabel });
      parentFolderId = monthFolderId;
    } else {
      const { collabFolderId, rawFolderId } = await ensureDealFolderTree({
        campaignName, influencerName, collabId, productLabel,
      });
      parentFolderId = isRaw ? rawFolderId : collabFolderId;
    }

    // Compute next version
    let version = 1;
    let rawIndex = 1;
    if (isRaw) {
      const { data: existingRaw, error: rawErr } = await sb
        .from('deliverable_files')
        .select('id')
        .eq('deal_id', dealId)
        .eq('is_raw', true);
      if (rawErr) throw new Error('DB query (raw count) failed: ' + rawErr.message);
      rawIndex = (existingRaw?.length || 0) + 1;
      version = 0;
    } else {
      const { data: existingVersions, error: vErr } = await sb
        .from('deliverable_files')
        .select('version')
        .eq('deal_id', dealId)
        .eq('deliverable_id', deliverableId || null)
        .eq('is_raw', false);
      if (vErr) throw new Error('DB query (version) failed: ' + vErr.message);
      version = nextVersionFor(existingVersions);
    }

    // Canonical file name
    const finalFileName = buildFileName({
      collabId,
      deliverableType,
      version,
      isRaw,
      rawIndex,
      originalExt: extFromFilename(fileName),
    });

    // Origin must be forwarded to Google so the session URL is CORS-whitelisted
    // for the browser PUT that follows. Fall back to the request's own Origin
    // header if NEXT_PUBLIC_SITE_URL isn't set.
    const originHeader =
      req.headers.get('origin') ||
      (req.headers.get('referer') ? new URL(req.headers.get('referer')).origin : null) ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      null;

    // Create the resumable upload session
    const { uploadUrl } = await createResumableUploadSession({
      parentFolderId,
      fileName: finalFileName,
      mimeType,
      sizeBytes,
      origin: originHeader,
    });

    return Response.json({
      ok: true,
      uploadUrl,
      finalFileName,
      version,
      parentFolderId,
    });
  } catch (e) {
    console.error('create-upload-session error:', e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
