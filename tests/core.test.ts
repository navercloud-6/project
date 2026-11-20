import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { journeyInput, recommendationOutput } from '../lib/domain/contracts';
import { openApiDocument } from '../lib/adapters/openapi';
import { GET as getScalarDocs } from '../app/api/docs/route';
import { GET as getWeatherRoute } from '../app/api/weather/route';
import { fetchSiheungWeather } from '../lib/server';
import { places, placeIds } from '../lib/domain/catalog';
import { journeys, saveJourney, saveRecord } from '../lib/server';
import { recommend } from '../lib/server';
import { consumeLimit } from '../lib/adapters/sqlite';
import { ApplicationError } from '../lib/domain/errors';
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), 'tourpass-test-')),
  'test.sqlite',
);
const valid = {
  name: '시흥 여행',
  date: '2026-11-14',
  placeIds: [places[0].id],
};
test('여행 입력은 중복·허구 장소·잘못된 날짜를 거절한다', () => {
  assert.equal(journeyInput.safeParse(valid).success, true);
  for (const bad of [
    { ...valid, placeIds: ['made-up'] },
    { ...valid, placeIds: [places[0].id, places[0].id] },
    { ...valid, date: '2026-02-30' },
    { ...valid, name: ' ' },
  ])
    assert.equal(journeyInput.safeParse(bad).success, false);
});
test('여행과 방문 기록은 소유자에게만 노출·수정된다', () => {
  const journey = saveJourney('owner-a', valid);
  assert.equal(journeys('owner-b').length, 0);
  assert.throws(() =>
    saveRecord('owner-b', {
      journeyId: journey.id,
      placeId: places[0].id,
      rating: 5,
      note: '침입',
    }),
  );
  assert.throws(() =>
    saveRecord('owner-a', {
      journeyId: journey.id,
      placeId: places[1].id,
      rating: 5,
      note: '잘못된 장소',
    }),
  );
  saveRecord('owner-a', {
    journeyId: journey.id,
    placeId: places[0].id,
    rating: 4,
    note: '바람이 좋았다',
  });
  assert.equal(
    journeys('owner-a')[0].records[places[0].id].note,
    '바람이 좋았다',
  );
});
test('요청 한도를 넘으면 거절한다', () => {
  assert.equal(consumeLimit('test', 1), true);
  assert.equal(consumeLimit('test', 1), false);
});
test('AI 출력은 후보 외 ID와 중복 ID를 거절한다', () => {
  const base = {
    title: '여행',
    summary: '제안',
    stops: [{ placeId: places[0].id, reason: '자연' }],
  };
  assert.equal(recommendationOutput.safeParse(base).success, true);
  assert.equal(
    recommendationOutput.safeParse({
      ...base,
      stops: [...base.stops, ...base.stops],
    }).success,
    false,
  );
  assert.equal(
    recommendationOutput.safeParse({
      ...base,
      stops: [{ placeId: 'fake', reason: '가짜' }],
    }).success,
    false,
  );
});
test('키 없는 데모는 지역을 제한하고 만족도를 반영한다', async () => {
  const key = process.env.CLOVA_STUDIO_API_KEY;
  delete process.env.CLOVA_STUDIO_API_KEY;
  try {
    const r = await recommend('조용한 여행', places[5].region, [
      { placeId: places[5].id, rating: 5 },
    ]);
    assert.equal(r.mode, 'demo');
    assert.equal(r.stops[0].placeId, places[5].id);
    const scoped = await recommend('여행', places[0].region, []);
    assert.ok(
      scoped.stops.every(
        (s) =>
          places.find((p) => p.id === s.placeId)?.region === places[0].region,
      ),
    );
  } finally {
    if (key) process.env.CLOVA_STUDIO_API_KEY = key;
  }
});
test('CLOVA 요청 계약과 응답 오류를 모의 응답으로 검증한다', async () => {
  const oldFetch = globalThis.fetch,
    oldKey = process.env.CLOVA_STUDIO_API_KEY;
  process.env.CLOVA_STUDIO_API_KEY = 'test-key';
  const output = {
    title: '추천 여행',
    summary: '자연 탐색',
    stops: [{ placeId: places[0].id, reason: '갯골' }],
  };
  try {
    globalThis.fetch = async (url, options) => {
      assert.match(String(url), /\/v3\/chat-completions\/HCX-/);
      assert.equal(
        (options?.headers as Record<string, string>).Authorization,
        'Bearer test-key',
      );
      assert.equal(options?.redirect, 'error');
      assert.equal(options?.cache, 'no-store');
      const body = JSON.parse(options?.body as string);
      assert.equal(body.maxTokens, 1200);
      assert.equal(body.temperature, 0.3);
      assert.equal(body.topP, 0.8);
      assert.equal(body.topK, 0);
      assert.equal(body.repetitionPenalty, 1.1);
      assert.equal(body.includeAiFilters, true);
      assert.equal(body.messages[1].content, '자연 여행');
      return Response.json({
        status: { code: '20000' },
        result: {
          finishReason: 'stop',
          message: { content: JSON.stringify(output) },
        },
      });
    };
    assert.equal((await recommend('자연 여행', '전체', [])).mode, 'clova');
    globalThis.fetch = async () =>
      Response.json({
        status: { code: '20000' },
        result: { message: { content: 'not json' } },
      });
    await assert.rejects(recommend('여행', '전체', []), /유효한/);
    for (const response of [
      {
        status: { code: '20000' },
        result: {
          finishReason: 'length',
          message: { content: JSON.stringify(output) },
        },
      },
      {
        status: { code: '20000' },
        result: {
          aiFilter: [{ score: '0' }],
          message: { content: JSON.stringify(output) },
        },
      },
      {
        status: { code: '20000' },
        result: { aiFilter: {}, message: { content: JSON.stringify(output) } },
      },
      null,
    ]) {
      globalThis.fetch = async () => Response.json(response);
      await assert.rejects(
        recommend('여행', '전체', []),
        (error: unknown) =>
          error instanceof ApplicationError &&
          error.code === 'UPSTREAM_INVALID',
      );
    }
    globalThis.fetch = async () => new Response('invalid json');
    await assert.rejects(
      recommend('여행', '전체', []),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'UPSTREAM_INVALID',
    );
    globalThis.fetch = async () =>
      Response.json({
        status: { code: '20000' },
        result: { message: { content: JSON.stringify(output) } },
      });
    await assert.rejects(recommend('여행', places[1].region, []), /유효한/);
    globalThis.fetch = async () => {
      throw new Error('connection failed');
    };
    await assert.rejects(
      recommend('여행', '전체', []),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'UPSTREAM_TIMEOUT',
    );
    globalThis.fetch = async () => new Response('', { status: 401 });
    await assert.rejects(recommend('여행', '전체', []), /실패/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey) process.env.CLOVA_STUDIO_API_KEY = oldKey;
    else delete process.env.CLOVA_STUDIO_API_KEY;
  }
});
test('OpenAPI 3.1 명세와 Scalar 핸들러가 핵심 경로와 스키마를 노출한다', async () => {
  assert.equal(openApiDocument.openapi, '3.1.0');
  for (const path of [
    '/api/session',
    '/api/journeys',
    '/api/recommend',
    '/api/assistant',
    '/api/photos',
    '/api/poster',
    '/api/weather',
    '/api/openapi',
    '/api/docs',
  ])
    assert.ok(path in openApiDocument.paths, `${path} 경로 누락`);
  for (const schema of [
    'JourneyInput',
    'RecordInput',
    'RecommendationInput',
    'RecommendationOutput',
    'EditOutput',
    'PosterOutput',
    'WeatherResponse',
  ])
    assert.ok(
      schema in openApiDocument.components.schemas,
      `${schema} 스키마 누락`,
    );
  const res = await getScalarDocs();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/html/i);
  const html = await res.text();
  assert.match(html, /\/api\/openapi/);
  assert.match(html, /createApiReference/);
});
test('경기 날씨 API는 실시간 Open-Meteo 파싱, 오프라인 데모 폴백, 권역 검증을 수행한다', async () => {
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.match(String(url), /api\.open-meteo\.com\/v1\/forecast/);
      return Response.json({
        current: {
          time: '2026-11-14T14:00',
          temperature_2m: 15.4,
          apparent_temperature: 14.8,
          relative_humidity_2m: 58,
          precipitation: 0,
          weather_code: 0,
          wind_speed_10m: 2.8,
        },
        daily: {
          time: [
            '2026-11-14',
            '2026-11-15',
            '2026-11-16',
            '2026-11-17',
            '2026-11-18',
          ],
          weather_code: [0, 1, 2, 61, 0],
          temperature_2m_max: [17, 16, 15, 13, 15],
          temperature_2m_min: [8, 7, 6, 5, 6],
          precipitation_probability_max: [10, 20, 30, 80, 10],
        },
      });
    };
    const live = await fetchSiheungWeather('오이도');
    assert.equal(live.mode, 'live');
    assert.equal(live.region, '오이도');
    assert.equal(live.current.condition, '맑음');
    assert.equal(live.daily.length, 5);
    assert.ok(live.recommendedPlaceIds.every((id) => placeIds.has(id)));

    globalThis.fetch = async () => {
      throw new Error('network down');
    };
    const fallback = await fetchSiheungWeather('배곧');
    assert.equal(fallback.mode, 'demo');
    assert.equal(fallback.region, '배곧');
    assert.ok(fallback.recommendedPlaceIds.length >= 1);

    const badRes = await getWeatherRoute(
      new Request('http://127.0.0.1:3100/api/weather?region=없는지역'),
    );
    assert.equal(badRes.status, 400);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
test('경기도 관광지와 기존 시흥 20곳이 유효한 지도 좌표를 가진다', () => {
  assert.equal(places.filter((p) => p.cityId === '41390').length, 20);
  for (const p of places) {
    assert.ok(
      p.coordinates.lat >= 36.8 && p.coordinates.lat <= 38.35,
      `${p.id} 위도 범위 오류`,
    );
    assert.ok(
      p.coordinates.lng >= 126.3 && p.coordinates.lng <= 127.9,
      `${p.id} 경도 범위 오류`,
    );
    assert.ok(
      p.coordinates.x >= 0 && p.coordinates.x <= 800,
      `${p.id} SVG x 범위 오류`,
    );
    assert.ok(
      p.coordinates.y >= 0 && p.coordinates.y <= 520,
      `${p.id} SVG y 범위 오류`,
    );
  }
});
