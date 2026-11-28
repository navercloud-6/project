import { z } from 'zod';
import { weatherQuerySchema } from './weather';

export const RESTAURANT_CACHE_MS = 10 * 60 * 1000;
export const RESTAURANT_LIMIT = 5;
export const MENU_LIMIT = 3;
// 분류에 이 단어가 있으면 여행 안내 맛집에서 뺀다.
export const EXCLUDED_CATEGORIES = ['술집'] as const;

export const restaurantQuerySchema = weatherQuerySchema;

export const restaurantSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.string().max(100),
  address: z.string().max(200),
  link: z.string().url().nullable(),
  menus: z.array(z.string().min(1).max(40)).max(MENU_LIMIT),
});
export type Restaurant = z.infer<typeof restaurantSchema>;

export const restaurantsResponseSchema = z.object({
  region: z.string(),
  mode: z.enum(['live', 'unavailable']),
  source: z.string(),
  fetchedAt: z.string(),
  expiresAt: z.string(),
  message: z.string().nullable(),
  items: z.array(restaurantSchema).max(RESTAURANT_LIMIT),
});
export type RestaurantsResponse = z.infer<typeof restaurantsResponseSchema>;

/** 검색 결과의 원자료(어댑터가 채운다). */
export type LocalPlace = {
  name: string;
  category: string;
  address: string;
  link: string | null;
};

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

/** 검색 API의 강조 태그(<b>)와 HTML 엔티티를 지운다. */
export function plainSearchText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39|apos);/g, (m) => ENTITIES[m] ?? m)
    .trim();
}

export const searchArea = (region: string) =>
  region === '전체' ? '경기도' : `경기도 ${region}`;

/**
 * 선택 지역의 맛집만 남긴다.
 * - 분류에 술집이 있으면 제외
 * - 주소가 경기도가 아니면 제외(예: '광주시' 검색에 섞인 광주광역시)
 * - 시·군을 고른 경우 주소에 그 시·군 이름이 있어야 한다
 * - 같은 이름은 한 번만
 */
export function selectRestaurants(
  region: string,
  candidates: LocalPlace[],
): LocalPlace[] {
  const seen = new Set<string>();
  const out: LocalPlace[] = [];
  for (const p of candidates) {
    if (EXCLUDED_CATEGORIES.some((c) => p.category.includes(c))) continue;
    if (!/^경기(?:도)?\s/.test(p.address)) continue;
    if (region !== '전체' && !p.address.includes(region)) continue;
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    out.push(p);
    if (out.length === RESTAURANT_LIMIT) break;
  }
  return out;
}

const squash = (text: string) => text.replace(/\s+/g, '');

/** 블로그 글이 이 가게 이야기인지 본다('백소정 수원역점' → '백소정'이 들어 있어야 함). */
export function aboutPlace(name: string, snippet: string): boolean {
  const core = squash(name.split(/\s+/)[0] ?? '');
  return core.length > 0 && squash(snippet).includes(core);
}

/**
 * 인기 메뉴 검증: 후기 '한 건' 안에 메뉴 이름이 통째로 있어야 통과한다.
 * 여러 후기를 이어 붙여 우연히 생기는 일치와 AI가 지어낸 메뉴를 막는다.
 */
export function verifiedMenus(menus: string[], reviews: string[]): string[] {
  const texts = reviews.map(squash).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const menu of menus) {
    const key = squash(menu);
    if (!key || seen.has(key)) continue;
    if (texts.some((t) => t.includes(key))) {
      seen.add(key);
      out.push(menu.trim());
      if (out.length === MENU_LIMIT) break;
    }
  }
  return out;
}
