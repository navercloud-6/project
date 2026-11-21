import test from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from '../lib/application/cache';
import { createOperations } from '../lib/application/operations';
import { createRecommendation } from '../lib/application/recommendation';
import { createWeather } from '../lib/application/weather';
import { createAlerts } from '../lib/application/alerts';
import { createPlaceReviews } from '../lib/application/restaurants';
import { buildDemoWeather, type WeatherResponse } from '../lib/domain/weather';
import type { Journey } from '../lib/domain/contracts';
import type {
  AIPort,
  AlertPort,
  LimitPort,
  RestaurantSearchPort,
} from '../lib/application/ports';
import type { JourneyService } from '../lib/application/journeys';

test('공용 캐시는 TTL 만료·LRU 용량 제한·동시 요청 병합을 적용하고 실패·제외 값은 저장하지 않는다', async () => {
  let clock = 0;
  const cache = createCache<string>({
    now: () => clock,
    ttlMs: 1000,
    maxEntries: 2,
  });

  let loads = 0;
  const [a, b] = await Promise.all([
    cache.getOrLoad('k1', async () => {
      loads++;
      await new Promise((r) => setTimeout(r, 5));
      return 'v1';
    }),
    cache.getOrLoad('k1', async () => {
      loads++;
      return 'v1-dup';
    }),
  ]);
  assert.equal(a, 'v1');
  assert.equal(b, 'v1');
  assert.equal(loads, 1, '동시 요청은 한 번만 실행한다');

  // 실패한 요청은 캐시하지 않는다.
  await assert.rejects(
    cache.getOrLoad('fail', async () => {
      throw new Error('boom');
    }),
    /boom/,
  );
  assert.equal(cache.has('fail'), false);

  // shouldCache=false는 저장하지 않는다.
  const skipped = await cache.getOrLoad('skip', async () => 'fallback', {
    shouldCache: () => false,
  });
  assert.equal(skipped, 'fallback');
  assert.equal(cache.has('skip'), false);

  // LRU: k1을 조회해 최신화한 뒤 k2, k3을 넣으면 덜 쓴 k2가 밀려난다.
  cache.set('k2', 'v2');
  assert.equal(cache.get('k1'), 'v1');
  cache.set('k3', 'v3');
  assert.equal(cache.size(), 2);
  assert.equal(cache.get('k2'), undefined);
  assert.equal(cache.get('k1'), 'v1');
  assert.equal(cache.get('k3'), 'v3');

  // TTL 경과 시 만료된다.
  clock = 1000;
  assert.equal(cache.get('k1'), undefined);
  assert.equal(cache.has('k3'), false);
});

function fakeAi(overrides: Partial<AIPort> = {}): AIPort {
  const unexpected = async (): Promise<never> => {
    throw new Error('unexpected external call');
  };
  return {
    capabilities: () => ({
      clova: true,
      voice: true,
      translate: true,
      ocr: false,
    }),
    recommend: unexpected,
    guide: unexpected,
    proposeEdit: unexpected,
    diary: unexpected,
    poster: unexpected,
    translate: unexpected,
    voice: unexpected,
    briefing: unexpected,
    placeReasons: unexpected,
    restaurantMenus: unexpected,
    ocr: unexpected,
    ...overrides,
  };
}

