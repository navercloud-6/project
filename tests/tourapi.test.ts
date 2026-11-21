import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  cityForRecord,
  plainText,
  reusablePhoto,
  selectRecords,
  toPlace,
} from '../scripts/import-tourapi';
import { PlaceMap } from '../components/place-map';
import { places } from '../lib/domain/catalog';
import { projectRoute } from '../lib/domain/coordinates';
import { pickRecommendedPlaces } from '../lib/domain/weather';
import { journeyInput, recommendationOutput } from '../lib/domain/contracts';
import { createRecommendation } from '../lib/application/recommendation';
import type { AIPort } from '../lib/application/ports';

const record = {
  contentid: '123456',
  contenttypeid: '12',
  lDongRegnCd: '41',
  lDongSignguCd: '111',
  title: '수원 화성',
  addr1: '경기도 수원시 팔달구 정조로 825',
  addr2: '',
  mapx: '127.01',
  mapy: '37.28',
  modifiedtime: '20261120123456',
  overview: '성곽 &amp; 공원<br>산책',
  cpyrhtDivCd: 'Type1',
  firstimage: 'https://tong.visitkorea.or.kr/cms/resource/1/photo.jpg',
};

test('TourAPI 수집은 법정동 코드·주소·좌표를 대조하고 일반구와 중복을 처리한다', () => {
  assert.equal(cityForRecord(record)?.id, '41110');
  assert.equal(
    cityForRecord({
      ...record,
      lDongSignguCd: '592',
      addr1: '경기도 화성시 만세구',
    })?.id,
    '41590',
  );
  for (const bad of [
    { ...record, lDongRegnCd: '11' },
    { ...record, lDongSignguCd: '130' },
    { ...record, addr1: '서울특별시 종로구' },
    { ...record, mapx: '0' },
    { ...record, mapy: '' },
  ])
    assert.equal(selectRecords([bad], '41110').length, 0);
  assert.equal(
    selectRecords(
      [record, record, { ...record, contentid: '999', title: '수원화성' }],
      '41110',
    ).length,
    1,
  );
  const place = toPlace(record, '2026-11-20');
  assert.equal(place.id, 'PLACE_TOURAPI_123456');
  assert.deepEqual(place.coordinates, { lat: 37.28, lng: 127.01 });
  assert.equal(place.description, '성곽 & 공원 산책');
  assert.equal(place.sources[0].content_date, '2026-11-20');
  assert.equal(place.reviewStatus, 'DRAFT');
});

test('TourAPI 사진은 허용 호스트의 공공누리 제1유형만 표시한다', () => {
  assert.equal(reusablePhoto(record), record.firstimage);
  for (const bad of [
    { ...record, cpyrhtDivCd: 'Type3' },
    { ...record, cpyrhtDivCd: '' },
    { ...record, firstimage: 'https://example.com/cms/a.jpg' },
    { ...record, firstimage: record.firstimage + '?serviceKey=secret' },
    { ...record, firstimage: 'javascript:alert(1)' },
  ]) {
    assert.equal(reusablePhoto(bad), null);
    assert.equal(toPlace(bad, '2026-11-20').image, null);
  }
  assert.equal(
    plainText('<script>alert(1)</script><b>명소</b>&nbsp;&#38; 공원'),
    '명소 & 공원',
  );
  for (const place of places.filter((place) =>
    place.id.startsWith('PLACE_TOURAPI_'),
  )) {
    assert.ok(
      place.sources[0].code.endsWith(place.id.replace('PLACE_TOURAPI_', '')),
    );
    if (place.image) {
      assert.equal(new URL(place.image.path).hostname, 'tong.visitkorea.or.kr');
      assert.equal(place.image.license, '공공누리 제1유형');
    }
  }
});

test('신규 관광지는 여행 입력으로 저장할 수 있고 혼합 도시 코스는 경기도 좌표로 표시한다', () => {
  const newPlace = places.find((place) => place.cityId === '41110')!;
  const ids = [places[0].id, newPlace.id];
  assert.ok(
    journeyInput.safeParse({
      name: '경기 여행',
      date: '2026-11-20',
      placeIds: ids,
    }).success,
  );
  const markup = renderToStaticMarkup(
    createElement(PlaceMap, {
      places,
      visiblePlaces: [],
      routeIds: ids,
      compact: true,
      onDetail() {},
    }),
  );
  assert.match(markup, /경기도 관광지 위치도/);
  assert.doesNotMatch(markup, /시화호/);
  const point = projectRoute(
    newPlace.coordinates.lat,
    newPlace.coordinates.lng,
  );
  assert.ok(markup.includes(`translate(${point.x}, ${point.y})`));
  assert.notDeepEqual(
    point,
    projectRoute(places[0].coordinates.lat, places[0].coordinates.lng),
  );
  const allRecommended = pickRecommendedPlaces('전체', 'outdoor');
  assert.equal(allRecommended.length, 3);
  assert.equal(
    new Set(
      allRecommended.map(
        (id) => places.find((place) => place.id === id)?.cityId,
      ),
    ).size,
    3,
  );
  for (const id of pickRecommendedPlaces('수원시', 'outdoor'))
    assert.equal(places.find((place) => place.id === id)?.cityId, '41110');
  for (const id of pickRecommendedPlaces('시흥시', 'outdoor'))
    assert.equal(places.find((place) => place.id === id)?.cityId, '41390');
});

test('대규모 카탈로그의 AI 후보는 40곳 이내이며 전달하지 않은 ID를 거절한다', async () => {
  let returnOutsideCandidate = false;
  const ai = {
    capabilities: () => ({
      clova: true,
      voice: false,
      translate: false,
      ocr: false,
    }),
    async recommend(_prompt, candidates) {
      assert.ok(candidates.length <= 40);
      assert.ok(
        candidates.some(
          (place) =>
            places.find((item) => item.id === place.id)?.cityId === '41820',
        ),
      );
      const place = returnOutsideCandidate
        ? places.find(
            (place) =>
              !candidates.some((candidate) => candidate.id === place.id),
          )!
        : candidates[0];
      return {
        title: '여행',
        summary: '추천',
        stops: [{ placeId: place.id, reason: '자연' }],
      };
    },
  } satisfies Pick<AIPort, 'capabilities' | 'recommend'>;
  const recommend = createRecommendation(ai);
  const result = await recommend('자라섬 여행', '전체', []);
  assert.ok(recommendationOutput.safeParse(result).success);
  returnOutsideCandidate = true;
  await assert.rejects(
    createRecommendation(ai)('자라섬 여행', '전체', []),
    /유효한/,
  );
});
