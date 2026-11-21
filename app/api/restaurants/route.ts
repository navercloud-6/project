import { fetchRestaurants } from '@/lib/server';
import { failure } from '@/lib/adapters/http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const region = new URL(request.url).searchParams.get('region') ?? '전체';
    return Response.json(await fetchRestaurants(region), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const response = failure(error);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
