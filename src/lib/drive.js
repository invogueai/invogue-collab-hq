// Google Drive helper — OAuth 2.0 user credentials with refresh token
//
// How it works:
//  - Admin clicks "Connect Google Drive" once in the dashboard
//  - User authenticates with @invogue.shop Google account + grants Drive scope
//  - We store the refresh_token in the `integrations` table in Supabase
//  - Every Drive API call uses the refresh_token to get a fresh access_token (cached in memory)
//  - Files are uploaded as the authenticated user → clean audit trail in Drive
//
// Consent screen MUST be set to "Internal" in Google Cloud Console so refresh tokens
// don't expire after 7 days. With Internal + Workspace, refresh tokens are permanent
// until manually revoked.

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SCOPE = 'https://www.googleapis.com/auth/drive';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const ROOT_NAME = 'Invogue Collabs Dashboard';
const INTEGRATION_ID = 'google_drive';

// In-memory access-token cache. Reused across invocations in a warm Lambda.
// Refresh tokens are persistent, access tokens expire after 1 hour.
let tokenCache = { token: null, expiresAt: 0 };

function getOAuthConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const sharedDriveId = process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID;
  if (!clientId || !clientSecret || !redirectUri || !sharedDriveId) {
    throw new Error('Missing Google OAuth env vars. Need GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI, GOOGLE_DRIVE_SHARED_DRIVE_ID');
  }
  return { clientId, clientSecret, redirectUri, sharedDriveId };
}

function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── OAuth flow: initial consent ──

// Build the URL the user is redirected to for consent.
// `state` is a random token we'll verify on the callback to prevent CSRF.
export function getAuthorizationUrl({ state, hd } = {}) {
  const { clientId, redirectUri } = getOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: `${SCOPE} https://www.googleapis.com/auth/userinfo.email`,
    access_type: 'offline',     // returns refresh_token
    prompt: 'consent',           // always force consent screen (guarantees a refresh_token)
    include_granted_scopes: 'true',
    ...(state ? { state } : {}),
    ...(hd ? { hd } : {}),       // hd=invogue.shop restricts to that Workspace domain
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code) {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Code exchange failed: ${resp.status} ${err}`);
  }
  return resp.json(); // { access_token, refresh_token, expires_in, id_token, scope, token_type }
}

export async function getUserEmailFromAccessToken(accessToken) {
  try {
    const resp = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) return null;
    const d = await resp.json();
    return d.email || null;
  } catch {
    return null;
  }
}

export async function saveIntegration({ refreshToken, email }) {
  if (!refreshToken) throw new Error('No refresh_token returned — did you set prompt=consent?');
  const sb = adminSupabase();
  const now = new Date().toISOString();
  const { error } = await sb.from('integrations').upsert({
    id: INTEGRATION_ID,
    refresh_token: refreshToken,
    connected_email: email || null,
    connected_at: now,
    updated_at: now,
  });
  if (error) throw new Error('Save integration failed: ' + error.message);
  // Invalidate the in-memory cache so we pick up the new refresh token
  tokenCache = { token: null, expiresAt: 0 };
}

export async function getConnectionStatus() {
  try {
    const sb = adminSupabase();
    const { data, error } = await sb
      .from('integrations')
      .select('connected_email,connected_at')
      .eq('id', INTEGRATION_ID)
      .maybeSingle();
    if (error || !data) return { connected: false };
    return { connected: true, email: data.connected_email, connectedAt: data.connected_at };
  } catch {
    return { connected: false };
  }
}

export async function disconnectIntegration() {
  const sb = adminSupabase();
  await sb.from('integrations').delete().eq('id', INTEGRATION_ID);
  tokenCache = { token: null, expiresAt: 0 };
}

// ── Runtime: refresh token → access token ──

async function getStoredRefreshToken() {
  const sb = adminSupabase();
  const { data, error } = await sb
    .from('integrations')
    .select('refresh_token')
    .eq('id', INTEGRATION_ID)
    .maybeSingle();
  if (error) throw new Error('Could not read integration: ' + error.message);
  if (!data || !data.refresh_token) {
    throw new Error('GOOGLE_DRIVE_NOT_CONNECTED');
  }
  return data.refresh_token;
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.token && tokenCache.expiresAt > now + 60) return tokenCache.token;

  const { clientId, clientSecret } = getOAuthConfig();
  const refreshToken = await getStoredRefreshToken();

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Token refresh failed: ${resp.status} ${err}. You may need to reconnect Google Drive.`);
  }
  const data = await resp.json();
  tokenCache = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) };
  return data.access_token;
}

// ── Drive API wrappers ──

function driveQueryParams(extra = {}) {
  const { sharedDriveId } = getOAuthConfig();
  return new URLSearchParams({
    corpora: 'drive',
    driveId: sharedDriveId,
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
    ...extra,
  });
}

