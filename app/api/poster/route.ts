import { checkOrigin, session, failure } from '@/lib/adapters/http';
import { safeImage } from '@/lib/adapters/images';
import { operations } from '@/lib/server';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const owner = await session();
    return Response.json(
      await operations.poster(owner, () => safeImage(request)),
    );
  } catch (error) {
    return failure(error);
  }
}
