import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aboutPlace,
  plainSearchText,
  selectRestaurants,
  verifiedMenus,
  type LocalPlace,
} from '../lib/domain/restaurants';
import { briefingFacts, ruleScript } from '../lib/domain/briefing';
import { buildDemoWeather } from '../lib/domain/weather';
import { places } from '../lib/domain/catalog';
import { createRestaurants } from '../lib/application/restaurants';
import { naverSearch } from '../lib/adapters/naver-search';
import type { AIPort, RestaurantSearchPort } from '../lib/application/ports';

const place = (patch: Partial<LocalPlace>): LocalPlace => ({
  name: '가게',
  category: '한식>육류,고기요리',
  address: '경기도 수원시 팔달구 정조로 1',
  link: null,
  ...patch,
});

test('검색 강조 태그와 HTML 엔티티를 지운다', () => {
  assert.equal(
    plainSearchText('<b>수원</b> 갈비 &amp; 냉면&#39;s'),
    "수원 갈비 & 냉면's",
  );
});

test('맛집은 술집·다른 시도·다른 시·군·중복을 빼고 최대 5곳만 남긴다', () => {
  const picked = selectRestaurants('광주시', [
    place({ name: 'A', address: '경기도 광주시 퇴촌면 1' }),
    place({ name: 'B', address: '광주광역시 동구 충장로 1' }),
    place({
      name: 'C',
      address: '경기 광주시 오포읍 1',
      category: '술집>요리주점',
    }),
    place({ name: 'D', address: '경기도 성남시 분당구 1' }),
    place({ name: 'A', address: '경기도 광주시 곤지암읍 1' }),
    place({ name: 'E', address: '경기 광주시 초월읍 1' }),
  ]);
  assert.deepEqual(
    picked.map((p) => p.name),
    ['A', 'E'],
  );
  const many = Array.from({ length: 8 }, (_, i) => place({ name: `가게${i}` }));
  assert.equal(selectRestaurants('수원시', many).length, 5);
  assert.equal(
    selectRestaurants('전체', [place({ address: '서울특별시 중구 1' })]).length,
    0,
  );
});

test('메뉴는 후기 한 건 안에 통째로 있어야 하고 최대 3개다', () => {
  const reviews = ['왕갈비 정식이 맛있어요 - 냉면도 추천', '물 냉 면 은 별로'];
  assert.deepEqual(
    verifiedMenus(['왕갈비정식', '냉면', '불고기', '냉면'], reviews),
    ['왕갈비정식', '냉면'],
  );
  // 두 후기를 이어 붙여야만 생기는 '추천물'은 통과하지 않는다.
  assert.deepEqual(verifiedMenus(['추천물'], reviews), []);
  assert.deepEqual(verifiedMenus(['가', '나', '다', '라'], ['가나다라']), [
    '가',
    '나',
    '다',
  ]);
  assert.ok(aboutPlace('백소정 수원역점', '백소정에서 먹은 마제소바'));
  assert.ok(!aboutPlace('백소정 수원역점', '다른 집 마제소바'));
});

function fakeSearch(configured = true) {
  const calls: string[] = [];
  let now = Date.parse('2026-11-21T05:00:00Z');
  const port: RestaurantSearchPort = {
    now: () => now,
    configured: () => configured,
    local: async (query) => {
      calls.push(`local:${query}`);
      return [
        place({ name: '갈비집 본점' }),
        place({ name: '호프집', category: '술집>호프' }),
        place({ name: '국수집' }),
      ];
    },
    blog: async (query) => {
      calls.push(`blog:${query}`);
      return query.startsWith('갈비집')
        ? ['갈비집 후기 - 왕갈비 정식과 물냉면', '다른 가게 이야기 - 짜장면']
        : [];
    },
  };
  return { port, calls, tick: (ms: number) => (now += ms) };
}
const ai = (clova: boolean, menus: Record<string, string[]>): AIPort =>
  ({
    capabilities: () => ({ clova, voice: false, translate: false, ocr: false }),
    restaurantMenus: async () => menus,
  }) as unknown as AIPort;

test('키가 없으면 외부 호출 없이 설정 안내를 돌려준다', async () => {
  const { port, calls } = fakeSearch(false);
  const result = await createRestaurants(port, ai(true, {}))('수원시');
  assert.equal(result.mode, 'unavailable');
  assert.deepEqual(result.items, []);
  assert.match(result.message ?? '', /검색 키/);
  assert.deepEqual(calls, []);
});

