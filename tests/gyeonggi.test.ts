import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GyeonggiCityExplorer } from '../components/gyeonggi-city-explorer';
import { gyeonggiCities, gyeonggiMap } from '../lib/domain/gyeonggi';
import { places } from '../lib/domain/catalog';
import { ImageConfigContext } from 'next/dist/shared/lib/image-config-context.shared-runtime';
import { imageConfigDefault } from 'next/dist/shared/lib/image-config';

test('행정구를 병합한 경기도 경계 31개와 관광지의 시·군 식별자가 대응한다', () => {
  const cityIds = new Set(gyeonggiCities.map((city) => city.id));
  assert.equal(cityIds.size, 31);
  assert.equal(
    gyeonggiCities.filter((city) => city.name.endsWith('군')).length,
    3,
  );
  assert.equal(gyeonggiMap.source.date, '2026-10-01');
  assert.equal(gyeonggiMap.source.license, 'CC BY 4.0');
  for (const city of gyeonggiCities) {
    assert.match(city.id, /^41\d{3}$/);
    assert.match(city.path, /^M[\d.,LZM-]+Z$/);
    const coordinates = city.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    assert.ok(coordinates.length >= 8 && coordinates.length % 2 === 0);
    for (let index = 0; index < coordinates.length; index += 2) {
      assert.ok(coordinates[index] >= 0 && coordinates[index] <= 800);
      assert.ok(coordinates[index + 1] >= 0 && coordinates[index + 1] <= 720);
    }
    assert.ok(city.label[0] >= 0 && city.label[0] <= 800);
    assert.ok(city.label[1] >= 0 && city.label[1] <= 720);
  }
  assert.ok(places.every((place) => cityIds.has(place.cityId)));
});

test('도시 관광지 패널은 시흥 자료를 다른 도시에 표시하지 않고 기존 담기 상태를 반영한다', () => {
  const render = (selectedCityId: string | null, catalog = places) => {
    const markup = renderToStaticMarkup(
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
        createElement(GyeonggiCityExplorer, {
          places: catalog,
          selectedCityId,
          selection: [places[0].id],
          onSelectCity() {},
          onDetail() {},
          onToggle() {},
        }),
      ),
    );
    return markup.match(/<aside\b[\s\S]*?<\/aside>/)![0];
  };
  const siheung = render('41390');
  assert.equal([...siheung.matchAll(/<li>/g)].length, 20);
  assert.ok(siheung.includes(places[0].name));
  assert.ok(siheung.includes(`${places[0].name} 담기 취소`));
  for (const city of gyeonggiCities) {
    const panel = render(city.id);
    const expected = places.filter((place) => place.cityId === city.id);
    assert.ok(expected.length > 0 && expected.length <= 20);
    assert.equal([...panel.matchAll(/<li>/g)].length, expected.length);
    for (const place of expected)
      assert.ok(
        panel.includes(
          place.name
            .replaceAll('&', '&amp;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#x27;'),
        ),
      );
    if (city.id !== '41390') assert.ok(!panel.includes(places[0].name));
  }
  for (const selectedCityId of [null, '41110']) {
    const panel = render(selectedCityId, []);
    assert.ok(!panel.includes(places[0].name));
    assert.equal([...panel.matchAll(/<li>/g)].length, 0);
    assert.match(
      panel,
      selectedCityId ? /관광 정보 준비 중/ : /어디로 떠나볼까요/,
    );
  }
});
