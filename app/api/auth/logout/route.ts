import { cookies } from 'next/headers';
import { auth } from '@/lib/server';
import {
  checkOrigin,
  cookieOptions,
  failure,
  noStoreJson,
  oauthStateCookie,
  sessionCookie,
} from '@/lib/adapters/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const jar = await cookies();
    jar.set(
      sessionCookie,
      await auth.logout(jar.get(sessionCookie)?.value),
      cookieOptions(),
    );
    jar.set(oauthStateCookie, '', cookieOptions(0));
    return noStoreJson({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
