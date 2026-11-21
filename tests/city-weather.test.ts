import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildCityWeatherResponse,
  cityWeatherLocations,
  cityWeatherQuerySchema,
  CITY_WEATHER_CACHE_MS,
  DEFAULT_WEATHER_CITY_ID,
  type CityWeatherObservation,
} from '../lib/domain/city-weather';
import { gyeonggiCities } from '../lib/domain/gyeonggi';
import { projectGyeonggi } from '../lib/domain/coordinates';
import { createCityWeather } from '../lib/application/city-weather';
import { liveCityWeather } from '../lib/adapters/open-meteo';
import { createCityWeatherClient } from '../lib/adapters/city-weather-client';
import { CityWeatherView } from '../components/city-weather-badge';
import { GET } from '../app/api/weather/current/route';
import { ApplicationError } from '../lib/domain/errors';
import { openApiDocument } from '../lib/adapters/openapi';

const now = Date.parse('2026-11-20T09:15:00Z');
const suwon = cityWeatherLocations.find((city) => city.id === '41110')!;
const gapyeong = cityWeatherLocations.find((city) => city.id === '41820')!;
const observation = (
  clock = now,
  temperature = -3,
): CityWeatherObservation => ({
  observedAt: new Date(clock).toISOString(),
  current: { temperature, weatherCode: 61, condition: '비', icon: 'rain' },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test('31개 시·군 날씨 대표 GPS 좌표가 원본 경계의 대표 지점과 대응하고 기본 지역은 수원이다', () => {
  assert.equal(cityWeatherLocations.length, 31);
  assert.equal(
    cityWeatherQuerySchema.parse({}).cityId,
    DEFAULT_WEATHER_CITY_ID,
  );
  for (const city of cityWeatherLocations) {
    assert.equal(
      cityWeatherQuerySchema.parse({ cityId: city.id }).cityId,
      city.id,
    );
    assert.ok(city.coordinates.lat >= 36.8 && city.coordinates.lat <= 38.4);
    assert.ok(city.coordinates.lng >= 126.3 && city.coordinates.lng <= 128);
    const point = projectGyeonggi(city.coordinates.lat, city.coordinates.lng);
    const label = gyeonggiCities.find((item) => item.id === city.id)!.label;
    assert.ok(Math.abs(point.x - label[0]) < 0.02);
    assert.ok(Math.abs(point.y - label[1]) < 0.02);
  }
  for (const cityId of ['', '전체', '11110', '99999', '수원시'])
    assert.equal(cityWeatherQuerySchema.safeParse({ cityId }).success, false);
});

test('날씨 유스케이스는 지역별 동시 조회를 병합하고 성공 자료를 10분만 캐시한다', async () => {
  let clock = now;
  let calls = 0;
  const gate = deferred<CityWeatherObservation>();
  const fetchWeather = createCityWeather({
    now: () => clock,
    demo: () => false,
    current: async () => {
      calls++;
      return gate.promise;
    },
  });
  const a = fetchWeather();
  const b = fetchWeather(suwon.id);
  assert.equal(calls, 1);
  gate.resolve(observation());
  const [first, second] = await Promise.all([a, b]);
  assert.equal(first, second);
  assert.equal(first.cityName, '수원시');
  assert.equal(first.current.temperature, -3);
  assert.equal(first.mode, 'live');
  assert.equal(
    Date.parse(first.expiresAt) - Date.parse(first.fetchedAt),
    CITY_WEATHER_CACHE_MS,
  );
  await fetchWeather(suwon.id);
  assert.equal(calls, 1);
  await fetchWeather(gapyeong.id);
  assert.equal(calls, 2);
  clock += CITY_WEATHER_CACHE_MS;
  await fetchWeather(suwon.id);
  assert.equal(calls, 3);
  await assert.rejects(fetchWeather('99999'));
  assert.equal(calls, 3);
});

test('조회 실패·오래된 자료는 예시로 대체하거나 캐시하지 않고 명시적 시연 모드만 예시를 반환한다', async () => {
  let calls = 0;
  let fail = true;
  let demo = false;
  let clock = now;
  const fetchWeather = createCityWeather({
    now: () => clock,
    demo: () => demo,
    current: async () => {
      calls++;
      if (fail) throw new ApplicationError('UPSTREAM_TIMEOUT', 'timeout');
      return observation(clock, 0);
    },
  });
  await assert.rejects(
    fetchWeather(suwon.id),
    (error: unknown) =>
      error instanceof ApplicationError && error.code === 'UPSTREAM_TIMEOUT',
  );
  fail = false;
  const result = await fetchWeather(suwon.id);
  assert.equal(result.current.temperature, 0);
  assert.equal(calls, 2);
  clock += CITY_WEATHER_CACHE_MS;
  fail = true;
  await assert.rejects(fetchWeather(suwon.id));
  assert.equal(calls, 3);
  demo = true;
  const example = await fetchWeather(suwon.id);
  assert.equal(example.mode, 'demo');
  assert.equal(example.source.name, '시연 데이터');
  assert.equal(calls, 3);
  for (const time of [now - 4 * 3600000, now + 3600000]) {
    const stale = createCityWeather({
      now: () => now,
      demo: () => false,
      current: async () => observation(time),
    });
    await assert.rejects(stale(suwon.id), /자료 시각/);
  }
});

test('Open-Meteo 어댑터는 각 시·군 좌표로 현재 정보만 조회하고 날씨 코드·한국 시각을 변환한다', async () => {
  const oldFetch = globalThis.fetch;
  const variants = [
    { code: 0, wind: 0, icon: 'sun' },
    { code: 1, wind: 0, icon: 'cloud-sun' },
    { code: 3, wind: 0, icon: 'cloud' },
    { code: 61, wind: 0, icon: 'rain' },
    { code: 71, wind: 0, icon: 'snow' },
    { code: 0, wind: 12, icon: 'wind' },
  ];
  let index = 0;
  try {
    for (const city of cityWeatherLocations) {
      const variant = variants[index++ % variants.length];
      globalThis.fetch = async (input, init) => {
        const url = new URL(String(input));
        assert.equal(url.hostname, 'api.open-meteo.com');
        assert.equal(
          Number(url.searchParams.get('latitude')),
          city.coordinates.lat,
        );
        assert.equal(
          Number(url.searchParams.get('longitude')),
          city.coordinates.lng,
        );
        assert.equal(url.searchParams.get('timezone'), 'Asia/Seoul');
        assert.equal(url.searchParams.has('daily'), false);
        assert.equal(init?.cache, 'no-store');
        assert.ok(init?.signal);
        return Response.json({
          timezone: 'Asia/Seoul',
          utc_offset_seconds: 32400,
          current: {
            time: '2026-11-20T18:15',
            temperature_2m: -3.25,
            weather_code: variant.code,
            wind_speed_10m: variant.wind,
          },
        });
      };
      const result = await liveCityWeather(city);
      assert.equal(result.observedAt, '2026-11-20T18:15:00+09:00');
      assert.equal(result.current.temperature, -3.3);
      assert.equal(result.current.icon, variant.icon);
    }
    for (const raw of [
      {},
      { timezone: 'UTC', utc_offset_seconds: 0, current: {} },
      {
        timezone: 'Asia/Seoul',
        utc_offset_seconds: 32400,
        current: {
          time: '2026-11-20T18:15',
          temperature_2m: 0,
          weather_code: 999,
          wind_speed_10m: 0,
        },
      },
    ]) {
      globalThis.fetch = async () => Response.json(raw);
      await assert.rejects(liveCityWeather(suwon), /응답/);
    }
    globalThis.fetch = async () => {
      throw new DOMException('timeout', 'TimeoutError');
    };
    await assert.rejects(
      liveCityWeather(suwon),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'UPSTREAM_TIMEOUT',
    );
    globalThis.fetch = async () => new Response('', { status: 500 });
    await assert.rejects(liveCityWeather(suwon), /제공 서비스/);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('브라우저 조회는 캐시·진행 중 요청을 공유하고 다른 지역·실패·만료 자료를 재사용하지 않는다', async () => {
  let clock = now;
  let calls = 0;
  const a = deferred<unknown>();
  const b = deferred<unknown>();
  const client = createCityWeatherClient(
    async (cityId) => {
      calls++;
      return cityId === suwon.id ? a.promise : b.promise;
    },
    () => clock,
  );
  const first = client.get(suwon.id);
  assert.equal(first, client.get(suwon.id));
  const second = client.get(gapyeong.id);
  b.resolve(buildCityWeatherResponse(gapyeong, observation(), 'live', now));
  assert.equal((await second).cityId, gapyeong.id);
  a.resolve(buildCityWeatherResponse(suwon, observation(), 'live', now));
  assert.equal((await first).cityId, suwon.id);
  await client.get(gapyeong.id);
  assert.equal(calls, 2);
  clock += CITY_WEATHER_CACHE_MS;
  await client.get(gapyeong.id);
  assert.equal(calls, 3);
  let retry = false;
  const recover = createCityWeatherClient(
    async () => {
      if (!retry) throw Error('offline');
      return buildCityWeatherResponse(suwon, observation(), 'live', clock);
    },
    () => clock,
  );
  await assert.rejects(recover.get(suwon.id));
  retry = true;
  assert.equal((await recover.get(suwon.id)).cityId, suwon.id);
  const wrongCity = createCityWeatherClient(
    async () => buildCityWeatherResponse(suwon, observation(), 'live', now),
    () => now,
  );
  await assert.rejects(wrongCity.get(gapyeong.id), /일치/);
});

test('지도 날씨 UI는 음수·0°C·기준 시각과 예시를 구분하고 로딩·오류·이전 도시 값을 처리한다', () => {
  const render = (
    state: Parameters<typeof CityWeatherView>[0]['state'],
    cityId = suwon.id,
  ) =>
    renderToStaticMarkup(
      createElement(CityWeatherView, { cityId, state, onRetry() {} }),
    );
  for (const temperature of [-3, 0]) {
    const data = buildCityWeatherResponse(
      suwon,
      observation(now, temperature),
      'live',
      now,
    );
    const html = render({ cityId: suwon.id, status: 'ready', data });
    assert.match(html, /수원시 기준/);
    assert.ok(html.includes(`<strong>${temperature}<span>°C</span></strong>`));
    assert.ok(html.indexOf('<svg') < html.indexOf('<strong>'));
    assert.match(html, /<time dateTime=/);
    assert.doesNotMatch(html, /예시 날씨/);
    const switching = render(
      { cityId: suwon.id, status: 'ready', data },
      gapyeong.id,
    );
    assert.match(switching, /가평군 기준/);
    assert.match(switching, /날씨 불러오는 중/);
    assert.doesNotMatch(switching, /수원시 기준/);
  }
  const loading = render({ cityId: suwon.id, status: 'loading' });
  const error = render({ cityId: suwon.id, status: 'error' });
  assert.match(loading, /aria-busy="true"/);
  assert.match(error, /날씨 정보를 불러오지 못했어요/);
  assert.match(error, /다시 시도/);
  assert.doesNotMatch(error, /<svg|<strong>10/);
  const data = buildCityWeatherResponse(suwon, observation(), 'demo', now);
  assert.match(
    render({ cityId: suwon.id, status: 'ready', data }),
    /예시 날씨/,
  );
});

test('시·군 날씨 API는 지역 검증과 오류 상태·캐시 금지를 지키고 OpenAPI를 제공한다', async () => {
  assert.ok(openApiDocument.paths['/api/weather/current']);
  const invalid = await GET(
    new Request('http://localhost/api/weather/current?cityId=99999'),
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get('cache-control'), 'no-store');
  const oldFetch = globalThis.fetch;
  const oldMode = process.env.WEATHER_MODE;
  delete process.env.WEATHER_MODE;
  try {
    globalThis.fetch = async () =>
      Response.json({
        timezone: 'Asia/Seoul',
        utc_offset_seconds: 32400,
        current: {
          time: new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16),
          temperature_2m: 0,
          weather_code: 3,
          wind_speed_10m: 0,
        },
      });
    const result = await GET(
      new Request('http://localhost/api/weather/current?cityId=41130'),
    );
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    const data = await result.json();
    assert.equal(data.cityName, '성남시');
    assert.equal(data.current.temperature, 0);
    assert.equal(data.mode, 'live');
    globalThis.fetch = async () => {
      throw new DOMException('timeout', 'TimeoutError');
    };
    const failure = await GET(
      new Request('http://localhost/api/weather/current?cityId=41150'),
    );
    assert.equal(failure.status, 504);
    assert.equal(failure.headers.get('cache-control'), 'no-store');
    assert.ok((await failure.json()).error);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldMode === undefined) delete process.env.WEATHER_MODE;
    else process.env.WEATHER_MODE = oldMode;
  }
});
