import {
  session,
  checkOrigin,
  failure,
  noStoreJson,
  sessionCookie,
} from '@/lib/adapters/http';
import { cookies } from 'next/headers';
import { auth } from '@/lib/server';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await session(true);
    return noStoreJson({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function GET() {
  try {
    const jar = await cookies();
    return noStoreJson(await auth.status(jar.get(sessionCookie)?.value));
  } catch (e) {
    return failure(e);
  }
}
