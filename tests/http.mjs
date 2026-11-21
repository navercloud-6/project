// Run against an isolated test server, never a production database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3100';
async function call(path, method = 'GET', body, cookie, origin = base) {
  return fetch(base + path, {
    method,
    headers: {
      origin,
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
const noSession = await call('/api/journeys');
assert.equal(noSession.status, 401);
const create = await call('/api/session', 'POST');
assert.equal(create.status, 200);
const cookie = create.headers.get('set-cookie').split(';')[0];
assert.match(create.headers.get('set-cookie'), /HttpOnly/i);
assert.equal(
  (
    await call(
      '/api/session',
      'POST',
      undefined,
      undefined,
      'https://foreign.invalid',
    )
  ).status,
  403,
);
assert.equal(
  (await call('/api/journeys', 'POST', { name: 'bad' }, cookie)).status,
  400,
);
const input = {
  name: 'HTTP 검증 여행',
  date: '2026-11-14',
  placeIds: ['PLACE_REAL_001'],
};
const saved = await call('/api/journeys', 'POST', input, cookie);
assert.equal(saved.status, 201);
const { journey } = await saved.json();
const other = await call('/api/session', 'POST');
const otherCookie = other.headers.get('set-cookie').split(';')[0];
assert.equal(
  (await (await call('/api/journeys', 'GET', undefined, otherCookie)).json())
    .journeys.length,
  0,
);
const visit = {
  journeyId: journey.id,
  placeId: 'PLACE_REAL_001',
  rating: 4,
  note: 'HTTP 기록 확인',
};
assert.equal(
  (await call('/api/journeys', 'PATCH', visit, otherCookie)).status,
  404,
);
assert.equal((await call('/api/journeys', 'PATCH', visit, cookie)).status, 200);
const list = await (
  await call('/api/journeys', 'GET', undefined, cookie)
).json();
assert.equal(list.journeys[0].records.PLACE_REAL_001.note, visit.note);
const response = await call(
  '/api/recommend',
  'POST',
  { prompt: '자연 산책', region: '장곡·갯골' },
  cookie,
);
assert.equal(response.status, 200);
const rec = await response.json();
assert.ok(rec.stops.length > 0);
assert.equal(rec.mode, 'demo');
assert.equal(
  (await call('/api/recommend', 'POST', { prompt: 'x'.repeat(10000) }, cookie))
    .status,
  413,
);
const openapiRes = await call('/api/openapi');
assert.equal(openapiRes.status, 200);
const openapi = await openapiRes.json();
assert.equal(openapi.openapi, '3.1.0');
assert.ok(openapi.paths['/api/journeys']);
assert.ok(openapi.paths['/api/weather']);
const weatherRes = await call(
  '/api/weather?region=' + encodeURIComponent('수원시'),
);
assert.equal(weatherRes.status, 200);
const weather = await weatherRes.json();
assert.equal(weather.region, '수원시');
assert.ok(weather.daily.length >= 1);
assert.equal((await call('/api/weather?region=invalid-region')).status, 400);
for (const docPath of ['/api/docs', '/scalar']) {
  const docRes = await call(docPath);
  assert.equal(docRes.status, 200);
  assert.match(docRes.headers.get('content-type') || '', /text\/html/i);
  assert.match(await docRes.text(), /\/api\/openapi/);
}
const catalog = JSON.parse(
  readFileSync(new URL('../data/places.json', import.meta.url), 'utf8'),
);
const newCityPlace = catalog.find((place) => place.cityId === '41110');
assert.ok(newCityPlace, '수원 관광지가 등록되어 있어야 한다');
const newCitySave = await call(
  '/api/journeys',
  'POST',
  {
    name: '새 도시 관광지',
    date: '2026-11-20',
    placeIds: [newCityPlace.id],
  },
  cookie,
);
assert.equal(newCitySave.status, 201);
const newCityJourney = (await newCitySave.json()).journey;
const newCityList = (
  await (await call('/api/journeys', 'GET', undefined, cookie)).json()
).journeys;
assert.deepEqual(
  newCityList.find((item) => item.id === newCityJourney.id).placeIds,
  [newCityPlace.id],
);
console.log(
  'HTTP smoke passed: sessions, CSRF, validation, persistence, ownership, recommendation, body limit, weather, OpenAPI & Scalar.',
);
