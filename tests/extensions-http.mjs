import assert from 'node:assert/strict';
import sharp from 'sharp';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3101';
async function request(path, method = 'GET', body, cookie) {
  return fetch(base + path, {
    method,
    headers: {
      origin: base,
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function makeSession() {
  return (await request('/api/session', 'POST')).headers
    .get('set-cookie')
    .split(';')[0];
}
const cookie = await makeSession(),
  other = await makeSession();
const input = {
  name: '확장 HTTP 검증',
  date: '2026-11-14',
  placeIds: ['PLACE_REAL_001', 'PLACE_REAL_003'],
};
const { journey } = await (
  await request('/api/journeys', 'POST', input, cookie)
).json();
const guide = await request(
  '/api/assistant',
  'POST',
  { action: 'guide', question: '시흥오이도박물관 예약', history: [] },
  cookie,
);
assert.equal(guide.status, 200);
assert.match((await guide.json()).answer, /확인할 수 없습니다/);
const edit = await request(
  '/api/assistant',
  'POST',
  { action: 'edit', journeyId: journey.id, prompt: '2번째 빼기', history: [] },
  cookie,
);
assert.equal(edit.status, 200);
const preview = await edit.json();
assert.equal(
  (
    await request(
      '/api/assistant',
      'POST',
      { action: 'apply', journeyId: journey.id, ...preview },
      other,
    )
  ).status,
  404,
);
assert.equal(
  (
    await request(
      '/api/assistant',
      'POST',
      { action: 'apply', journeyId: journey.id, ...preview },
      cookie,
    )
  ).status,
  200,
);
assert.equal(
  (
    await request(
      '/api/assistant',
      'POST',
      { action: 'apply', journeyId: journey.id, ...preview },
      cookie,
    )
  ).status,
  409,
);
const image = await sharp({
  create: { width: 20, height: 20, channels: 3, background: 'blue' },
})
  .png()
  .toBuffer();
const path = `/api/photos?journey=${journey.id}&place=PLACE_REAL_001`;
const upload = await fetch(base + path, {
  method: 'POST',
  headers: { origin: base, cookie, 'Content-Type': 'image/png' },
  body: image,
});
assert.equal(upload.status, 200);
const photo = await request(path, 'GET', undefined, cookie);
assert.equal(photo.status, 200);
assert.equal(photo.headers.get('Content-Type'), 'image/jpeg');
assert.equal((await request(path, 'GET', undefined, other)).status, 404);
const updated = (await upload.json()).journey;
assert.equal(
  (
    await request(
      '/api/assistant',
      'POST',
      {
        action: 'apply',
        journeyId: journey.id,
        revision: updated.revision,
        proposal: {
          ...input,
          placeIds: ['PLACE_REAL_003'],
          explanation: 'remove photo',
        },
      },
      cookie,
    )
  ).status,
  409,
);
for (const body of [
  { action: 'voice', placeId: 'PLACE_REAL_001' },
  { action: 'translate', placeId: 'PLACE_REAL_001', target: 'en' },
  { action: 'diary', journeyId: journey.id, placeId: 'PLACE_REAL_001' },
])
  assert.equal(
    (await request('/api/assistant', 'POST', body, cookie)).status,
    503,
  );
const event = await request(
  '/api/journeys',
  'POST',
  { ...input, event: { origin: 'poster', location: '갯골생태공원 시연 행사' } },
  cookie,
);
assert.equal(event.status, 201);
assert.equal((await event.json()).journey.event.origin, 'poster');
console.log(
  'Extension HTTP smoke passed: guide, preview/apply, conflict, ownership, image upload/read, record protection, missing keys, event persistence.',
);
