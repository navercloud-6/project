import { cookies } from 'next/headers';
import { auth } from '@/lib/server';
import {
  checkOrigin,
  cookieOptions,
  failure,
  oauthStateCookie,
  redirect303,
  sessionCookie,
} from '@/lib/adapters/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const jar = await cookies();
    const login = await auth.begin(jar.get(sessionCookie)?.value);
    jar.set(sessionCookie, login.token, cookieOptions());
    jar.set(oauthStateCookie, login.state, cookieOptions(600));
    return redirect303(login.url);
  } catch (error) {
    return failure(error);
  }
}
