import { z } from 'zod';
import type { RestaurantSearchPort } from '@/lib/application/ports';
import { ApplicationError } from '@/lib/domain/errors';
import { plainSearchText, type LocalPlace } from '@/lib/domain/restaurants';
import { upstream } from './naver';

// 네이버 검색 API는 NAVER API HUB(NCP)로 이관됐다. 예전 openapi.naver.com 주소는 401을 반환한다.
const LOCAL_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/local';
const BLOG_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/blog';

const configured = () =>
  Boolean(process.env.NAVER_SEARCH_ID && process.env.NAVER_SEARCH_SECRET);

async function get(base: string, params: Record<string, string>) {
  if (!configured())
    throw new ApplicationError(
      'UNAVAILABLE',
      '네이버 검색 API 키 설정이 필요합니다.',
    );
  const url = new URL(base);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  const response = await upstream(url.href, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_SEARCH_ID!,
      'X-NCP-APIGW-API-KEY': process.env.NAVER_SEARCH_SECRET!,
    },
  });
  return response.json().catch(() => null);
}

const localResponse = z.object({
  items: z
    .array(
      z.object({
        title: z.string(),
        link: z.string().optional().default(''),
        category: z.string().optional().default(''),
        address: z.string().optional().default(''),
        roadAddress: z.string().optional().default(''),
      }),
    )
    .max(20),
});
const blogResponse = z.object({
  items: z
    .array(
      z.object({
        title: z.string().optional().default(''),
        description: z.string().optional().default(''),
      }),
    )
    .max(20),
});

const httpsLink = (link: string) => {
  try {
    const url = new URL(link);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : null;
  } catch {
    return null;
  }
};

export const naverSearch: RestaurantSearchPort = {
  now: () => Date.now(),
  configured,
  async local(query) {
    const parsed = localResponse.safeParse(
      await get(LOCAL_URL, { query, display: '5', sort: 'comment' }),
    );
    if (!parsed.success)
      throw new ApplicationError(
        'UPSTREAM_INVALID',
        '맛집 검색 응답이 올바르지 않습니다.',
      );
    return parsed.data.items.map(
      (item): LocalPlace => ({
        name: plainSearchText(item.title).slice(0, 100),
        category: plainSearchText(item.category).slice(0, 100),
        address: (item.roadAddress || item.address).slice(0, 200),
        link: httpsLink(item.link),
      }),
    );
  },
  async blog(query) {
    const parsed = blogResponse.safeParse(
      await get(BLOG_URL, { query, display: '5', sort: 'sim' }),
    );
    if (!parsed.success)
      throw new ApplicationError(
        'UPSTREAM_INVALID',
        '블로그 후기 응답이 올바르지 않습니다.',
      );
    return parsed.data.items.map((item) =>
      `${plainSearchText(item.title)} - ${plainSearchText(item.description)}`.slice(
        0,
        200,
      ),
    );
  },
};
