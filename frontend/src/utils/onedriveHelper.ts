import { getDb, schema } from '@/db';
import { eq } from 'drizzle-orm';

// Microsoft OAuth endpoints
const OAUTH_AUTHORIZE_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const OAUTH_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

function getCredentials() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3000/api/auth/callback/microsoft';

  return { clientId, clientSecret, redirectUri };
}

// 1. Generate the authorization URL for user consent
export function getAuthUrl() {
  const { clientId, redirectUri } = getCredentials();
  if (!clientId) {
    throw new Error('MICROSOFT_CLIENT_ID is not configured in the environment.');
  }
  const scope = encodeURIComponent('offline_access Files.ReadWrite');
  return `${OAUTH_AUTHORIZE_URL}?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${scope}`;
}

// 2. Exchange authorization code for tokens
export async function exchangeCodeForTokens(db: any, code: string) {
  const { clientId, clientSecret, redirectUri } = getCredentials();
  if (!clientId || !clientSecret) {
    throw new Error('Microsoft OAuth client credentials are not fully configured.');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Failed to exchange code: ${JSON.stringify(errorData)}`);
  }

  const data = await response.json() as any;
  const { refresh_token } = data;

  if (refresh_token) {
    await saveRefreshToken(db, refresh_token);
  }

  return data;
}

// Helper to load refresh token from database
async function getRefreshToken(db: any): Promise<string | null> {
  const result = await db.select().from(schema.systemSettings).where(eq(schema.systemSettings.key, 'microsoft_refresh_token')).limit(1);
  return result.length > 0 ? result[0].value : null;
}

// Helper to save refresh token in database
async function saveRefreshToken(db: any, token: string) {
  const existing = await db.select().from(schema.systemSettings).where(eq(schema.systemSettings.key, 'microsoft_refresh_token')).limit(1);
  if (existing.length > 0) {
    await db.update(schema.systemSettings)
      .set({ value: token, updatedAt: Date.now() })
      .where(eq(schema.systemSettings.key, 'microsoft_refresh_token'));
  } else {
    await db.insert(schema.systemSettings).values({
      key: 'microsoft_refresh_token',
      value: token,
      updatedAt: Date.now()
    });
  }
}

// 3. Obtain a fresh Access Token using the stored Refresh Token
export async function getFreshAccessToken(db: any): Promise<string> {
  const refreshToken = await getRefreshToken(db);
  if (!refreshToken) {
    throw new Error('No Microsoft OneDrive refresh token found. Please authenticate first via /api/auth/microsoft');
  }

  const { clientId, clientSecret } = getCredentials();
  if (!clientId || !clientSecret) {
    throw new Error('Microsoft OAuth client credentials are not fully configured.');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Failed to refresh token: ${JSON.stringify(errorData)}`);
  }

  const data = await response.json() as any;
  const { access_token, refresh_token: newRefreshToken } = data;

  // Save new refresh token if Microsoft returned one
  if (newRefreshToken && newRefreshToken !== refreshToken) {
    await saveRefreshToken(db, newRefreshToken);
  }

  return access_token;
}

// 4. Upload raw file buffer/blob to OneDrive
export async function uploadFileToOneDrive(
  db: any,
  filename: string,
  fileData: ArrayBuffer,
  mimeType: string
): Promise<{ id: string; webUrl: string }> {
  const accessToken = await getFreshAccessToken(db);
  
  // Sanitize filename to avoid path traversal or illegal characters
  const safeFilename = encodeURIComponent(filename.replace(/[^a-zA-Z0-9.\-_ ]/g, '_'));
  
  // Upload file using Microsoft Graph API (under /TravelPlanner/ folder)
  const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/TravelPlanner/${safeFilename}:/content`;
  
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': mimeType,
    },
    body: fileData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OneDrive upload failed: ${response.status} - ${errText}`);
  }

  const fileInfo = await response.json() as any;
  const itemId = fileInfo.id;

  // Create an anonymous, viewable sharing link for the file
  const shareUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/createLink`;
  const shareResponse = await fetch(shareUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'view',
      scope: 'anonymous'
    }),
  });

  let viewUrl = fileInfo.webUrl;
  if (shareResponse.ok) {
    const shareInfo = await shareResponse.json() as any;
    // Use link.webUrl from sharing response if available
    if (shareInfo.link && shareInfo.link.webUrl) {
      viewUrl = shareInfo.link.webUrl;
    }
  } else {
    console.warn('Could not create sharing link, falling back to default OneDrive webUrl');
  }

  return {
    id: itemId,
    webUrl: viewUrl
  };
}
