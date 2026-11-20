import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlaceMap } from '../components/place-map';
import { places } from '../lib/domain/catalog';
import {
  loadNaverMaps,
  naverMapScriptUrl,
  naverMapSearchUrl,
  normalizeNaverMapClientId,
  onNaverMapAuthFailure,
  resetNaverMapsLoader,
} from '../lib/adapters/naver-map';

test('여러 여행 지도를 함께 표시해도 각 지도는 자신의 SVG 그라데이션을 참조한다', () => {
  const markup = renderToStaticMarkup(
    createElement(
      'div',
      null,
      ...places.slice(0, 2).map((place) =>
        createElement(PlaceMap, {
          key: place.id,
          places,
          visiblePlaces: [place],
          routeIds: [place.id],
          compact: true,
          onDetail() {},
        }),
      ),
    ),
  );
  const maps = [...markup.matchAll(/<svg\b[\s\S]*?<\/svg>/g)];
  assert.equal(maps.length, 2);
  const ids: string[] = [];
  for (const [map] of maps) {
    const definitions = [...map.matchAll(/<linearGradient id="([^"]+)"/g)].map(
      (match) => match[1],
    );
    assert.equal(definitions.length, 2);
    const references = [...map.matchAll(/fill="url\(#([^)]+)\)"/g)].map(
      (match) => match[1],
    );
    assert.deepEqual(references, definitions);
    ids.push(...definitions);
  }
  assert.equal(new Set(ids).size, ids.length);
});

test('네이버 지도 Client ID 정규화와 SDK·외부 검색 URL 생성이 안전하게 동작한다', () => {
  assert.equal(normalizeNaverMapClientId('  abc123_XY-9  '), 'abc123_XY-9');
  assert.equal(normalizeNaverMapClientId(''), '');
  assert.equal(normalizeNaverMapClientId('bad key&foo=1'), '');
  assert.equal(normalizeNaverMapClientId('<script>'), '');

  assert.equal(
    naverMapScriptUrl('test-key-01'),
    'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=test-key-01',
  );
  assert.equal(naverMapScriptUrl('invalid key'), null);

  assert.equal(
    naverMapSearchUrl({
      name: '시흥 갯골생태공원',
      address: '경기도 시흥시 동서로 287',
    }),
    'https://map.naver.com/p/search/' +
      encodeURIComponent('경기도 시흥시 동서로 287'),
  );
  assert.equal(
    naverMapSearchUrl({ name: '시흥 갯골생태공원', address: '' }),
    'https://map.naver.com/p/search/' + encodeURIComponent('시흥 갯골생태공원'),
  );
});

