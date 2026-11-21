import { ApplicationError } from '@/lib/domain/errors';
import {
  RESTAURANT_CACHE_MS,
  aboutPlace,
  restaurantQuerySchema,
  restaurantsResponseSchema,
  searchArea,
  selectRestaurants,
  verifiedMenus,
  type RestaurantsResponse,
} from '@/lib/domain/restaurants';
import type { AIPort, RestaurantSearchPort } from './ports';

const SOURCE = 'NAVER 지역 검색·블로그 후기';

/**
 * 시·군 맛집: 네이버 지역 검색(리뷰 많은 순) → 술집·타 지역 제외 → 블로그 후기 →
 * (CLOVA 키가 있으면) 후기에서 메뉴 추출 → 후기 한 건에 실제로 있는 메뉴만 남긴다.
 * 같은 지역은 10분간 캐시하고 동시 요청을 합친다.
 */
export function createRestaurants(search: RestaurantSearchPort, ai: AIPort) {
  const cache = new Map<string, RestaurantsResponse>();
  const pending = new Map<string, Promise<RestaurantsResponse>>();

  const stamp = (now: number) => ({
    fetchedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + RESTAURANT_CACHE_MS).toISOString(),
  });

  return async function fetchRestaurants(regionInput = '전체') {
    const { region } = restaurantQuerySchema.parse({ region: regionInput });
    if (!search.configured())
      return restaurantsResponseSchema.parse({
        region,
        mode: 'unavailable',
        source: SOURCE,
        ...stamp(search.now()),
        message: '맛집 정보는 네이버 검색 키 설정 후 제공됩니다.',
        items: [],
      });
    const cached = cache.get(region);
    if (cached && Date.parse(cached.expiresAt) > search.now()) return cached;
    const running = pending.get(region);
    if (running) return running;
    cache.delete(region);

    const request = (async () => {
      const area = searchArea(region);
      const picked = selectRestaurants(
        region,
        await search.local(`${area} 맛집`),
      );
      const reviews = await Promise.all(
        picked.map(async (p) =>
          (await search.blog(`${p.name} ${area} 메뉴`))
            .filter((text) => aboutPlace(p.name, text))
            .slice(0, 3),
        ),
      );
      const withReviews = picked.map((p, i) => ({
        name: p.name,
        reviews: reviews[i],
      }));
      const proposed =
        ai.capabilities().clova && withReviews.some((r) => r.reviews.length)
          ? await ai.restaurantMenus(
              withReviews.filter((r) => r.reviews.length),
            )
          : {};
      const result = restaurantsResponseSchema.parse({
        region,
        mode: 'live',
        source: SOURCE,
        ...stamp(search.now()),
        message:
          picked.length === 0 ? '조건에 맞는 맛집을 찾지 못했어요.' : null,
        items: picked.map((p, i) => ({
          ...p,
          menus: verifiedMenus(proposed[p.name] ?? [], reviews[i]),
        })),
      });
      cache.set(region, result);
      return result;
    })()
      .catch((error) => {
        if (error instanceof ApplicationError) throw error;
        throw new ApplicationError(
          'UPSTREAM_INVALID',
          '맛집 정보를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
        );
      })
      .finally(() => pending.delete(region));
    pending.set(region, request);
    return request;
  };
}
