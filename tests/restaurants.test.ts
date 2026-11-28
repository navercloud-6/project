import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aboutPlace,
  plainSearchText,
  selectRestaurants,
  verifiedMenus,
  type LocalPlace,
} from '../lib/domain/restaurants';
import {
  briefingFacts,
  ruleScript,
  spokenKorean,
  menuSentence,
  kindSentence,
  withReasons,
  placesTail,
  foodKind,
} from '../lib/domain/briefing';
import { buildDemoWeather } from '../lib/domain/weather';
import { places } from '../lib/domain/catalog';
import {
  createPlaceReviews,
  createRestaurants,
} from '../lib/application/restaurants';
import { naverSearch } from '../lib/adapters/naver-search';
import { parseRestaurantMenus } from '../lib/adapters/naver';
import { parseAI } from '../lib/adapters/ai-output';
import { z } from 'zod';
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

test('AI 메뉴 추출이 실패해도 맛집 목록은 그대로 보여 주고 실패 결과는 캐시하지 않는다', async () => {
  const { port, calls } = fakeSearch();
  let shouldFail = true;
  const flakyAi = {
    capabilities: () => ({
      clova: true,
      voice: false,
      translate: false,
      ocr: false,
    }),
    restaurantMenus: async () => {
      if (shouldFail) throw new Error('bad ai output');
      return { 갈비집본점: ['왕갈비 정식'] };
    },
  } as unknown as AIPort;
  const fetch = createRestaurants(port, flakyAi);

  const degraded = await fetch('수원시');
  assert.equal(degraded.mode, 'live');
  assert.deepEqual(
    degraded.items.map((i) => [i.name, i.menus]),
    [
      ['갈비집 본점', []],
      ['국수집', []],
    ],
  );
  assert.equal(calls.length, 3);

  // 실패한 메뉴 추출 결과는 캐시하지 않으므로 다음 요청에서 다시 시도해 메뉴를 채운다.
  shouldFail = false;
  const recovered = await fetch('수원시');
  assert.deepEqual(
    recovered.items.map((i) => [i.name, i.menus]),
    [
      ['갈비집 본점', ['왕갈비 정식']],
      ['국수집', []],
    ],
  );
  assert.equal(calls.length, 6);

  // 성공 후에는 10분 캐시한다.
  await fetch('수원시');
  assert.equal(calls.length, 6);
});

test('parseRestaurantMenus와 parseAI는 설명 문구·코드 펜스·변형 JSON을 처리하고 잘못된 출력은 거절한다', () => {
  assert.deepEqual(
    parseRestaurantMenus(
      '다음은 추출한 메뉴입니다.\n```json\n{"갈비집 본점": ["왕갈비 정식", "물냉면"]}\n```\n참고해 주세요.',
    ),
    { '갈비집 본점': ['왕갈비 정식', '물냉면'] },
  );
  assert.deepEqual(
    parseRestaurantMenus(
      '{"갈비집 본점": ["왕갈비 정식"]}\n{"국수집": ["잔치국수"]}',
    ),
    { '갈비집 본점': ['왕갈비 정식'], 국수집: ['잔치국수'] },
  );
  assert.deepEqual(
    parseRestaurantMenus(
      '{"items":[{"name":"갈비집 본점","menus":["왕갈비 정식","물냉면","비빔냉면","갈비탕","육회","된장찌개"]},{"name":"국수집","menus":null}]}',
    ),
    {
      '갈비집 본점': [
        '왕갈비 정식',
        '물냉면',
        '비빔냉면',
        '갈비탕',
        '육회',
        '된장찌개',
      ],
      국수집: [],
    },
  );
  assert.deepEqual(
    parseRestaurantMenus('{"갈비집 본점": "왕갈비 정식", "국수집": "없음"}'),
    { '갈비집 본점': ['왕갈비 정식'], 국수집: [] },
  );
  assert.throws(
    () => parseRestaurantMenus('메뉴를 찾지 못했습니다.'),
    /AI 응답 형식이 올바르지 않습니다/,
  );

  // 40자를 넘는 메뉴 문자열은 도메인 검증에서 걸러진다.
  const longMenu = '아주긴세트메뉴이름'.repeat(6);
  assert.deepEqual(
    verifiedMenus([longMenu, '물냉면'], [`${longMenu} 물냉면`]),
    ['물냉면'],
  );

  // parseAI는 앞뒤 문구와 따옴표가 섞여 있어도 유효한 JSON 객체를 파싱한다.
  const schema = z.object({ ok: z.boolean() });
  assert.deepEqual(parseAI(schema, '12" 안내:\n```JSON\n{"ok": true}\n```'), {
    ok: true,
  });
  assert.throws(
    () => parseAI(schema, '{"ok": "no"}'),
    /AI 응답 형식이 올바르지 않습니다/,
  );
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
  assert.ok(
    script.indexOf('추천 명소') <
      script.indexOf('근처 맛집이에요. 갈비집 본점'),
  );
  assert.match(script, /갈비집 본점은 육류 맛집인데 왕갈비 정식이 유명해요\./);
  // 음성은 화면 카드와 같은 순서로 명소를 말한다(번호 없이).
  const positions = facts.places.map((p) =>
    script.indexOf(`${spokenKorean(p.name)}, `),
  );
  assert.ok(positions.every((n) => n > 0));
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
  );
  assert.doesNotMatch(script, /첫 번째|두 번째/);
});

