import { NextResponse } from 'next/server';
import { authReadiness, serviceSigningKey } from '@/lib/auth';
import { BACKENDS, resolveOrigin } from '@/lib/backends';

export const runtime = 'nodejs';
export async function GET() {
  const auth = authReadiness(process.env);
  const keyReady = !!(await serviceSigningKey(process.env));
  const services = ['accounts', 'integrations', 'saas', 'knowledge'].map((name) => ({
    name, status: keyReady && resolveOrigin(BACKENDS[name], { ...process.env, NODE_ENV: 'production' }).ok ? 'configured' : 'unavailable',
  }));
  const ready = auth.ready && keyReady && services.every((s) => s.status === 'configured');
  return NextResponse.json({ status: ready ? 'ready' : 'configuration_required', authentication: auth,
    checks: [{ name: 'SOLO_WEB_SERVICE_PRIVATE_KEY', status: keyReady ? 'configured' : 'missing_or_invalid' }], services,
    pendingServices: ['today', 'cloud', 'production'].map((name) => ({ name, status: 'service_auth_unavailable' })),
  }, { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
