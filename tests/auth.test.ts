import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { createAuth } from '../lib/application/auth';
import { createSession } from '../lib/application/session';
import {
  authRepository,
  db,
  journeyRepository,
  sessionRepository,
} from '../lib/adapters/postgres';
import { identity } from '../lib/adapters/identity';
import { naverLogin } from '../lib/adapters/naver-login';
import { setupTestSchema } from './helpers/pg';

const legacyToken = identity.token();
let dbCtx: Awaited<ReturnType<typeof setupTestSchema>> | undefined;

before(async () => {
  dbCtx = await setupTestSchema('auth');
  // Start with an existing sessions table to verify old anonymous cookies remain valid.
  const legacy = new Pool({ connectionString: dbCtx.url });
  try {
    await legacy.query(
      'CREATE TABLE sessions (token TEXT PRIMARY KEY, expires BIGINT NOT NULL)',
    );
    await legacy.query(
      'INSERT INTO sessions (token, expires) VALUES ($1, $2)',
      [identity.digest(legacyToken), Date.now() + 60000],
    );
  } finally {
    await legacy.end();
  }
});

after(async () => {
  await dbCtx?.teardown();
});

const resolve = createSession(sessionRepository, identity);
let calls = 0;
const auth = createAuth(authRepository, sessionRepository, identity, {
  enabled: () => true,
  authorize: (state) => 'https://nid.naver.com/?state=' + state,
  identify: async (code) => {
    calls++;
    return code;
  },
});

test('기존 DB·쿠키를 유지하고 로그인 후 익명 여행·기록·사진을 계정으로 함께 이전한다', async () => {
  assert.equal(
    (await resolve(legacyToken)).owner,
    identity.digest(legacyToken),
  );
  const guest = await resolve(undefined, true);
  await journeyRepository.insert(guest.owner, {
    id: 'trip',
    name: '여행',
    date: '2026-11-17',
    createdAt: '',
    placeIds: ['a'],
    records: { a: { rating: 5, note: 'private' } },
  });
  await journeyRepository.putPhoto(guest.owner, 'trip', 'a', {
    id: 'photo',
    image: new Uint8Array([1, 2]),
  });
  const login = await auth.begin(guest.token);
  const token = await auth.complete(
    login.token,
    login.state,
    login.state,
    'account-a',
    false,
  );
  const account = (await resolve(token)).owner;
  assert.equal(account, 'naver:' + identity.digest('account-a'));
  await assert.rejects(resolve(guest.token), /세션/);
  assert.equal((await journeyRepository.list(guest.owner)).length, 0);
  assert.equal(
    (await journeyRepository.list(account))[0].records.a.note,
    'private',
  );
  assert.equal(
    (await journeyRepository.photo(account, 'trip', 'a'))?.image.length,
    2,
  );
  assert.deepEqual(await auth.status(token), {
    enabled: true,
    authenticated: true,
  });
  await assert.rejects(
    auth.complete(login.token, login.state, login.state, 'account-a', false),
    /로그인 요청/,
  );
  const anonymous = await auth.logout(token);
  await assert.rejects(resolve(token), /세션/);
  assert.equal(
    (await journeyRepository.list((await resolve(anonymous)).owner)).length,
    0,
  );
  const otherDevice = await auth.begin(undefined);
  const second = await auth.complete(
    otherDevice.token,
    otherDevice.state,
    otherDevice.state,
    'account-a',
    false,
  );
  assert.equal(
    (await journeyRepository.list((await resolve(second)).owner)).length,
    1,
  );
  const switchAccount = await auth.begin(second);
  const switched = await auth.complete(
    switchAccount.token,
    switchAccount.state,
    switchAccount.state,
    'account-b',
    false,
  );
  assert.equal(
    (await journeyRepository.list((await resolve(switched)).owner)).length,
    0,
  );
  assert.equal((await journeyRepository.list(account)).length, 1);
});

