import { NextResponse } from 'next/server';
import { getAuthUrl } from '@/utils/onedriveHelper';

export const runtime = 'edge';

// GET /api/auth/microsoft - Redirect to Microsoft login page
export async function GET() {
  try {
    const authUrl = getAuthUrl();
    return NextResponse.redirect(authUrl);
  } catch (err: any) {
    console.error('Error getting Microsoft auth URL:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

