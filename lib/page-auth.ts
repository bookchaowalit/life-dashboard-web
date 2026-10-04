import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authorizeOwner, SESSION_COOKIE } from './auth';

export async function requirePageOwner() {
  const requestHeaders = await headers();
  const jar = await cookies();
  const session = await authorizeOwner({ method: 'GET', headers: new Headers(requestHeaders) }, jar.get(SESSION_COOKIE)?.value, process.env);
  if (!session) redirect('/login');
  return session;
}
