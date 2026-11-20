import {
  session,
  checkOrigin,
  failure,
  sessionCookie,
} from '@/lib/adapters/http';
import { cookies } from 'next/headers';
import { auth } from '@/lib/server';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await session(true);
    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function GET() {
  try {
    const jar = await cookies();
    return Response.json(await auth.status(jar.get(sessionCookie)?.value), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return failure(e);
  }
}
