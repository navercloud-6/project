import { session, checkOrigin, failure } from '@/lib/adapters/http';
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
    return Response.json(
      await auth.status(jar.get('tourpass-session')?.value),
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