test('state 불일치·다른 세션·만료·재사용·취소·로그아웃 후 콜백을 거절한다', async () => {
  const before = calls;
  const login = await auth.begin(undefined);
  await assert.rejects(
    auth.complete(login.token, identity.token(), login.state, 'a', false),
    /로그인 요청/,
  );
  await assert.rejects(
    auth.complete(
      (await resolve(undefined, true)).token,
      login.state,
      login.state,
      'a',
      false,
    ),
    /로그인 요청/,
  );
  await (await db()).query('UPDATE oauth_states SET expires = 0');
  await assert.rejects(
    auth.complete(login.token, login.state, login.state, 'a', false),
    /로그인 요청/,
  );
  const cancelled = await auth.begin(undefined);
  await assert.rejects(
    auth.complete(
      cancelled.token,
      cancelled.state,
      cancelled.state,
      null,
      true,
    ),
    /취소/,
  );
  await assert.rejects(
    auth.complete(
      cancelled.token,
      cancelled.state,
      cancelled.state,
      'a',
      false,
    ),
    /로그인 요청/,
  );
  const loggedOut = await auth.begin(undefined);
  await auth.logout(loggedOut.token);
  await assert.rejects(
    auth.complete(
      loggedOut.token,
      loggedOut.state,
      loggedOut.state,
      'a',
      false,
    ),
    /로그인 요청/,
  );
  const expiredSession = await auth.begin(undefined);
  await (
    await db()
  ).query('UPDATE sessions SET expires = 0 WHERE token = $1', [
    identity.digest(expiredSession.token),
  ]);
  await assert.rejects(
    auth.complete(
      expiredSession.token,
      expiredSession.state,
      expiredSession.state,
      'a',
      false,
    ),
    /세션/,
  );
  assert.equal(calls, before);
});

test('네이버 OAuth 계약과 거부·잘못된 응답·미설정을 검증하고 Voice 키를 사용하지 않는다', async () => {
  const previous = { ...process.env };
  const fetch = globalThis.fetch;
  try {
    delete process.env.NAVER_LOGIN_CLIENT_ID;
    delete process.env.NAVER_LOGIN_CLIENT_SECRET;
    process.env.NAVER_CLIENT_ID = 'voice';
    assert.equal(naverLogin.enabled(), false);
    assert.throws(() => naverLogin.authorize('state'), /설정/);
    process.env.NAVER_LOGIN_CLIENT_ID = 'login-id';
    process.env.NAVER_LOGIN_CLIENT_SECRET = 'login-secret';
    process.env.APP_ORIGIN = 'http://localhost:3000';
    const url = new URL(naverLogin.authorize('state'));
    assert.equal(
      url.searchParams.get('redirect_uri'),
      'http://localhost:3000/api/auth/naver/callback',
    );
    let requests = 0;
    globalThis.fetch = async (url, init) => {
      requests++;
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.cache, 'no-store');
      assert.ok(init?.signal);
      if (requests === 1) {
        assert.equal(String(url), 'https://nid.naver.com/oauth2.0/token');
        assert.equal(init?.method, 'POST');
        const body = new URLSearchParams(init?.body as URLSearchParams);
        assert.equal(body.get('client_id'), 'login-id');
        assert.equal(body.get('client_secret'), 'login-secret');
        assert.equal(body.get('state'), 'state');
        assert.equal(body.get('code'), 'code');
        return Response.json({ access_token: 'access', token_type: 'bearer' });
      }
      assert.equal(String(url), 'https://openapi.naver.com/v1/nid/me');
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        'Bearer access',
      );
      return Response.json({
        resultcode: '00',
        response: { id: 'only-id', email: 'ignored' },
      });
    };
    assert.equal(await naverLogin.identify('code', 'state'), 'only-id');
    globalThis.fetch = async () => Response.json({ error: 'invalid_grant' });
    await assert.rejects(naverLogin.identify('code', 'state'), /인증/);
    globalThis.fetch = async () => new Response('', { status: 401 });
    await assert.rejects(naverLogin.identify('code', 'state'), /연결/);
    globalThis.fetch = async () =>
      Response.json({ access_token: 'access', token_type: 'bearer' });
    await assert.rejects(naverLogin.identify('code', 'state'), /계정/);
    globalThis.fetch = async () => {
      throw Error('network');
    };
    await assert.rejects(naverLogin.identify('code', 'state'), /연결/);
  } finally {
    globalThis.fetch = fetch;
    for (const key of [
      'NAVER_LOGIN_CLIENT_ID',
      'NAVER_LOGIN_CLIENT_SECRET',
      'NAVER_CLIENT_ID',
      'APP_ORIGIN',
    ]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
