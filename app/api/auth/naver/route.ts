import { cookies } from 'next/headers';
import { auth } from '@/lib/server';
import {
  checkOrigin,
  cookieOptions,
  failure,
  sessionCookie,
} from '@/lib/adapters/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const jar = await cookies();
    const login = auth.begin(jar.get(sessionCookie)?.value);
    jar.set(sessionCookie, login.token, cookieOptions());
    jar.set('tourpass-oauth-state', login.state, cookieOptions(600));
    return new Response(null, {
      status: 303,
      headers: {
        Location: login.url,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    return failure(error);
  }
}
