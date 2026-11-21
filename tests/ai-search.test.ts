import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import labelData from '../data/place-labels.json';
import { places } from '../lib/domain/catalog';
import {
  expandQueryTerms,
  matchesPlaceQuery,
  placeLabelSchema,
  scorePlaceMatch,
  searchPlaces,
} from '../lib/domain/place-labels';
import { createRecommendation } from '../lib/application/recommendation';
import { naver, rerank } from '../lib/adapters/naver';
import { parseBatchLabels } from '../scripts/label-places';
import { AiTravelSearch } from '../components/ai-travel-search';
import type { AIPort } from '../lib/application/ports';

test('자연어 지역·동행·활동은 모두 충족해야 하며 산책을 등산으로 확장하지 않는다', () => {
  const query = '안양시에서 할머니와 산책';
  const matches = places.filter((place) => matchesPlaceQuery(place, query));
  assert.ok(matches.length > 0);
  assert.ok(matches.every((place) => place.cityId === '41170'));
  assert.ok(
    matches.every((place) => place.labels.companions.includes('부모님')),
  );
  assert.ok(matches.every((place) => place.labels.styles.includes('산책')));
  assert.ok(!expandQueryTerms('산책').includes('산·계곡'));
  assert.ok(!expandQueryTerms('안산시').includes('산·계곡'));

  const base = {
    ...places[0],
    cityId: '41170',
    region: '안양시',
    name: '조건 검사용 장소',
    description: '안양시 근처에서 산책할 수 있는 장소',
    tags: [],
    labels: {
      ...places[0].labels,
      setting: '야외' as const,
      themes: ['공원·숲'] as const,
      companions: ['부모님'] as const,
      styles: ['산책'] as const,
      keywords: [],
    },
  };
  const fixture = { ...base, labels: placeLabelSchema.parse(base.labels) };
  assert.equal(matchesPlaceQuery(fixture, query), true);
  assert.equal(matchesPlaceQuery(fixture, '안양에서 할머니랑 걷기'), true);
  assert.equal(
    matchesPlaceQuery({ ...fixture, cityId: '41590', region: '화성시' }, query),
    false,
  );
  assert.equal(
    matchesPlaceQuery(
      { ...fixture, labels: { ...fixture.labels, companions: ['아이동반'] } },
      query,
    ),
    false,
  );
  assert.equal(
    matchesPlaceQuery(
      { ...fixture, labels: { ...fixture.labels, styles: ['액티비티'] } },
      query,
    ),
    false,
  );
  assert.equal(matchesPlaceQuery(fixture, '안양시에서 실내 산책'), false);
  assert.equal(matchesPlaceQuery(fixture, '없는관광지이름'), false);
  assert.equal(matchesPlaceQuery(fixture, '헿'), false);
  assert.equal(matchesPlaceQuery(fixture, '안'), true);
});

test('609개 전체 관광지에 유효한 사전 라벨이 매핑되고 호수·실내 검색이 동작한다', () => {
  const labels = labelData as Record<string, unknown>;
  assert.equal(Object.keys(labels).length, places.length);
  for (const place of places) {
    assert.equal(
      placeLabelSchema.safeParse(labels[place.id]).success,
      true,
      `${place.id} 라벨 스키마 오류`,
    );
  }

  const lakeMatches = places
    .filter((p) => matchesPlaceQuery(p, '호수'))
    .sort((a, b) => scorePlaceMatch(b, '호수') - scorePlaceMatch(a, '호수'));
  assert.ok(lakeMatches.length >= 20);
  assert.ok(
    lakeMatches.slice(0, 10).every((p) => p.labels.themes.includes('호수')),
  );

  const indoorMatches = places
    .filter((p) => matchesPlaceQuery(p, '실내'))
    .sort((a, b) => scorePlaceMatch(b, '실내') - scorePlaceMatch(a, '실내'));
  assert.ok(indoorMatches.length >= 20);
  assert.ok(
    indoorMatches
      .slice(0, 10)
      .every(
        (p) => p.labels.setting === '실내' || p.labels.setting === '실내·야외',
      ),
  );

  const rainyMatches = places
    .filter((p) => matchesPlaceQuery(p, '비 오는 날 아이랑'))
    .sort(
      (a, b) =>
        scorePlaceMatch(b, '비 오는 날 아이랑') -
        scorePlaceMatch(a, '비 오는 날 아이랑'),
    );
  assert.ok(rainyMatches.length >= 10);
  assert.ok(
    rainyMatches.slice(0, 5).some((p) => p.labels.styles.includes('비오는날')),
  );
});