test('명소 블로그 후기는 그 장소 글만 3개까지 모으고 10분 캐시하며 키가 없으면 빈 목록이다', async () => {
  const calls: string[] = [];
  let now = 0;
  const port: RestaurantSearchPort = {
    now: () => now,
    configured: () => true,
    local: async () => [],
    blog: async (query) => {
      calls.push(query);
      return [
        '화성행궁 다녀왔어요 - 야경이 예뻐요',
        '다른 궁 이야기 - 경복궁',
        '화성행궁 후기 - 해설이 좋아요',
        '화성행궁 산책 - 넓어요',
        '화성행궁 또 - 네 번째',
      ];
    },
  };
  const reviews = createPlaceReviews(port);
  assert.deepEqual(await reviews('화성행궁', '수원시'), [
    '화성행궁 다녀왔어요 - 야경이 예뻐요',
    '화성행궁 후기 - 해설이 좋아요',
    '화성행궁 산책 - 넓어요',
  ]);
  await reviews('화성행궁', '수원시');
  assert.deepEqual(calls, ['화성행궁 경기도 수원시']);
  now += 11 * 60 * 1000;
  await reviews('화성행궁', '수원시');
  assert.equal(calls.length, 2);
  const off = createPlaceReviews({ ...port, configured: () => false });
  assert.deepEqual(await off('화성행궁', '수원시'), []);
  const broken = createPlaceReviews({
    ...port,
    blog: async () => {
      throw new Error('down');
    },
  });
  assert.deepEqual(await broken('화성행궁', '수원시'), []);
});

test('맛집은 음식 종류와 검증된 메뉴를 넣어 맛집마다 다른 표현·맞는 조사로 말한다', () => {
  assert.equal(foodKind('음식점>일식>일식당'), '일식당');
  assert.equal(foodKind('한식>곱창,막창,양'), '곱창 맛집');
  assert.equal(foodKind('카페,디저트>베이커리'), '베이커리');
  assert.equal(foodKind(''), '');
  assert.equal(
    menuSentence(
      '요미우돈교자',
      ['오코노미야끼교자', '우동'],
      0,
      '음식점>일식>일식당',
    ),
    '요미우돈교자는 일식당인데 오코노미야끼교자와 우동이 유명해요.',
  );
  assert.equal(
    menuSentence(
      '하얀풍차제과점 망포역점',
      ['화이트롤', '찹쌀도넛', '조각 케이크'],
      1,
      '카페,디저트>베이커리',
    ),
    '베이커리인 하얀풍차제과점 망포역점에서는 화이트롤, 찹쌀도넛과 조각 케이크가 인기 메뉴예요.',
  );
  assert.equal(
    menuSentence(
      '조개포차 오이도본점',
      ['가리비', '키조개'],
      2,
      '해물,생선요리>조개요리',
    ),
    '조개포차 오이도본점은 조개요리 맛집으로, 가리비와 키조개를 많이 찾아요.',
  );
  assert.equal(
    menuSentence('델씨엘로', ['피자'], 3),
    '델씨엘로는 피자가 유명해요.',
  );
  assert.equal(
    kindSentence('셰프스위트', '음식점>양식'),
    '셰프스위트는 양식 맛집이에요.',
  );
});

