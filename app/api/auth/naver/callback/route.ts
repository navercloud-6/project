import { cookies } from 'next/headers';
import { auth } from '@/lib/server';
import {
  cookieOptions,
  oauthStateCookie,
  redirect303,
  sessionCookie,
} from '@/lib/adapters/http';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const jar = await cookies();
  const params = new URL(request.url).searchParams;
  const target = new URL(
    '/',
    process.env.APP_ORIGIN || new URL(request.url).origin,
  );
  try {
    const token = await auth.complete(
      jar.get(sessionCookie)?.value,
      jar.get(oauthStateCookie)?.value,
      params.get('state'),
      params.get('code'),
      params.has('error'),
    );
    jar.set(sessionCookie, token, cookieOptions());
    target.searchParams.set('login', 'success');
  } catch {
    target.searchParams.set(
      'login',
      params.has('error') ? 'cancelled' : 'failed',
    );
  }
  jar.set(oauthStateCookie, '', cookieOptions(0));
  return redirect303(target.href);
}
