import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { consumeLimit, db, transaction } from '../lib/adapters/postgres';
import { failure, jsonBody, readBody } from '../lib/adapters/http';
import { ApplicationError } from '../lib/domain/errors';
import { api, request } from '../lib/adapters/client-api';
import { setupTestSchema } from './helpers/pg';

let dbCtx: Awaited<ReturnType<typeof setupTestSchema>> | undefined;
before(async () => {
  dbCtx = await setupTestSchema('refactor');
});
after(async () => {
  await dbCtx?.teardown();
});

test('트랜잭션은 성공 시 저장하고 실패 시 롤백하며 다음 쓰기를 허용한다', async () => {
  const pool = await db();
  assert.equal(
    await transaction(async (client) => {
      await client.query('INSERT INTO limits (key, count) VALUES ($1, $2)', [
        'committed',
        1,
      ]);
      return 'saved';
    }),
    'saved',
  );
  await assert.rejects(
    transaction(async (client) => {
      await client.query('INSERT INTO limits (key, count) VALUES ($1, $2)', [
        'rolled-back',
        1,
      ]);
      throw new Error('write failed');
    }),
    /write failed/,
  );
  await transaction(async (client) => {
    await client.query('INSERT INTO limits (key, count) VALUES ($1, $2)', [
      'after-rollback',
      1,
    ]);
  });
  const { rows } = await pool.query<{ key: string }>(
    'SELECT key FROM limits ORDER BY key',
  );
  assert.deepEqual(
    rows.map((row) => row.key),
    ['after-rollback', 'committed'],
  );
  const { rows: tables } = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name = 'photos'`,
  );
  assert.equal(tables.length, 1);
});

test('본문 제한은 청크를 합산한 바이트 크기를 검사하고 초과 시 스트림을 취소한다', async () => {
  const encoded = Buffer.from('가나다');
  const messages = { missing: 'missing', tooLarge: 'too large' };
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded.subarray(0, 4));
      controller.enqueue(encoded.subarray(4));
    },
    cancel() {
      cancelled = true;
    },
  });
  const streamedRequest = new Request('http://localhost', {
    method: 'POST',
    body: stream,
    duplex: 'half',
  } as RequestInit);
  await assert.rejects(
    readBody(streamedRequest, encoded.length - 1, messages),
    (error: unknown) =>
      error instanceof ApplicationError &&
      error.code === 'PAYLOAD_TOO_LARGE' &&
      error.message === 'too large',
  );
  assert.equal(cancelled, true);
  const exact = new Request('http://localhost', {
    method: 'POST',
    body: encoded,
  });
  assert.equal(
    (await readBody(exact, encoded.length, messages)).toString(),
    '가나다',
  );
  await assert.rejects(
    readBody(new Request('http://localhost'), 10, messages),
    (error: unknown) =>
      error instanceof ApplicationError && error.code === 'INVALID_INPUT',
  );
});

test('JSON 입력은 분할된 UTF-8을 읽고 잘못된 형식과 미디어 타입을 구분한다', async () => {
  const body = Buffer.from(JSON.stringify({ text: '시흥' }));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(body.subarray(0, 10));
      controller.enqueue(body.subarray(10));
      controller.close();
    },
  });
  const input = new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stream,
    duplex: 'half',
  } as RequestInit);
  assert.deepEqual(await jsonBody(input), { text: '시흥' });
  for (const [contentType, value, status] of [
    ['application/json', '{', 400],
    ['text/plain', '{}', 415],
  ] as const) {
    await assert.rejects(
      jsonBody(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: value,
        }),
      ),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code ===
          ({ 400: 'INVALID_INPUT', 415: 'UNSUPPORTED_MEDIA' } as const)[status],
    );
  }
});

test('브라우저 요청은 JSON·바이너리 응답과 서버·비 JSON 오류를 처리한다', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal(
        init?.headers && new Headers(init.headers).get('Content-Type'),
        'application/json',
      );
      assert.equal(init?.body, 'false');
      return Response.json({ ok: true });
    };
    assert.deepEqual(await api('/api/test', 'POST', false), { ok: true });
    globalThis.fetch = async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'audio/mpeg' },
      });
    const audio = await request('/api/assistant');
    assert.deepEqual([...new Uint8Array(await audio.arrayBuffer())], [1, 2, 3]);
    globalThis.fetch = async () =>
      Response.json({ error: '세션 만료' }, { status: 401 });
    await assert.rejects(api('/api/journeys'), /세션 만료/);
    globalThis.fetch = async () =>
      new Response('<html>bad gateway</html>', { status: 502 });
    await assert.rejects(api('/api/journeys'), /요청을 처리하지 못했습니다/);
  } finally {
    globalThis.fetch = original;
  }
});

test('요청 한도 버킷은 시간당 한도를 지키면서 지난 시간 버킷 행을 정리한다', async () => {
  const pool = await db();
  await pool.query('INSERT INTO limits (key, count) VALUES ($1, $2)', [
    'stale:owner:100',
    5,
  ]);
  assert.equal(await consumeLimit('prune:owner', 2), true);
  assert.equal(await consumeLimit('prune:owner', 2), true);
  assert.equal(await consumeLimit('prune:owner', 2), false);
  const { rows } = await pool.query<{ key: string }>(
    "SELECT key FROM limits WHERE key LIKE 'stale:%' OR key LIKE 'prune:%'",
  );
  assert.equal(
    rows.some((r) => r.key === 'stale:owner:100'),
    false,
    '지난 시간 버킷은 정리된다',
  );
  assert.equal(
    rows.some((r) => r.key.startsWith('prune:owner:')),
    true,
    '현재 시간 버킷은 유지된다',
  );
});

test('다른 번들 청크에서 던져진 ApplicationError와 ZodError도 올바른 HTTP 상태로 변환한다', async () => {
  const brand = Symbol.for('tourpass.ApplicationError');
  class ForeignApplicationError extends Error {
    readonly [brand] = true;
    constructor(
      public code: 'SESSION_REQUIRED',
      message: string,
    ) {
      super(message);
      this.name = 'ApplicationError';
    }
  }
  const foreignAppError = new ForeignApplicationError(
    'SESSION_REQUIRED',
    '세션이 만료되었습니다.',
  );
  assert.equal(foreignAppError instanceof ApplicationError, true);
  const appRes = failure(foreignAppError);
  assert.equal(appRes.status, 401);
  assert.deepEqual(await appRes.json(), { error: '세션이 만료되었습니다.' });

  class ForeignZodError extends Error {
    issues = [{ message: 'invalid' }];
    constructor() {
      super('invalid');
      this.name = 'ZodError';
    }
  }
  const zodRes = failure(new ForeignZodError());
  assert.equal(zodRes.status, 400);
});
