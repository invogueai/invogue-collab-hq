// POST /api/drive/finalize-upload
// Called after the client finishes uploading the file body directly to Google Drive.
// Persists the row to `deliverable_files`.
//
// Body: {
//   dealId, deliverableId, isRaw, version,
//   driveFileId, driveFolderId,
//   fileName, originalName,        // fileName = canonical, originalName = user's filename
//   mimeType, sizeBytes,
//   uploadedBy
// }

import { createClient } from '@supabase/supabase-js';
import { getFileMetadata } from '../../../../lib/drive';

export const runtime = 'nodejs';
export const maxDuration = 15;

function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      dealId, deliverableId, isRaw, version,
      driveFileId, driveFolderId,
      fileName, originalName,
      mimeType, sizeBytes,
      uploadedBy,
    } = body;

    if (!dealId || !driveFileId || !fileName) {
      return Response.json({ ok: false, error: 'Missing dealId / driveFileId / fileName' }, { status: 400 });
    }

    // Pull webViewLink from Drive (we don't trust the client to pass it)
    let webViewLink = null;
    try {
      const meta = await getFileMetadata(driveFileId);
      webViewLink = meta.webViewLink || null;
    } catch (e) {
      console.warn('getFileMetadata failed, saving row without webViewLink:', e.message);
    }

    const sb = adminSupabase();
    const { data, error } = await sb
      .from('deliverable_files')
      .insert({
        deal_id: dealId,
        deliverable_id: deliverableId || null,
        version: version || 1,
        is_raw: !!isRaw,
        file_name: fileName,
        original_name: originalName || fileName,
        drive_file_id: driveFileId,
        drive_folder_id: driveFolderId || null,
        mime_type: mimeType || null,
        size_bytes: sizeBytes || null,
        web_view_link: webViewLink,
        uploaded_by: uploadedBy || null,
      })
      .select('*')
      .single();

    if (error) {
      return Response.json({ ok: false, error: 'DB insert failed: ' + error.message }, { status: 500 });
    }

    return Response.json({ ok: true, file: data });
  } catch (e) {
    console.error('finalize-upload error:', e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