test('AI 후보도 같은 검색 조건을 지키고 불일치·빈 결과는 외부 호출 전에 거절한다', async () => {
  const query = '안양시에서 할머니와 산책';
  const expected = searchPlaces(places, query);
  let calls = 0;
  const recommend = createRecommendation({
    capabilities: () => ({
      clova: true,
      voice: false,
      translate: false,
      ocr: false,
    }),
    async rerank(_prompt, docs) {
      calls++;
      assert.ok(
        docs.every((doc) => expected.some((place) => place.id === doc.id)),
      );
      return { citedIds: [docs[0].id], summary: '조건 일치' };
    },
    async recommend(_prompt, candidates) {
      calls++;
      assert.ok(
        candidates.every((place) =>
          expected.some((item) => item.id === place.id),
        ),
      );
      return {
        title: '안양 산책',
        summary: '부모님과 산책',
        stops: candidates
          .slice(0, 3)
          .map((place) => ({ placeId: place.id, reason: '조건 일치' })),
      };
    },
  });
  const outside = places.find((place) => place.cityId !== '41170')!;
  const result = await recommend(query, '전체', [
    { placeId: outside.id, rating: 5 },
  ]);
  assert.equal(result.stops.length, Math.min(3, expected.length));
  assert.ok(
    result.stops.every((stop) =>
      expected.some((place) => place.id === stop.placeId),
    ),
  );
  const completedCalls = calls;
  await assert.rejects(recommend(query, '수원시', []), /조건에 맞는 장소가 없/);
  await assert.rejects(
    recommend('없는관광지이름', '전체', []),
    /조건에 맞는 장소가 없/,
  );
  assert.equal(calls, completedCalls);
});

test('CLOVA 배치 라벨 파서는 코드블록 JSON과 허용 ID만 검증해 추출한다', () => {
  const raw = `\`\`\`json
{
  "items": [
    {
      "id": "${places[0].id}",
      "setting": "야외",
      "themes": ["바다", "공원·숲"],
      "companions": ["아이동반", "가족"],
      "styles": ["산책", "사진명소"],
      "keywords": ["갯골", "염전"]
    },
    {
      "id": "UNKNOWN_ID",
      "setting": "실내",
      "themes": ["박물관·전시"],
      "companions": ["가족"],
      "styles": ["비오는날"],
      "keywords": ["전시"]
    }
  ]
}
\`\`\``;
  const parsed = parseBatchLabels(raw, new Set([places[0].id]));
  assert.deepEqual(Object.keys(parsed), [places[0].id]);
  assert.equal(parsed[places[0].id].source, 'clova');
  assert.equal(parsed[places[0].id].setting, '야외');

  // CLOVA가 슬래시·동의어·기존 태그를 출력해도 허용 enum으로 정규화한다
  const normalized = parseBatchLabels(
    JSON.stringify({
      items: [
        {
          id: places[0].id,
          setting: '실내/야외',
          themes: ['자연·생태', '경관 감상'],
          companions: ['아이', '커플'],
          styles: ['비 오는 날', '교육/학습'],
          keywords: ['갯골'],
        },
      ],
    }),
    new Set([places[0].id]),
  );
  assert.equal(normalized[places[0].id].setting, '실내·야외');
  assert.deepEqual(normalized[places[0].id].themes, ['공원·숲', '전망·야경']);
  assert.deepEqual(normalized[places[0].id].companions, [
    '아이동반',
    '연인·데이트',
  ]);
  assert.deepEqual(normalized[places[0].id].styles, ['비오는날', '교육·학습']);

  // 모델이 여러 JSON 객체를 줄바꿈으로 이어서 출력하거나 서술형 스타일을 반환해도 파싱한다
  const multiJson = `${JSON.stringify({
    id: places[0].id,
    setting: '야외',
    themes: ['호수'],
    companions: ['친구', '가족'],
    styles: ['일몰 감상', '호수 산책'],
    keywords: ['물왕호수'],
  })}\n${JSON.stringify({
    id: places[1].id,
    setting: '야외',
    themes: ['바다'],
    companions: ['연인'],
    styles: ['노을 감상'],
    keywords: ['등대'],
  })}`;
  const multiParsed = parseBatchLabels(
    multiJson,
    new Set([places[0].id, places[1].id]),
  );
  assert.equal(Object.keys(multiParsed).length, 2);
  assert.deepEqual(multiParsed[places[0].id].styles, ['사진명소', '산책']);
  assert.deepEqual(multiParsed[places[1].id].styles, ['사진명소']);

  assert.throws(() =>
    parseBatchLabels(
      JSON.stringify({
        items: [
          {
            id: places[0].id,
            setting: '우주',
            themes: ['바다'],
            companions: ['가족'],
            styles: ['산책'],
            keywords: [],
          },
        ],
      }),
      new Set([places[0].id]),
    ),
  );
});

