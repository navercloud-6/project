import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadPreferences, storePreferences } from '../lib/adapters/preferences';
import { BottomNavigation } from '../components/bottom-navigation';
import { MyJourneys } from '../components/my-journeys';
import { MyProfile } from '../components/my-profile';
import { PlaceCatalog } from '../components/place-catalog';
import { PlaceDetail } from '../components/place-detail';
import { TripBuilder } from '../components/trip-builder';
import { WeatherPanel } from '../components/weather-panel';
import { Poster } from '../components/assistant/poster';
import { ImageConfigContext } from 'next/dist/shared/lib/image-config-context.shared-runtime';
import { imageConfigDefault } from 'next/dist/shared/lib/image-config';
import { places } from '../lib/domain/catalog';
import { gyeonggiCities } from '../lib/domain/gyeonggi';
import { searchPlaces } from '../lib/domain/place-labels';
import type { Journey } from '../lib/domain/contracts';

test('프로필은 방문 기록이 있는 고유 장소만 집계하고 연결 전에는 집계를 숨긴다', () => {
  const journeys: Journey[] = [
    {
      id: 'first',
      name: '첫 여행',
      date: '2026-11-17',
      createdAt: '',
      placeIds: ['a', 'b'],
      records: { a: { rating: 5, note: '' } },
    },
    {
      id: 'second',
      name: '다음 여행',
      date: '2026-11-18',
      createdAt: '',
      placeIds: ['a', 'b', 'c'],
      records: { a: { rating: 4, note: '' }, b: { rating: 5, note: '' } },
    },
  ];
  const render = (ready: boolean, saved = journeys) =>
    renderToStaticMarkup(
      createElement(MyProfile, {
        saved,
        ready,
        regions: ['전체'],
        preferences: { region: '전체', prompt: '' },
        onSave() {},
        onJourneys() {},
        onRecommend() {},
        auth: { enabled: false, authenticated: false },
        onLogout() {},
        busy: false,
      }),
    );
  const rendered = render(true);
  assert.match(rendered, /<h1>프로필<\/h1>/);
  assert.doesNotMatch(rendered, /<h1>마이<\/h1>/);
  assert.match(rendered, /저장한 여행<\/dt><dd>2<small>개/);
  assert.match(rendered, /기록한 방문 장소<\/dt><dd>2<small>곳/);
  assert.match(rendered, /여행 보관 정책/);
  assert.doesNotMatch(rendered, /네이버 계정|네이버로 로그인|로그아웃/);
  assert.doesNotMatch(render(false), /<dd>/);
  assert.match(render(false), /연결 상태를 확인/);
  assert.match(render(true, []), /첫 여행을 찾아보세요/);

  const cityRegions = ['전체', ...gyeonggiCities.map((city) => city.name)];
  assert.ok(cityRegions.includes('시흥시'));
  assert.ok(!cityRegions.includes('오이도'));
  assert.equal(searchPlaces(places, '', '시흥시').length, 20);
});

test('하단 메뉴는 자연스러운 여행 흐름 순서를 따르고 프로필 라벨을 표시한다', () => {
  const nav = renderToStaticMarkup(
    createElement(BottomNavigation, {
      tab: 'explore',
      savedCount: 3,
      onTab() {},
    }),
  );
  const labels = [
    ...nav.matchAll(/<span class="navigation-label-full">([^<]+)/g),
  ].map((match) => match[1].trim());
  assert.deepEqual(labels, [
    '경기 둘러보기',
    '경기 날씨',
    '여행 도우미',
    '내 여행',
    '프로필',
  ]);
});

test('경기 날씨 화면은 시흥 기준 문구 대신 경기도 지도와 31개 시·군 선택을 제공한다', () => {
  const markup = renderToStaticMarkup(
    createElement(WeatherPanel, {
      selectedCityId: null,
      onSelectCity() {},
      places,
      selection: [],
      onTogglePlace() {},
      onDetailPlace() {},
      onExploreRegion() {},
    }),
  );
  assert.match(markup, /class="gyeonggi-map-svg"/);
  assert.match(markup, /경기도 전체 보기/);
  assert.match(markup, /<option value="41110">수원시<\/option>/);
  assert.match(markup, /<option value="41820">가평군<\/option>/);
  assert.match(markup, /<option value="41390">시흥시<\/option>/);
  assert.doesNotMatch(markup, /시흥권|시흥 10개 권역/);
});

test('여행 취향은 같은 키로 저장·복원하고 잘못된 저장값을 사용하지 않는다', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const regions = ['전체', '오이도'];
  assert.equal(loadPreferences(storage, regions), null);
  const preferences = { region: '오이도', prompt: '바다를 보는 하루' };
  storePreferences(storage, preferences);
  assert.deepEqual(loadPreferences(storage, regions), preferences);
  for (const value of [
    null,
    [],
    '오이도',
    { region: '없는 지역', prompt: '' },
    { region: '전체', prompt: 3 },
    { region: '전체', prompt: 'a'.repeat(501) },
  ]) {
    storage.setItem('tourpass-preferences', JSON.stringify(value));
    assert.equal(loadPreferences(storage, regions), null);
  }
  storage.setItem(
    'tourpass-preferences',
    JSON.stringify({ region: '전체', prompt: 'a'.repeat(500) }),
  );
  assert.equal(loadPreferences(storage, regions)?.prompt.length, 500);
});

