// Run against an isolated server with NAVER_LOGIN_CLIENT_ID/SECRET set to dummy values.
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3100';
async function call(path, method = 'GET', cookie, origin = base) {
  return fetch(base + path, {
    method,
    redirect: 'manual',
    headers: { origin, ...(cookie ? { cookie } : {}) },
  });
}
const cookie = (response, name) =>
  response.headers
    .getSetCookie()
    .find((value) => value.startsWith(name + '='))
    ?.split(';')[0];
const status = await call('/api/session');
assert.deepEqual(await status.json(), { enabled: true, authenticated: false });
assert.equal(status.headers.get('cache-control'), 'no-store');
assert.equal((await call('/api/auth/naver', 'GET')).status, 405);
assert.equal(
  (await call('/api/auth/naver', 'POST', undefined, 'https://foreign.invalid'))
    .status,
  403,
);
const begin = await call('/api/auth/naver', 'POST');
assert.equal(begin.status, 303);
assert.equal(begin.headers.get('cache-control'), 'no-store');
const url = new URL(begin.headers.get('location'));
assert.equal(url.origin, 'https://nid.naver.com');
assert.equal(
  url.searchParams.get('redirect_uri'),
  base + '/api/auth/naver/callback',
);
const state = url.searchParams.get('state');
assert.match(state, /^[a-f0-9]{64}$/);
const session = cookie(begin, 'tourpass-session');
const oauth = cookie(begin, 'tourpass-oauth-state');
assert.ok(session && oauth);
for (const value of begin.headers.getSetCookie()) {
  assert.match(value, /HttpOnly/i);
  assert.match(value, /SameSite=Lax/i);
}
const invalid = await call(
  '/api/auth/naver/callback?state=invalid&code=unused',
  'GET',
  session + '; ' + oauth,
);
assert.equal(invalid.status, 303);
assert.equal(invalid.headers.get('location'), base + '/?login=failed');
assert.match(
  cookie(invalid, 'tourpass-oauth-state'),
  /^tourpass-oauth-state=$/,
);
const denied = await call(
  '/api/auth/naver/callback?' +
    new URLSearchParams({ state, error: 'access_denied' }),
  'GET',
  session + '; ' + oauth,
);
assert.equal(denied.headers.get('location'), base + '/?login=cancelled');
assert.equal(denied.headers.get('referrer-policy'), 'no-referrer');
const replay = await call(
  '/api/auth/naver/callback?' + new URLSearchParams({ state, code: 'unused' }),
  'GET',
  session + '; ' + oauth,
);
assert.equal(replay.headers.get('location'), base + '/?login=failed');
assert.equal(
  (await call('/api/auth/logout', 'POST', session, 'https://foreign.invalid'))
    .status,
  403,
);
assert.equal((await call('/api/journeys', 'GET', session)).status, 200);
const logout = await call('/api/auth/logout', 'POST', session);
assert.equal(logout.status, 200);
assert.notEqual(cookie(logout, 'tourpass-session'), session);
assert.equal((await call('/api/journeys', 'GET', session)).status, 401);
assert.equal(
  (await call('/api/journeys', 'GET', cookie(logout, 'tourpass-session')))
    .status,
  200,
);
console.log(
  'Auth HTTP passed: redirect, state cookies, cancellation, replay, CSRF, logout invalidation.',
);