test('CLOVA Reranker 어댑터는 인용 문서 ID를 검증하고 추천 유스케이스는 실패 시 폴백한다', async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.CLOVA_STUDIO_API_KEY;
  process.env.CLOVA_STUDIO_API_KEY = 'rerank-key';
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(
        String(url),
        'https://clovastudio.stream.ntruss.com/v1/api-tools/reranker',
      );
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        'Bearer rerank-key',
      );
      const body = JSON.parse(init?.body as string);
      assert.equal(body.query, '호수');
      assert.equal(body.documents.length, 2);
      return Response.json({
        status: { code: '20000' },
        result: {
          result: '물왕호수가 호수 산책에 적합합니다.',
          citedDocuments: [
            { id: 'PLACE_B', doc: '호수' },
            { id: 'HALLUCINATED', doc: '허구' },
          ],
        },
      });
    };
    const reranked = await rerank('호수', [
      { id: 'PLACE_A', doc: '박물관' },
      { id: 'PLACE_B', doc: '물왕호수' },
    ]);
    assert.deepEqual(reranked.citedIds, ['PLACE_B']);
    assert.match(reranked.summary, /물왕호수/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.CLOVA_STUDIO_API_KEY;
    else process.env.CLOVA_STUDIO_API_KEY = oldKey;
  }

  let receivedFirstId = '';
  const withReranker = createRecommendation({
    capabilities: () => ({
      clova: true,
      voice: false,
      translate: false,
      ocr: false,
    }),
    async rerank(_query, docs) {
      const target = docs[docs.length - 1];
      return { citedIds: [target.id], summary: '선택됨' };
    },
    async recommend(_prompt, candidates) {
      receivedFirstId = candidates[0].id;
      return {
        title: '호수 하루',
        summary: '호수 추천',
        stops: [{ placeId: candidates[0].id, reason: '호수 산책' }],
      };
    },
  } satisfies Pick<AIPort, 'capabilities' | 'recommend' | 'rerank'>);

  const ok = await withReranker('호수', '전체', []);
  assert.equal(ok.reranked, true);
  assert.equal(ok.stops[0].placeId, receivedFirstId);
  assert.ok(ok.relatedPlaceIds?.includes(receivedFirstId));

  const fallbackOnRerankError = createRecommendation({
    capabilities: () => ({
      clova: true,
      voice: false,
      translate: false,
      ocr: false,
    }),
    async rerank() {
      throw new Error('reranker down');
    },
    async recommend(_prompt, candidates) {
      return {
        title: '실내 하루',
        summary: '실내 추천',
        stops: [{ placeId: candidates[0].id, reason: '실내 전시' }],
      };
    },
  } satisfies Pick<AIPort, 'capabilities' | 'recommend' | 'rerank'>);

  const fallback = await fallbackOnRerankError('실내', '전체', []);
  assert.equal(fallback.mode, 'clova');
  assert.equal(fallback.reranked, false);
  assert.ok(fallback.stops.length === 1);
});

