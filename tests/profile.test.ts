import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadPreferences, storePreferences } from '../lib/adapters/preferences';
import { MyJourneys } from '../components/my-journeys';
import { MyProfile } from '../components/my-profile';
import { PlaceDetail } from '../components/place-detail';
import { TripBuilder } from '../components/trip-builder';
import { places } from '../lib/domain/catalog';
import type { Journey } from '../lib/domain/contracts';

test('마이는 방문 기록이 있는 고유 장소만 집계하고 연결 전에는 집계를 숨긴다', () => {
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
  assert.match(render(true), /저장한 여행<\/dt><dd>2<small>개/);
  assert.match(render(true), /기록한 방문 장소<\/dt><dd>2<small>곳/);
  assert.doesNotMatch(render(false), /<dd>/);
  assert.match(render(false), /연결 상태를 확인/);
  assert.match(render(true, []), /첫 여행을 찾아보세요/);
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