test('정적 장소 번역·음성은 서버에서 24시간 캐시·동시 요청 병합하고 캐시 히트 시 한도를 차감하지 않는다', async () => {
  let clock = 0;
  const calls: string[] = [];
  const consumed: string[] = [];
  const journey: Journey = {
    id: '00000000-0000-4000-8000-000000000001',
    name: '내 비밀 여행',
    date: '2026-11-21',
    placeIds: ['PLACE_REAL_001'],
    records: {},
    createdAt: '2026-11-21T00:00:00.000Z',
    revision: 'rev-1',
  };
  const journeys = {
    journeys: async () => [],
    getJourney: async () => journey,
  } as unknown as JourneyService;
  const limits: LimitPort = {
    consume: async (key) => {
      consumed.push(key);
      return true;
    },
  };
  const ai = fakeAi({
    translate: async (text, target) => {
      calls.push(`translate:${target}:${text.slice(0, 8)}`);
      await new Promise((r) => setTimeout(r, 5));
      return `[${target}] translated`;
    },
    voice: async () => {
      calls.push('voice');
      await new Promise((r) => setTimeout(r, 5));
      return new Uint8Array([1, 2, 3]);
    },
  });
  const ops = createOperations(journeys, ai, limits, undefined, () => clock);

  // 장소 번역: 동시 요청 병합
  const [t1, t2] = await Promise.all([
    ops.assistant('user-a', {
      action: 'translate',
      placeId: 'PLACE_REAL_001',
      target: 'en',
    }),
    ops.assistant('user-b', {
      action: 'translate',
      placeId: 'PLACE_REAL_001',
      target: 'en',
    }),
  ]);
  assert.deepEqual(t1, t2);
  assert.equal(calls.filter((c) => c.startsWith('translate:en')).length, 1);

  // 캐시 히트 시 다른 사용자도 한도 미차감·외부 미호출
  const consumedBefore = consumed.length;
  await ops.assistant('user-c', {
    action: 'translate',
    placeId: 'PLACE_REAL_001',
    target: 'en',
  });
  assert.equal(consumed.length, consumedBefore);
  assert.equal(calls.filter((c) => c.startsWith('translate:en')).length, 1);

  // 개인 여행 번역은 캐시하지 않는다.
  await ops.assistant('user-a', {
    action: 'translate',
    journeyId: journey.id,
    target: 'en',
  });
  await ops.assistant('user-a', {
    action: 'translate',
    journeyId: journey.id,
    target: 'en',
  });
  assert.equal(
    calls.filter((c) => c.startsWith('translate:en:내 비밀 여행')).length,
    2,
  );

  // 장소 음성: 동시 요청 병합 + 캐시 히트 시 한도 미차감
  const [v1, v2] = await Promise.all([
    ops.assistant('user-a', { action: 'voice', placeId: 'PLACE_REAL_001' }),
    ops.assistant('user-b', { action: 'voice', placeId: 'PLACE_REAL_001' }),
  ]);
  assert.ok(v1 instanceof Uint8Array && v2 instanceof Uint8Array);
  assert.equal(calls.filter((c) => c === 'voice').length, 1);
  const voiceConsumedBefore = consumed.length;
  await ops.assistant('user-c', { action: 'voice', placeId: 'PLACE_REAL_001' });
  assert.equal(consumed.length, voiceConsumedBefore);

  // 24시간 경과 후에는 새로 호출한다.
  clock = 25 * 60 * 60 * 1000;
  await ops.assistant('user-c', { action: 'voice', placeId: 'PLACE_REAL_001' });
  assert.equal(calls.filter((c) => c === 'voice').length, 2);
});

