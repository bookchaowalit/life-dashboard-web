import { NextRequest, NextResponse } from 'next/server';

import { BACKENDS, isAllowed, resolveOrigin } from '@/lib/backends';
import { guardRequest } from '@/lib/request-guard';
import { authorizeOwner, SESSION_COOKIE, serviceAuthorization } from '@/lib/auth';
import { localDemo } from '@/lib/request-guard';

const APP_PORT = 3600;

type Context = { params: Promise<{ service: string; path: string[] }> };

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

async function forward(request: NextRequest, context: Context): Promise<NextResponse> {
  const guard = guardRequest(request, process.env, APP_PORT);
  if (!guard.ok) return failure(guard.status, guard.code, guard.message);
  const session = await authorizeOwner(request, request.cookies.get(SESSION_COOKIE)?.value, process.env);
  if (!session) return failure(401, 'authentication_required', 'กรุณาเข้าสู่ระบบด้วยบัญชีเจ้าของ');
  const { service, path } = await context.params;
  const backend = BACKENDS[service];
  const route = path.join('/');
  if (!backend) return failure(404, 'not_found', 'ไม่พบบริการนี้');
  if (!isAllowed(backend, request.method, route)) return failure(404, 'not_found', 'ไม่พบเส้นทางนี้');
  const origin = resolveOrigin(backend, process.env);
  if (!origin.ok) return failure(503, origin.code, origin.message);

  const headers = new Headers({ Accept: 'application/json' });
  const demo = localDemo(request, process.env);
  const isLoopbackBackend = origin.origin.startsWith('http://');
  // Broad legacy credentials are permitted only in an explicit local demo to a loopback backend.
  if (!demo || !isLoopbackBackend) {
    try {
      const authorization = await serviceAuthorization(service, session, process.env);
      if (!authorization) return failure(503, 'service_auth_unavailable', 'บริการนี้ยังไม่พร้อมสำหรับการเข้าถึงบนเว็บที่ยืนยันตัวตน');
      headers.set('Authorization', authorization);
    } catch { return failure(503, 'service_auth_unavailable', 'ยังตั้งค่าการยืนยันตัวตนของบริการไม่ครบ'); }
  }
  const hasBody = request.method !== 'GET';
  if (hasBody) headers.set('Content-Type', 'application/json');
  if (demo && isLoopbackBackend && hasBody && backend.serverHeaders) {
    for (const [name, value] of Object.entries(backend.serverHeaders(process.env))) headers.set(name, value);
  }
  let response: Response;
  try {
    response = await fetch(`${origin.origin}/api/${route}${request.nextUrl.search}`, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(backend.timeoutMs),
    });
  } catch {
    return failure(503, 'backend_unavailable', `ติดต่อ ${backend.label} API ไม่ได้ ตรวจว่า backend ทำงานอยู่แล้วลองใหม่`);
  }
  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  const outgoing: Record<string, string> = {
    'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  };
  if (!contentType.startsWith('application/json')) {
    outgoing['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'";
  }
  return new NextResponse(response.body, { status: response.status, headers: outgoing });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
