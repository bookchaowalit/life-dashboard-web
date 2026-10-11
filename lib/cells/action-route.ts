/**
 * Shared guard for the owner write routes: Host/Origin/Content-Type guard, owner session, bounded JSON body,
 * and a fixed Thai error vocabulary (no upstream detail). The handler receives the parsed body and process env.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { authorizeOwner, SESSION_COOKIE } from '@/lib/auth';
import { guardRequest } from '@/lib/request-guard';
import { CellError, type Env } from './core';
import { reasonText } from './messages';

const APP_PORT = 3600;
const MAX_BODY = 2048;

export function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function ownerAction(
  request: NextRequest, handler: (body: Record<string, unknown>, env: Env) => Promise<unknown>,
): Promise<NextResponse> {
  const guard = guardRequest(request, process.env, APP_PORT);
  if (!guard.ok) return failure(guard.status, guard.code, guard.message);
  const session = await authorizeOwner(request, request.cookies.get(SESSION_COOKIE)?.value, process.env);
  if (!session) return failure(401, 'authentication_required', 'กรุณาเข้าสู่ระบบด้วยบัญชีเจ้าของ');
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return failure(413, 'payload_too_large', 'คำขอใหญ่เกินไป');
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
    body = parsed as Record<string, unknown>;
  } catch { return failure(400, 'invalid_body', 'รูปแบบคำขอไม่ถูกต้อง'); }
  try {
    const result = await handler(body, process.env);
    return NextResponse.json({ ok: true, ...(result && typeof result === 'object' ? result : {}) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof CellError) {
      const status = error.code === 'not_found' ? 404 : error.code === 'conflict' ? 409 : error.code === 'invalid' ? 400
        : error.code === 'not_configured' ? 503 : 502;
      const label = error.code === 'not_configured' || error.code === 'unreachable' ? 'ไม่พร้อมใช้งาน' : 'บันทึกไม่สำเร็จ';
      return failure(status, error.code === 'not_configured' ? 'cell_unavailable' : error.code, `${label}: ${reasonText(error.code)}`);
    }
    return failure(500, 'internal_error', 'บันทึกไม่สำเร็จ');
  }
}