test('만족도 없는 동일 조건 CLOVA 추천은 10분간 캐시·병합하고 만족도 있는 추천은 공유하지 않는다', async () => {
  let clock = 0;
  let rerankCalls = 0;
  let recommendCalls = 0;
  const ai = fakeAi({
    rerank: async (_q, docs) => {
      rerankCalls++;
      await new Promise((r) => setTimeout(r, 5));
      return { citedIds: [docs[0].id], summary: '연관' };
    },
    recommend: async (_prompt, candidates) => {
      recommendCalls++;
      await new Promise((r) => setTimeout(r, 5));
      return {
        title: '호수 코스',
        summary: '추천 요약',
        stops: [{ placeId: candidates[0].id, reason: '호수 산책' }],
      };
    },
  });

  const rec = createRecommendation(ai, () => clock);
  const [r1, r2] = await Promise.all([
    rec('호수   산책', '전체', []),
    rec('호수 산책', '전체', []),
  ]);
  assert.deepEqual(r1, r2);
  assert.equal(rerankCalls, 1);
  assert.equal(recommendCalls, 1);
  assert.equal(rec.hasCached('호수 산책', '전체', []), true);

  // 개인 만족도가 있는 요청은 공용 캐시를 타지 않는다.
  assert.equal(
    rec.hasCached('호수 산책', '전체', [
      { placeId: 'PLACE_REAL_001', rating: 5 },
    ]),
    false,
  );
  await rec('호수 산책', '전체', [{ placeId: 'PLACE_REAL_001', rating: 5 }]);
  assert.equal(recommendCalls, 2);

  // operations에서 캐시 히트 시 한도 차감 없이 재사용
  const consumed: string[] = [];
  const ops = createOperations(
    { journeys: async () => [] } as unknown as JourneyService,
    ai,
    {
      consume: async (key) => {
        consumed.push(key);
        return true;
      },
    },
    undefined,
    () => clock,
  );
  await ops.recommendation('u1', { prompt: '호수 산책', region: '전체' });
  const usedAfterFirst = consumed.length;
  await ops.recommendation('u2', { prompt: '호수   산책', region: '전체' });
  assert.equal(consumed.length, usedAfterFirst);

  // 10분 경과 후 새로 호출
  clock = 11 * 60 * 1000;
  await ops.recommendation('u2', { prompt: '호수 산책', region: '전체' });
  assert.ok(consumed.length > usedAfterFirst);
});

test('날씨 예보·기상청 특보·명소 블로그 후기는 동시 요청을 병합하고 실패 폴백은 캐시하지 않는다', async () => {
  let clock = Date.parse('2026-11-21T03:00:00Z');
  let weatherCalls = 0;
  let shouldFail = true;
  const fetchWeather = createWeather({
    now: () => clock,
    demo: () => false,
    current: async (region): Promise<WeatherResponse> => {
      weatherCalls++;
      await new Promise((r) => setTimeout(r, 5));
      if (shouldFail) throw new Error('temporary down');
      return { ...buildDemoWeather(region, clock), mode: 'live' };
    },
  });

  // 실패 시 데모 폴백을 주지만 캐시하지 않는다.
  const fallback = await fetchWeather('수원시');
  assert.equal(fallback.mode, 'demo');
  assert.equal(weatherCalls, 1);

  // 복구 후 동시 요청은 한 번만 호출하고 10분간 캐시한다.
  shouldFail = false;
  const [w1, w2] = await Promise.all([
    fetchWeather('수원시'),
    fetchWeather('수원시'),
  ]);
  assert.equal(w1.mode, 'live');
  assert.equal(w1, w2);
  assert.equal(weatherCalls, 2);
  clock += 5 * 60 * 1000;
  await fetchWeather('수원시');
  assert.equal(weatherCalls, 2);

  // 기상청 특보·지진 동시 요청 병합
  let statusCalls = 0;
  let quakeCalls = 0;
  const alertPort: AlertPort = {
    now: () => clock,
    configured: () => true,
    status: async () => {
      statusCalls++;
      await new Promise((r) => setTimeout(r, 5));
      return { current: 'o 없음', preliminary: 'o 없음', issuedAt: null };
    },
    quakes: async () => {
      quakeCalls++;
      await new Promise((r) => setTimeout(r, 5));
      return [];
    },
  };
  const fetchAlerts = createAlerts(alertPort);
  await Promise.all([fetchAlerts('수원시'), fetchAlerts('가평군')]);
  assert.equal(statusCalls, 1);
  assert.equal(quakeCalls, 1);

  // 명소 블로그 후기 동시 요청 병합
  let blogCalls = 0;
  const searchPort: RestaurantSearchPort = {
    now: () => clock,
    configured: () => true,
    local: async () => [],
    blog: async () => {
      blogCalls++;
      await new Promise((r) => setTimeout(r, 5));
      return ['화성행궁 후기 - 멋져요'];
    },
  };
  const placeReviews = createPlaceReviews(searchPort);
  const [rev1, rev2] = await Promise.all([
    placeReviews('화성행궁', '수원시'),
    placeReviews('화성행궁', '수원시'),
  ]);
  assert.deepEqual(rev1, rev2);
  assert.equal(blogCalls, 1);
});
