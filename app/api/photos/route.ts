import { placeIdSchema } from '@/lib/domain/contracts';
import {
  checkOrigin,
  session,
  failure,
  toResponseBytes,
} from '@/lib/adapters/http';
import { safeImage } from '@/lib/adapters/images';
import { hasPhoto, photoFor, operations } from '@/lib/server';
import { ApplicationError } from '@/lib/domain/errors';
import { z } from 'zod';

const query = z.object({ journey: z.string().uuid(), place: placeIdSchema });
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const owner = await session();
    const { searchParams } = new URL(request.url);
    const q = query.parse(Object.fromEntries(searchParams));
    if (searchParams.has('metadata'))
      return Response.json(
        { exists: await hasPhoto(owner, q.journey, q.place) },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    const photo = await photoFor(owner, q.journey, q.place);
    if (!photo)
      throw new ApplicationError('NOT_FOUND', '저장한 사진이 없습니다.');
    return new Response(toResponseBytes(photo.image), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline; filename="travel.jpg"',
      },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const owner = await session();
    const q = query.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return Response.json({
      journey: await operations.uploadPhoto(owner, q.journey, q.place, () =>
        safeImage(request),
      ),
    });
  } catch (error) {
    return failure(error);
  }
}