test('맛집 한 문장은 블로그 근거 AI 문장을 검사해 쓰고, 가격·다른 이름이 섞이면 음식 종류·메뉴 규칙 문장을 쓴다', () => {
  const weather = buildDemoWeather(
    '수원시',
    Date.parse('2026-11-21T03:00:00Z'),
  );
  const facts = briefingFacts(weather, places, [
    {
      name: '요미우돈교자',
      category: '음식점>일식>일식당',
      address: '경기도 수원시 팔달구 1',
      link: null,
      menus: ['오코노미야끼교자', '우동'],
    },
    {
      name: '셰프스위트',
      category: '음식점>양식',
      address: '경기도 수원시 팔달구 2',
      link: null,
      menus: ['뇨끼'],
    },
  ]);
  const n = facts.places.length;
  const lines = Array(n).fill(undefined);
  lines.push(
    '행궁동에서 일본 감성으로 유명한 일식당이라 우동과 교자를 즐기기 좋아요',
    '파스타 한 접시에 15000원이라 가성비가 좋아요.',
  );
  const result = withReasons(facts, lines);
  assert.equal(
    result.restaurants[0].line,
    '행궁동에서 일본 감성으로 유명한 일식당이라 우동과 교자를 즐기기 좋아요.',
  );
  assert.equal(
    result.restaurants[1].line,
    undefined,
    '숫자(가격)가 있으면 버린다',
  );
  const tail = placesTail(result);
  assert.match(tail, /요미우돈교자, 행궁동에서 일본 감성으로/);
  assert.match(
    tail,
    /셰프스위트에서는 양식 맛집|셰프스위트는 양식 맛집|양식 맛집인 셰프스위트/,
  );
  assert.doesNotMatch(tail, /15000/);
});

test('후기로 확인된 메뉴가 있는 맛집은 문장에 그 메뉴가 없으면 메뉴를 말하는 규칙 문장을 쓴다', () => {
  const weather = buildDemoWeather(
    '시흥시',
    Date.parse('2026-11-21T03:00:00Z'),
  );
  const facts = briefingFacts(weather, places, [
    {
      name: '조개포차 오이도본점',
      category: '한식>조개요리',
      address: '경기도 시흥시 오이도로 1',
      link: null,
      menus: ['가리비', '키조개'],
    },
    {
      name: '어부파스타',
      category: '음식점>이탈리아음식',
      address: '경기도 시흥시 은계번영길 2',
      link: null,
      menus: [],
    },
  ]);
  const lines = [
    ...Array(facts.places.length).fill(undefined),
    '푸짐하게 나오는 조개를 즐기며 오션뷰를 바라보기 좋아요.',
    '분위기도 좋고 깔끔해서 기분 전환하기 좋아요.',
  ];
  const [clam, pasta] = withReasons(facts, lines).restaurants;
  assert.equal(
    clam.line,
    undefined,
    '메뉴(가리비·키조개)를 말하지 않으면 버린다',
  );
  assert.equal(
    pasta.line,
    '분위기도 좋고 깔끔해서 기분 전환하기 좋아요.',
    '메뉴가 없는 맛집은 그대로 쓴다',
  );
  assert.match(
    placesTail(withReasons(facts, lines)),
    /조개포차 오이도본점은 조개요리 맛집인데 가리비와 키조개가 유명해요\./,
  );
  const withMenu = withReasons(facts, [
    ...Array(facts.places.length).fill(undefined),
    '푸짐한 가리비와 키조개를 바다를 보며 즐기기 좋아요.',
  ]).restaurants[0];
  assert.equal(
    withMenu.line,
    '푸짐한 가리비와 키조개를 바다를 보며 즐기기 좋아요.',
  );
});
