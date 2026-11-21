import { fetchCityWeather } from '@/lib/server';
import { failure, noStoreJson } from '@/lib/adapters/http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const cityId = new URL(request.url).searchParams.get('cityId') ?? undefined;
    return noStoreJson(await fetchCityWeather(cityId));
  } catch (error) {
    return failure(error);
  }
}