test('AI가 낸 메뉴도 후기 검증을 통과한 것만 남기고 지역별 10분 캐시한다', async () => {
  const { port, calls, tick } = fakeSearch();
  const fetch = createRestaurants(
    port,
    ai(true, { '갈비집 본점': ['왕갈비 정식', '짜장면', '양념게장'] }),
  );
  const [first, again] = await Promise.all([fetch('수원시'), fetch('수원시')]);
  assert.equal(first, again, '동시 요청은 한 번만 검색한다');
  assert.equal(first.mode, 'live');
  assert.deepEqual(
    first.items.map((i) => [i.name, i.menus]),
    [
      ['갈비집 본점', ['왕갈비 정식']],
      ['국수집', []],
    ],
  );
  assert.deepEqual(calls, [
    'local:경기도 수원시 맛집',
    'blog:갈비집 본점 경기도 수원시 메뉴',
    'blog:국수집 경기도 수원시 메뉴',
  ]);
  tick(9 * 60 * 1000);
  await fetch('수원시');
  assert.equal(calls.length, 3, '10분 안에는 다시 검색하지 않는다');
  tick(2 * 60 * 1000);
  await fetch('수원시');
  assert.equal(calls.length, 6, '10분이 지나면 다시 검색한다');
  await assert.rejects(fetch('서울'));
});

test('CLOVA 키가 없으면 메뉴 없이 맛집만 보여준다', async () => {
  const { port } = fakeSearch();
  const result = await createRestaurants(port, ai(false, {}))('수원시');
  assert.ok(result.items.every((i) => i.menus.length === 0));
});

test('어댑터는 NAVER API HUB 주소·헤더로 요청하고 응답을 정리한다', async () => {
  const oldFetch = globalThis.fetch;
  const oldId = process.env.NAVER_SEARCH_ID;
  const oldSecret = process.env.NAVER_SEARCH_SECRET;
  process.env.NAVER_SEARCH_ID = 'test-id';
  process.env.NAVER_SEARCH_SECRET = 'test-secret';
  const seen: string[] = [];
  try {
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      seen.push(
        `${url.hostname}${url.pathname}?sort=${url.searchParams.get('sort')}`,
      );
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('X-NCP-APIGW-API-KEY-ID'), 'test-id');
      assert.equal(headers.get('X-NCP-APIGW-API-KEY'), 'test-secret');
      return url.pathname.endsWith('/local')
        ? Response.json({
            items: [
              {
                title: '<b>갈비</b>집',
                link: 'javascript:alert(1)',
                category: '한식&gt;육류',
                address: '경기도 수원시 팔달구 1',
                roadAddress: '경기도 수원시 팔달구 정조로 1',
              },
            ],
          })
        : Response.json({
            items: [
              { title: '<b>갈비</b>집', description: '왕갈비 &amp; 냉면' },
            ],
          });
    };
    const [item] = await naverSearch.local('경기도 수원시 맛집');
    assert.deepEqual(item, {
      name: '갈비집',
      category: '한식>육류',
      address: '경기도 수원시 팔달구 정조로 1',
      link: null,
    });
    assert.deepEqual(await naverSearch.blog('갈비집 메뉴'), [
      '갈비집 - 왕갈비 & 냉면',
    ]);
    assert.deepEqual(seen, [
      'naverapihub.apigw.ntruss.com/search/v1/local?sort=comment',
      'naverapihub.apigw.ntruss.com/search/v1/blog?sort=sim',
    ]);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldId === undefined) delete process.env.NAVER_SEARCH_ID;
    else process.env.NAVER_SEARCH_ID = oldId;
    if (oldSecret === undefined) delete process.env.NAVER_SEARCH_SECRET;
    else process.env.NAVER_SEARCH_SECRET = oldSecret;
  }
});

test('통합 안내 원고는 맛집과 검증된 메뉴를 명소 다음에 말한다', () => {
  const weather = buildDemoWeather(
    '수원시',
    Date.parse('2026-11-21T03:00:00Z'),
  );
  const facts = briefingFacts(weather, places, [
    {
      name: '갈비집 본점',
      category: '한식>육류,고기요리',
      address: '경기도 수원시 팔달구 1',
      link: null,
      menus: ['왕갈비 정식'],
    },
  ]);
  assert.deepEqual(facts.restaurants, [
    { name: '갈비집 본점', category: '육류,고기요리', menus: ['왕갈비 정식'] },
  ]);
  const script = ruleScript(facts);
  assert.ok(script.indexOf('추천 명소') < script.indexOf('맛집은 갈비집 본점'));
  assert.match(script, /후기에 자주 나온 메뉴는 왕갈비 정식입니다/);
});
