import { fetchWeather } from '@/lib/server';
import { failure } from '@/lib/adapters/http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const region = url.searchParams.get('region') ?? '전체';
    const data = await fetchWeather(region);
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error);
  }
}
