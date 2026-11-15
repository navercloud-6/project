import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlaceMap } from '../components/place-map';
import { places } from '../lib/domain/catalog';

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
