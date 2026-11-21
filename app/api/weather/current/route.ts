import { fetchCityWeather } from '@/lib/server';
import { failure } from '@/lib/adapters/http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const cityId = new URL(request.url).searchParams.get('cityId') ?? undefined;
    return Response.json(await fetchCityWeather(cityId), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const response = failure(error);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
