import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  WeatherPanelView,
  type WeatherPanelState,
} from '../components/weather-panel';
import { buildDemoWeather, WEATHER_REGIONS } from '../lib/domain/weather';
import { gyeonggiCities } from '../lib/domain/gyeonggi';
import { places } from '../lib/domain/catalog';
import { GET } from '../app/api/weather/route';

const now = Date.parse('2026-11-21T03:00:00Z');
const props = {
  selectedCityId: null as string | null,
  places: [],
  selection: [],
  onSelectCity(_cityId: string | null) {},
  onTogglePlace(_placeId: string) {},
  onDetailPlace() {},
  onExploreRegion(_region: string) {},
  onRetry() {},
};
const ready = (region: string): WeatherPanelState => ({
  region,
  status: 'ready',
  data: buildDemoWeather(region, now),
});
function render(selectedCityId: string | null, state: WeatherPanelState) {
  return renderToStaticMarkup(
    createElement(WeatherPanelView, { ...props, selectedCityId, state }),
  );
}

test('날씨 API는 경기도 31개 시·군의 좌표로 5일 예보와 같은 도시 관광지를 조회한다', async () => {
  const original = globalThis.fetch;
  const previousMode = process.env.WEATHER_MODE;
  delete process.env.WEATHER_MODE;
  try {
    for (const city of gyeonggiCities) {
      let calls = 0;
      globalThis.fetch = async (input) => {
        calls++;
        const url = new URL(String(input));
        const meta = WEATHER_REGIONS[city.name];
        assert.equal(url.origin, 'https://api.open-meteo.com');
        assert.equal(url.searchParams.get('latitude'), String(meta.lat));
        assert.equal(url.searchParams.get('longitude'), String(meta.lng));
        assert.equal(url.searchParams.get('forecast_days'), '5');
        return Response.json({
          current: {
            time: '2026-11-21T12:00',
            temperature_2m: -1,
            apparent_temperature: -3,
            relative_humidity_2m: 65,
            precipitation: 0.1,
            weather_code: 71,
            wind_speed_10m: 2,
          },
          daily: {
            time: [21, 22, 23, 24, 25].map((day) => `2026-11-${day}`),
            weather_code: [71, 0, 1, 3, 61],
            temperature_2m_max: [5, 6, 7, 8, 9],
            temperature_2m_min: [-3, -2, -1, 0, 1],
            precipitation_probability_max: [80, 0, 10, 30, 70],
          },
        });
      };
      const response = await GET(
        new Request(
          `http://localhost/api/weather?region=${encodeURIComponent(city.name)}`,
        ),
      );
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(calls, 1);
      assert.equal(data.region, city.name);
      assert.equal(data.mode, 'live');
      assert.equal(data.current.icon, 'snow');
      assert.equal(data.current.temperature, -1);
      assert.equal(data.daily.length, 5);
      assert.ok(data.recommendedPlaceIds.length > 0);
      for (const id of data.recommendedPlaceIds)
        assert.equal(places.find((place) => place.id === id)?.cityId, city.id);
    }
    globalThis.fetch = async () => {
      throw new Error('offline');
    };
    const cached = await GET(
      new Request('http://localhost/api/weather?region=가평군'),
    );
    assert.equal(
      (await cached.json()).mode,
      'live',
      '최근 성공한 지역은 10분 캐시를 반환한다',
    );
    const fallback = await GET(
      new Request('http://localhost/api/weather?region=전체'),
    );
    assert.equal((await fallback.json()).mode, 'demo');
    const invalid = await GET(
      new Request('http://localhost/api/weather?region=없는도시'),
    );
    assert.equal(invalid.status, 400);
  } finally {
    globalThis.fetch = original;
    if (previousMode === undefined) delete process.env.WEATHER_MODE;
    else process.env.WEATHER_MODE = previousMode;
  }
});

test('날씨 탭은 공유한 도시를 선택한 상태로 경기도 지도와 5일 예보를 표시한다', () => {
  for (const city of gyeonggiCities) {
    const html = render(city.id, ready(city.name));
    assert.match(html, /class="gyeonggi-map-svg"/);
    assert.equal([...html.matchAll(/<option\b/g)].length, 32);
    assert.ok(html.includes(`value="${city.id}" selected=""`));
    assert.ok(html.includes(`data-city-id="${city.id}"`));
    assert.ok(html.includes(`경기도 · ${city.name}`));
    assert.equal([...html.matchAll(/class="weather-day-card"/g)].length, 5);
    assert.match(html, /데모 기상 안내/);
    assert.doesNotMatch(html, /날씨 정보를 불러오고/);
    assert.doesNotMatch(html, /해안·산림 국지 기상|weather-region-chip/);
  }
  assert.match(render(null, ready('전체')), /경기도 대표 \(수원 중심\)/);
});

test('도시 전환 시 이전 도시의 날씨·추천·오류를 즉시 숨긴다', () => {
  for (const oldState of [
    ready('시흥시'),
    { region: '시흥시', status: 'error', error: '이전 도시 오류' },
  ] as WeatherPanelState[]) {
    const html = render('41820', oldState);
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /날씨 정보를 불러오고/);
    assert.doesNotMatch(
      html,
      /경기도 · 시흥시|weather-temp-value|weather-place-grid|이전 도시 오류/,
    );
  }
  const failed = render('41820', {
    region: '가평군',
    status: 'error',
    error: '조회 실패',
  });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /조회 실패/);
  assert.match(failed, /다시 시도/);
  assert.doesNotMatch(failed, /weather-temp-value|weather-place-grid/);
});

test('경기도 지도 패널은 도시 ID를 전달하고 재시도·장소 이동을 연결한다', () => {
  type NodeProps = { children?: ReactNode; [key: string]: unknown };
  const nodes: NodeProps[] = [];
  function visit(node: ReactNode) {
    if (Array.isArray(node)) node.forEach(visit);
    else if (isValidElement<NodeProps>(node)) {
      nodes.push(node.props);
      visit(node.props.children);
    }
  }
  const selected: Array<string | null> = [];
  const explored: string[] = [];
  let retries = 0;
  const actions = {
    ...props,
    selectedCityId: '41820',
    onSelectCity: (id: string | null) => selected.push(id),
    onExploreRegion: (name: string) => explored.push(name),
    onRetry: () => retries++,
  };
  visit(WeatherPanelView({ ...actions, state: ready('가평군') }));
  const mapPanel = nodes.find(
    (node) =>
      node.selectedCityId === '41820' &&
      typeof node.onSelectCity === 'function',
  )!;
  const onSelectCity = mapPanel.onSelectCity as (id: string | null) => void;
  onSelectCity('41110');
  onSelectCity('41390');
  onSelectCity(null);
  (
    nodes.find((node) => node.children === '가평군 장소 더 보기')!
      .onClick as () => void
  )();
  assert.deepEqual(selected, ['41110', '41390', null]);
  assert.deepEqual(explored, ['가평군']);
  nodes.length = 0;
  visit(
    WeatherPanelView({
      ...actions,
      state: { region: '가평군', status: 'error', error: '조회 실패' },
    }),
  );
  (
    nodes.find((node) => node.children === '다시 시도')!.onClick as () => void
  )();
  assert.equal(retries, 1);
});
