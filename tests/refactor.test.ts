import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, transaction } from '../lib/adapters/sqlite';
import { jsonBody, readBody } from '../lib/adapters/http';
import { ApplicationError } from '../lib/domain/errors';
import { api, request } from '../lib/adapters/client-api';

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), 'tourpass-refactor-')),
  'test.sqlite',
);

test('트랜잭션은 성공 시 저장하고 실패 시 롤백하며 다음 쓰기를 허용한다', () => {
  const connection = db();
  const insert = () => connection.prepare('INSERT INTO limits VALUES (?, ?)');
  assert.equal(
    transaction(() => {
      insert().run('committed', 1);
      return 'saved';
    }),
    'saved',
  );
  assert.throws(
    () =>
      transaction(() => {
        insert().run('rolled-back', 1);
        throw new Error('write failed');
      }),
    /write failed/,
  );
  transaction(() => insert().run('after-rollback', 1));
  const keys = connection
    .prepare('SELECT key FROM limits ORDER BY key')
    .all()
    .map((row) => row.key);
  assert.deepEqual(keys, ['after-rollback', 'committed']);
  assert.ok(
    connection
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='photos'",
      )
      .get(),
  );
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