test('추천은 일반 설명문 대신 지정한 도구의 인수를 읽고 잘못된 도구·장소를 거절한다', async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.CLOVA_STUDIO_API_KEY;
  process.env.CLOVA_STUDIO_API_KEY = 'recommendation-key';
  const expected = {
    title: '호수 하루',
    summary: '호수 주변을 둘러보는 코스입니다.',
    stops: [{ placeId: places[0].id, reason: '산책' }],
  };
  const toolCall = (args: unknown, name = 'recommend_itinerary') => ({
    type: 'function',
    function: { name, arguments: args },
  });
  let calls: unknown = [toolCall(expected)];
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      assert.deepEqual(body.toolChoice, {
        type: 'function',
        function: { name: 'recommend_itinerary' },
      });
      assert.equal(body.tools.length, 1);
      const parameters = body.tools[0].function.parameters;
      assert.deepEqual(parameters.required, ['title', 'summary', 'stops']);
      assert.equal(parameters.properties.stops.minItems, 1);
      assert.equal(parameters.properties.stops.maxItems, 3);
      return Response.json({
        status: { code: '20000' },
        result: {
          finishReason: 'tool_calls',
          message: {
            content: '호수에서의 하루: 자연과 함께하는 휴식을 추천합니다.',
            toolCalls: calls,
          },
        },
      });
    };
    assert.deepEqual(
      await naver.recommend('호수', places.slice(0, 2), []),
      expected,
    );
    calls = [toolCall(JSON.stringify(expected))];
    assert.deepEqual(
      await naver.recommend('호수', places.slice(0, 2), []),
      expected,
    );
    for (const invalid of [
      undefined,
      [],
      [toolCall(expected, 'other_tool')],
      [toolCall(expected), toolCall(expected)],
      [toolCall('not json')],
      [toolCall({ ...expected, stops: [] })],
      [
        toolCall({
          ...expected,
          stops: places
            .slice(0, 4)
            .map((place) => ({ placeId: place.id, reason: '관광' })),
        }),
      ],
      [
        toolCall({
          ...expected,
          stops: [...expected.stops, ...expected.stops],
        }),
      ],
      [
        toolCall({
          ...expected,
          stops: [{ placeId: 'UNKNOWN_ID', reason: '등록되지 않은 장소' }],
        }),
      ],
    ]) {
      calls = invalid;
      await assert.rejects(
        naver.recommend('호수', places.slice(0, 2), []),
        /유효한 여행 제안/,
      );
    }
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.CLOVA_STUDIO_API_KEY;
    else process.env.CLOVA_STUDIO_API_KEY = oldKey;
  }
});

test('최상단 AI 통합 검색창은 테마 칩·즉시 검색 미리보기·Reranker 추천 결과를 렌더링한다', () => {
  const lakePlaces = places
    .filter((p) => matchesPlaceQuery(p, '호수'))
    .slice(0, 6);

  const previewMarkup = renderToStaticMarkup(
    createElement(AiTravelSearch, {
      aiEnabled: true,
      regions: ['전체', '수원시'],
      region: '전체',
      query: '호수',
      filtered: lakePlaces,
      selection: [lakePlaces[0].id],
      busy: false,
      ready: true,
      result: null,
      places,
      resultRef: { current: null },
      onQuery() {},
      onRegion() {},
      onSearch() {},
      onReset() {},
      onApply() {},
      onClearResult() {},
      onToggle() {},
      onDetail() {},
      onScrollCatalog() {},
    }),
  );
  assert.match(previewMarkup, /AI 여행 검색·추천/);
  assert.match(previewMarkup, />호수</);
  assert.match(previewMarkup, />실내</);
  assert.match(previewMarkup, /조건에 맞는 관광지 6곳/);
  assert.equal((previewMarkup.match(/class="ai-place-item"/g) ?? []).length, 3);
  assert.match(previewMarkup, /담기 취소/);

  const resultMarkup = renderToStaticMarkup(
    createElement(AiTravelSearch, {
      aiEnabled: true,
      regions: ['전체', '수원시'],
      region: '전체',
      query: '호수',
      filtered: lakePlaces,
      selection: [],
      busy: false,
      ready: true,
      result: {
        mode: 'clova',
        reranked: true,
        title: '경기도 호수 산책 코스',
        summary: '호수 전망이 좋은 곳들을 골랐어요.',
        stops: [{ placeId: lakePlaces[0].id, reason: '호수 둘레길 산책' }],
        relatedPlaceIds: lakePlaces.slice(0, 4).map((p) => p.id),
      },
      places,
      resultRef: { current: null },
      onQuery() {},
      onRegion() {},
      onSearch() {},
      onReset() {},
      onApply() {},
      onClearResult() {},
      onToggle() {},
      onDetail() {},
      onScrollCatalog() {},
    }),
  );
  assert.match(resultMarkup, /CLOVA Reranker \+ AI 추천/);
  assert.match(resultMarkup, /경기도 호수 산책 코스/);
  assert.match(resultMarkup, /추천 1곳/);
  assert.equal((resultMarkup.match(/class="ai-place-item"/g) ?? []).length, 1);
  assert.doesNotMatch(resultMarkup, /함께 둘러볼 연관 관광지/);
  assert.match(resultMarkup, /이 코스로 담기/);
});
