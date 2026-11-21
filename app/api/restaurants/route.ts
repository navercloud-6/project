import { fetchRestaurants } from '@/lib/server';
import { failure, noStoreJson } from '@/lib/adapters/http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const region = new URL(request.url).searchParams.get('region') ?? '전체';
    return noStoreJson(await fetchRestaurants(region));
  } catch (error) {
    return failure(error);
  }
}