test('손상된 JSON·브라우저 저장 제한은 호출자가 안내할 수 있도록 전달한다', () => {
  assert.throws(
    () => loadPreferences({ getItem: () => '{' }, ['전체']),
    SyntaxError,
  );
  assert.throws(
    () =>
      loadPreferences(
        {
          getItem() {
            throw new Error('blocked');
          },
        },
        ['전체'],
      ),
    /blocked/,
  );
  assert.throws(
    () =>
      storePreferences(
        {
          setItem() {
            throw new Error('quota');
          },
        },
        { region: '전체', prompt: '' },
      ),
    /quota/,
  );
});

test('빈 목록·8곳 상한·내 여행 접이식 작업은 막다른 흐름 없이 다음 행동을 분리해 제공한다', () => {
  const capabilities = {
    clova: false,
    voice: false,
    translate: false,
    ocr: false,
  };
  const emptyBuilder = renderToStaticMarkup(
    createElement(TripBuilder, {
      selected: [],
      name: '나의 경기 여행',
      date: '2026-11-19',
      ready: true,
      busy: false,
      hidden: false,
      onBrowse() {},
      onRecommend() {},
      onMoveUp() {},
      onToggle() {},
      onName() {},
      onDate() {},
      onSave() {},
    }),
  );
  assert.match(emptyBuilder, /장소 찾기/);
  assert.match(emptyBuilder, /추천받기/);

  const fullDetail = renderToStaticMarkup(
    createElement(PlaceDetail, {
      detail: places[0],
      selected: false,
      full: true,
      capabilities,
      onClose() {},
      onToggle() {},
      onReview() {},
    }),
  );
  assert.match(fullDetail, /담은 여행에서 정리하기/);

  const savedJourneys = renderToStaticMarkup(
    createElement(MyJourneys, {
      saved: [
        {
          id: 'j1',
          name: '바다 코스',
          date: '2026-11-19',
          createdAt: '',
          placeIds: [places[0].id],
          records: {},
        },
      ],
      ready: true,
      auth: { enabled: true, authenticated: true },
      places,
      capabilities,
      onExplore() {},
      onRecord() {},
      onDetail() {},
      onSaved() {},
    }),
  );
  assert.match(savedJourneys, /네이버 계정에 연결된 보관함/);
  assert.match(savedJourneys, /<summary>코스 지도 보기<\/summary>/);
  assert.match(savedJourneys, /<summary>대화로 여행 수정<\/summary>/);
  assert.match(savedJourneys, /<summary>여행 번역<\/summary>/);
});

test('상세·담은 여행·카탈로그·포스터는 일관된 버튼 위계와 데드엔드 없는 흐름을 제공한다', () => {
  const capabilities = {
    clova: false,
    voice: false,
    translate: false,
    ocr: false,
  };
  const selectedDetail = renderToStaticMarkup(
    createElement(PlaceDetail, {
      detail: places[0],
      selected: true,
      full: false,
      selectionCount: 2,
      capabilities,
      onClose() {},
      onToggle() {},
      onReview() {},
    }),
  );
  assert.match(selectedDetail, /class="primary"[^>]*>담은 여행 확인 \(2곳\)/);
  assert.match(selectedDetail, /class="secondary"[^>]*>담기 취소/);

  const populatedBuilder = renderToStaticMarkup(
    createElement(TripBuilder, {
      selected: places.slice(0, 2),
      name: '나의 경기 여행',
      date: '2026-11-20',
      ready: false,
      loading: false,
      busy: false,
      hidden: false,
      onBrowse() {},
      onRetrySession() {},
      onMoveUp() {},
      onMoveDown() {},
      onClear() {},
      onToggle() {},
      onName() {},
      onDate() {},
      onSave() {},
    }),
  );
  assert.match(populatedBuilder, /아래로 이동/);
  assert.match(populatedBuilder, /모두 비우기/);
  assert.match(populatedBuilder, /다시 시도/);

  const emptyMapCatalog = renderToStaticMarkup(
    createElement(PlaceCatalog, {
      places,
      regions: ['전체'],
      filtered: [],
      selection: [],
      query: '없는장소',
      region: '전체',
      viewMode: 'map',
      hidden: false,
      onQuery() {},
      onRegion() {},
      onViewMode() {},
      onToggle() {},
      onDetail() {},
    }),
  );
  assert.equal([...emptyMapCatalog.matchAll(/class="empty"/g)].length, 1);
  assert.match(emptyMapCatalog, /전체 장소 보기/);

  const pagedCatalog = renderToStaticMarkup(
    createElement(
      ImageConfigContext.Provider,
      {
        value: {
          ...imageConfigDefault,
          remotePatterns: [
            {
              protocol: 'https',
              hostname: 'tong.visitkorea.or.kr',
              pathname: '/cms/**',
              search: '',
            },
          ],
        },
      },
      createElement(PlaceCatalog, {
        places,
        regions: ['전체'],
        filtered: places.slice(0, 25),
        selection: [],
        query: '',
        region: '전체',
        viewMode: 'grid',
        hidden: false,
        onQuery() {},
        onRegion() {},
        onViewMode() {},
        onToggle() {},
        onDetail() {},
      }),
    ),
  );
  assert.match(pagedCatalog, /장소 더 보기/);
  assert.equal([...pagedCatalog.matchAll(/<article\b/g)].length, 18);

  const posterMarkup = renderToStaticMarkup(
    createElement(Poster, {
      places: places.slice(0, 25),
      capabilities,
      onSaved() {},
      onBrowse() {},
    }),
  );
  assert.match(posterMarkup, /<optgroup label=/);
  assert.match(posterMarkup, /장소 찾기/);
});