async function driveFetch(path, init = {}) {
  const token = await getAccessToken();
  const resp = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Drive API ${path}: ${resp.status} ${err}`);
  }
  return resp.json();
}

async function findFolder(name, parentId) {
  const escapedName = name.replace(/'/g, "\\'");
  const q = `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${escapedName}' and '${parentId}' in parents`;
  const params = driveQueryParams({ q, fields: 'files(id,name)', pageSize: '10' });
  const data = await driveFetch(`/files?${params.toString()}`);
  return data.files?.[0]?.id || null;
}

async function createFolder(name, parentId) {
  const body = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId],
  };
  const params = new URLSearchParams({ supportsAllDrives: 'true', fields: 'id,name' });
  const data = await driveFetch(`/files?${params.toString()}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data.id;
}

async function findOrCreateFolder(name, parentId) {
  const existing = await findFolder(name, parentId);
  if (existing) return existing;
  return createFolder(name, parentId);
}

export function sanitizeName(str) {
  if (!str) return 'Untitled';
  return String(str)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Untitled';
}

export async function ensureDealFolderTree({ campaignName, influencerName, collabId, productLabel }) {
  const { sharedDriveId } = getOAuthConfig();

  const rootName = sanitizeName(ROOT_NAME);
  const campaign = sanitizeName(campaignName || 'Unassigned Campaign');
  const influencer = sanitizeName(influencerName || 'Unknown Influencer');
  const collab = sanitizeName(`${collabId || 'NEW'} ${productLabel || ''}`.trim());

  const rootId = await findOrCreateFolder(rootName, sharedDriveId);
  const campaignId = await findOrCreateFolder(campaign, rootId);
  const influencerId = await findOrCreateFolder(influencer, campaignId);
  const collabFolderId = await findOrCreateFolder(collab, influencerId);
  const rawFolderId = await findOrCreateFolder('RAW', collabFolderId);

  return { rootId, campaignId, influencerId, collabFolderId, rawFolderId };
}

export async function createResumableUploadSession({
  parentFolderId,
  fileName,
  mimeType,
  sizeBytes,
  origin, // browser origin that will PUT the bytes — Google uses this to whitelist CORS on the session URL
}) {
  const token = await getAccessToken();
  const metadata = {
    name: fileName,
    parents: [parentFolderId],
    mimeType: mimeType || 'application/octet-stream',
  };
  const params = new URLSearchParams({
    uploadType: 'resumable',
    supportsAllDrives: 'true',
    fields: 'id,name,mimeType,size,webViewLink,parents',
  });
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': metadata.mimeType,
    ...(sizeBytes ? { 'X-Upload-Content-Length': String(sizeBytes) } : {}),
  };
  // CORS handshake: tell Google this session will be used from a browser at `origin`.
  // Without this, the browser PUT succeeds on Google's side but the response has no
  // Access-Control-Allow-Origin header, so the browser blocks the response body →
  // XHR fires onerror ("Network error") even though the file was uploaded.
  if (origin) headers['Origin'] = origin;
  const resp = await fetch(`${DRIVE_UPLOAD}/files?${params.toString()}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(metadata),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Resumable init failed: ${resp.status} ${err}`);
  }
  const uploadUrl = resp.headers.get('location');
  if (!uploadUrl) throw new Error('Drive did not return a resumable upload URL');
  return { uploadUrl };
}

export async function getFileMetadata(fileId) {
  const params = new URLSearchParams({
    supportsAllDrives: 'true',
    fields: 'id,name,mimeType,size,webViewLink,parents,createdTime,md5Checksum',
  });
  return driveFetch(`/files/${fileId}?${params.toString()}`);
}

// ── Naming helpers ──

export function nextVersionFor(rows) {
  if (!rows || rows.length === 0) return 1;
  const maxV = Math.max(...rows.map(r => r.version || 0));
  return maxV + 1;
}

export function buildFileName({ collabId, deliverableType, version, isRaw, rawIndex, originalExt }) {
  const ext = (originalExt || '').replace(/^\./, '').toLowerCase() || 'bin';
  const id = sanitizeName(collabId || 'NEW').replace(/\s+/g, '-');
  if (isRaw) {
    const idx = String(rawIndex || 1).padStart(2, '0');
    return `${id}_raw_clip_${idx}.${ext}`;
  }
  const type = sanitizeName(deliverableType || 'deliverable').replace(/\s+/g, '-');
  return `${id}_${type}_v${version || 1}.${ext}`;
}

// ── CSRF state token helper (used by the OAuth start/callback routes) ──

export function makeStateToken() {
  return crypto.randomBytes(24).toString('hex');
}
