import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import labelData from '../data/place-labels.json';
import { places } from '../lib/domain/catalog';
import {
  matchesPlaceQuery,
  placeLabelSchema,
  scorePlaceMatch,
} from '../lib/domain/place-labels';
import { createRecommendation } from '../lib/application/recommendation';
import { rerank } from '../lib/adapters/naver';
import { parseBatchLabels } from '../scripts/label-places';
import { AiTravelSearch } from '../components/ai-travel-search';
import type { AIPort } from '../lib/application/ports';

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
  assert.match(previewMarkup, /CLOVA 라벨링 \+ Reranker/);
  assert.match(previewMarkup, />호수</);
  assert.match(previewMarkup, />실내</);
  assert.match(previewMarkup, /연관 관광지 6곳/);
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
  assert.match(resultMarkup, /함께 둘러볼 연관 관광지/);
  assert.match(resultMarkup, /이 코스로 담기/);
});