test('PlaceMap은 네이버 지도 키 유무에 따라 네이버 지도 영역과 SVG 폴백을 전환한다', () => {
  const fallbackMarkup = renderToStaticMarkup(
    createElement(PlaceMap, {
      places,
      visiblePlaces: places.slice(0, 3),
      routeIds: [places[0].id],
      onDetail() {},
    }),
  );
  assert.match(fallbackMarkup, /class="place-map-svg"/);
  assert.match(fallbackMarkup, /경기도 관광지 위치도/);
  assert.match(fallbackMarkup, /네이버 지도 키 미설정/);
  assert.match(fallbackMarkup, /https:\/\/map\.naver\.com\/p\/search\//);
  assert.doesNotMatch(fallbackMarkup, /data-map-provider="naver"/);
  assert.doesNotMatch(fallbackMarkup, /시화호|서해 \(황해\)|대야·소래산/);

  const naverMarkup = renderToStaticMarkup(
    createElement(PlaceMap, {
      places,
      visiblePlaces: places.slice(0, 3),
      routeIds: [places[0].id, places[1].id],
      naverMapClientId: 'demo_client_id',
      onDetail() {},
    }),
  );
  assert.match(naverMarkup, /data-map-provider="naver"/);
  assert.match(naverMarkup, /네이버 지도를 불러오는 중입니다/);
  assert.match(naverMarkup, /지도 장소 선택/);
  assert.match(naverMarkup, /https:\/\/map\.naver\.com\/p\/search\//);
  assert.doesNotMatch(naverMarkup, /class="place-map-svg"/);
});

test('시흥 지역만으로 구성된 코스 지도도 별도 그래픽 없이 경기도 지도로 표시한다', () => {
  const siheungOnly = places
    .filter((place) => place.cityId === '41390')
    .slice(0, 2);
  const markup = renderToStaticMarkup(
    createElement(PlaceMap, {
      places,
      visiblePlaces: siheungOnly,
      routeIds: siheungOnly.map((place) => place.id),
      compact: true,
      onDetail() {},
    }),
  );
  assert.match(markup, /경기도 관광지 위치도/);
  assert.doesNotMatch(markup, /시흥권|시화호|서해 \(황해\)|대야·소래산/);
  assert.ok(
    markup.includes(
      `translate(${siheungOnly[0].coordinates.x}, ${siheungOnly[0].coordinates.y})`,
    ),
  );
});

test('loadNaverMaps는 스크립트 중복 로드를 막고 인증 실패 콜백을 전파한다', async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  type Listener = () => void;
  type MockScript = {
    type: string;
    async: boolean;
    defer: boolean;
    src: string;
    dataset: Record<string, string>;
    parentNode: { removeChild: (node: MockScript) => void } | null;
    listeners: Record<string, Listener[]>;
    addEventListener: (event: string, listener: Listener) => void;
    emit: (event: string) => void;
  };

  const scripts: MockScript[] = [];
  const head = {
    appendChild(node: MockScript) {
      node.parentNode = head;
      scripts.push(node);
    },
    removeChild(node: MockScript) {
      const idx = scripts.indexOf(node);
      if (idx !== -1) scripts.splice(idx, 1);
      node.parentNode = null;
    },
  };

  const mockWindow: Record<string, unknown> = {};
  const mockDocument = {
    head,
    querySelector: () =>
      scripts.find((script) => script.dataset.naverMapsSdk === 'true') ?? null,
    createElement(): MockScript {
      const node: MockScript = {
        type: '',
        async: false,
        defer: false,
        src: '',
        dataset: {},
        parentNode: null,
        listeners: {},
        addEventListener(event: string, listener: Listener) {
          node.listeners[event] ??= [];
          node.listeners[event].push(listener);
        },
        emit(event: string) {
          for (const listener of node.listeners[event] ?? []) listener();
        },
      };
      return node;
    },
  };

  Object.defineProperty(globalThis, 'window', {
    value: mockWindow,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'document', {
    value: mockDocument,
    configurable: true,
    writable: true,
  });

  try {
    resetNaverMapsLoader();
    const first = loadNaverMaps('sample_key_1');
    const second = loadNaverMaps('sample_key_1');
    assert.equal(scripts.length, 1);
    assert.equal(
      scripts[0].src,
      'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=sample_key_1',
    );

    const fakeMaps = { Map: function MockMap() {} };
    mockWindow.naver = { maps: fakeMaps };
    scripts[0].emit('load');
    assert.equal(await first, fakeMaps);
    assert.equal(await second, fakeMaps);

    let notified = 0;
    const unsubscribe = onNaverMapAuthFailure(() => {
      notified++;
    });
    assert.equal(typeof mockWindow.navermap_authFailure, 'function');
    (mockWindow.navermap_authFailure as () => void)();
    assert.equal(notified, 1);
    unsubscribe();

    await assert.rejects(loadNaverMaps('sample_key_1'), /인증에 실패/);

    resetNaverMapsLoader();
    delete mockWindow.naver;
    delete mockWindow.navermap_authFailure;
    scripts.length = 0;

    const failed = loadNaverMaps('sample_key_2');
    assert.equal(scripts.length, 1);
    scripts[0].emit('error');
    await assert.rejects(failed, /불러오지 못했습니다/);
    assert.equal(scripts.length, 0);
  } finally {
    resetNaverMapsLoader();
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
    }
    if (originalDocument === undefined) {
      delete (globalThis as Record<string, unknown>).document;
    } else {
      Object.defineProperty(globalThis, 'document', {
        value: originalDocument,
        configurable: true,
        writable: true,
      });
    }
  }
});
