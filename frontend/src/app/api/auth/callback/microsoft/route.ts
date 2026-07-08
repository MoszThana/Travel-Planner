
import { NextResponse } from 'next/server';
import { getSafeDb } from '@/db';
import { exchangeCodeForTokens } from '@/utils/onedriveHelper';

export const runtime = 'edge';

// GET /api/auth/callback/microsoft - Handle OAuth2 redirect
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  if (error) {
    console.error('Microsoft OAuth callback error:', error, errorDescription);
    return NextResponse.json({ error, description: errorDescription }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'Missing code parameter' }, { status: 400 });
  }

  try {
    
    const db = getSafeDb();

    await exchangeCodeForTokens(db, code);

    // Redirect user back to the home page with a success query parameter
    const origin = new URL(request.url).origin;
    return NextResponse.redirect(`${origin}/?auth=microsoft-success`);
  } catch (err: any) {
    console.error('Microsoft OAuth callback processing failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

