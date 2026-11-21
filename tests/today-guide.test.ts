import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TodayGuide } from '../components/today-guide';
import { GyeonggiMapPanel } from '../components/gyeonggi-map';
import { places } from '../lib/domain/catalog';

const noop = () => {};
const guide = (selectedCityId: string | null) =>
  renderToStaticMarkup(
    createElement(TodayGuide, {
      places,
      selection: [],
      selectedCityId,
      onSelectCity: noop,
      onDetail: noop,
      onToggle: noop,
    }),
  );

test('여행 도우미는 홈과 같은 큰 지도(날씨 카드 포함) 아래에 안전 안내 → 오늘의 안내를 가로로 둔다', () => {
  const markup = guide('41570'); // 김포시
  assert.equal(
    markup.split('gyeonggi-map-weather"').length - 1,
    1,
    '날씨 카드는 지도 안에 한 번만',
  );
  // 날씨 카드는 지도 그림보다 앞(제목 줄)에 있어 지도를 가리지 않는다.
  assert.ok(
    markup.indexOf('gyeonggi-map-weather') < markup.indexOf('gyeonggi-map-svg'),
  );
  // 홈과 같이 선택 상자는 지도 아래
  assert.ok(
    markup.indexOf('gyeonggi-map-svg') <
      markup.indexOf('gyeonggi-map-controls'),
  );
  // 지도 → (안전 안내 자리) → 오늘의 안내 순서
  assert.ok(
    markup.indexOf('gyeonggi-map-credit') < markup.indexOf('weather-briefing'),
  );
  assert.doesNotMatch(markup, /today-side|어디로 떠나볼까요/);
});

test('도시를 고르기 전에도 경기도 전체 기준 지도·오늘의 안내를 바로 보여 준다', () => {
  const markup = guide(null);
  assert.match(markup, /수원시 기준/);
  assert.match(markup, /weather-briefing/);
});

test('경기 둘러보기 지도는 원래대로 선택 상자가 지도 아래에 있다', () => {
  const explore = renderToStaticMarkup(
    createElement(GyeonggiMapPanel, {
      selectedCityId: null,
      onSelectCity: noop,
    }),
  );
  assert.match(explore, /gyeonggi-map-weather/);
  assert.ok(
    explore.indexOf('gyeonggi-map-svg') <
      explore.indexOf('gyeonggi-map-controls'),
  );
});
