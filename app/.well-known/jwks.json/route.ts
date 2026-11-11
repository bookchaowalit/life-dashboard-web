import { NextResponse } from 'next/server';
import { issuerJwks } from '@/lib/jwks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public signing keys for this site's service tokens (read by the edge gateway). */
export function GET() {
  return NextResponse.json(issuerJwks(process.env), { headers: { 'Cache-Control': 'public, max-age=300' } });
}
