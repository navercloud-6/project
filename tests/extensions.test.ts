import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { saveJourney, saveRecord } from '../lib/server';
import { applyEdit, getJourney, photoFor, savePhoto } from '../lib/server';
import { demoEdit, posterOutput } from '../lib/domain/assistant';
import { revisionOf } from '../lib/domain/journey';
import { guide, proposeEdit } from '../lib/server';
import { translate, voice, ocr } from '../lib/adapters/naver';
import { parseAI } from '../lib/adapters/ai-output';
import { safeImage } from '../lib/adapters/images';
import { setupTestSchema } from './helpers/pg';

let dbCtx: Awaited<ReturnType<typeof setupTestSchema>> | undefined;
before(async () => {
  dbCtx = await setupTestSchema('extensions');
});
after(async () => {
  await dbCtx?.teardown();
});
const trip = {
  name: '바다 여행',
  date: '2026-11-14',
  placeIds: ['PLACE_REAL_001', 'PLACE_REAL_003'],
};
test('검색은 출처를 반환하고 운영 정보는 모른다고 답한다', async () => {
  delete process.env.CLOVA_STUDIO_API_KEY;
  const result = await guide(
    '시흥오이도박물관 예약해야 하나요?',
    undefined,
    [],
  );
  assert.match(result.answer, /확인할 수 없습니다/);
  assert.ok(result.sources.some((s) => s.id === 'PLACE_REAL_003'));
  const missing = await guide('zzzzqqq', undefined, []);
  assert.equal(missing.sources.length, 0);
});
test('편집은 미리보기·적용을 분리하고 중복·소유권·오래된 변경을 차단한다', async () => {
  const current = await saveJourney('a', trip);
  const proposal = demoEdit(current, '2번째 빼기');
  assert.equal((await getJourney('a', current.id)).placeIds.length, 2);
  await assert.rejects(
    applyEdit('b', current.id, revisionOf(current), proposal),
  );
  const changed = await applyEdit(
    'a',
    current.id,
    revisionOf(current),
    proposal,
  );
  assert.equal(changed.placeIds.length, 1);
  await assert.rejects(
    applyEdit('a', current.id, revisionOf(current), proposal),
    /변경되었습니다/,
  );
  assert.throws(() => demoEdit(changed, '1번째 빼기'));
  assert.throws(() => demoEdit(current, '8번째 빼기'), /순서/);
});
test('방문 기록·사진은 장소 변경에서 보호되고 타인에게 노출되지 않는다', async () => {
  const current = await saveJourney('a', trip);
  await saveRecord('a', {
    journeyId: current.id,
    placeId: 'PLACE_REAL_001',
    rating: 5,
    note: '기록',
  });
  const revised = await getJourney('a', current.id);
  await assert.rejects(
    applyEdit('a', current.id, revisionOf(revised), {
      ...trip,
      placeIds: ['PLACE_REAL_003'],
    }),
    /방문 기록/,
  );
  const image = await sharp({
    create: { width: 20, height: 20, channels: 3, background: '#1258a5' },
  })
    .png()
    .toBuffer();
  await savePhoto('a', current.id, 'PLACE_REAL_003', image);
  await assert.rejects(photoFor('b', current.id, 'PLACE_REAL_003'));
  assert.ok((await photoFor('a', current.id, 'PLACE_REAL_003'))?.image.length);
  const withPhoto = await getJourney('a', current.id);
  await assert.rejects(
    applyEdit('a', current.id, revisionOf(withPhoto), {
      ...trip,
      placeIds: ['PLACE_REAL_001'],
    }),
    /사진/,
  );
});
test('이미지는 디코딩 검증·재인코딩하고 거짓 MIME과 큰 요청을 거절한다', async () => {
  const image = await sharp({
    create: { width: 20, height: 20, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  const normalized = await safeImage(
    new Request('http://local', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: new Uint8Array(image),
    }),
  );
  assert.equal((await sharp(normalized).metadata()).format, 'jpeg');
  await assert.rejects(
    safeImage(
      new Request('http://local', {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: '<script>alert(1)</script>',
      }),
    ),
    /읽을 수 없습니다/,
  );
  await assert.rejects(
    safeImage(
      new Request('http://local', {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: new Uint8Array(2 * 1024 * 1024 + 1),
      }),
    ),
    /2MB/,
  );
});
test('포스터 결과는 잘못된 날짜를 거절하고 미확인 날짜는 빈 값으로 유지한다', () => {
  assert.equal(
    posterOutput.safeParse({
      title: '행사',
      date: '2026-02-30',
      location: '공원',
    }).success,
    false,
  );
  assert.equal(
    parseAI(posterOutput, '{"title":"행사","date":"","location":"공원"}').date,
    '',
  );
});
test('Function Calling은 허용된 도구와 유효한 장소만 반환한다', async () => {
  const old = globalThis.fetch;
  process.env.CLOVA_STUDIO_API_KEY = 'test';
  const current = await saveJourney('a', trip);
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      assert.equal(body.tools[0].function.name, 'propose_itinerary');
      return Response.json({
        status: { code: '20000' },
        result: {
          message: {
            toolCalls: [
              {
                function: {
                  name: 'propose_itinerary',
                  arguments: { ...trip, explanation: '유지' },
                },
              },
            ],
          },
        },
      });
    };
    assert.equal(
      (await proposeEdit(current, '유지해 주세요', [])).mode,
      'clova',
    );
    globalThis.fetch = async () =>
      Response.json({
        status: { code: '20000' },
        result: {
          message: {
            toolCalls: [{ function: { name: 'delete_all', arguments: {} } }],
          },
        },
      });
    await assert.rejects(proposeEdit(current, '요청', []), /도구 호출/);
  } finally {
    globalThis.fetch = old;
    delete process.env.CLOVA_STUDIO_API_KEY;
  }
});
test('Papago·Voice·OCR의 인증·본문과 실제 응답 형식을 검증한다', async () => {
  const old = globalThis.fetch;
  Object.assign(process.env, {
    PAPAGO_CLIENT_ID: 'p',
    PAPAGO_CLIENT_SECRET: 's',
    NAVER_CLIENT_ID: 'v',
    NAVER_CLIENT_SECRET: 's',
    CLOVA_OCR_URL: 'https://test.apigw.ntruss.com/general',
    CLOVA_OCR_SECRET: 'ocr',
  });
  try {
    globalThis.fetch = async (url, init) => {
      const headers = init!.headers as Record<string, string>;
      if (String(url).includes('papago')) {
        assert.equal(headers['X-NCP-APIGW-API-KEY-ID'], 'p');
        assert.equal(JSON.parse(init!.body as string).target, 'en');
        return Response.json({
          message: { result: { translatedText: 'A day in Siheung' } },
        });
      }
      if (String(url).includes('tts-premium')) {
        assert.equal(headers['X-NCP-APIGW-API-KEY-ID'], 'v');
        assert.equal((init!.body as URLSearchParams).get('speaker'), 'nara');
        return new Response(new Uint8Array([1, 2]), {
          headers: { 'Content-Type': 'audio/mpeg' },
        });
      }
      assert.equal(headers['X-OCR-SECRET'], 'ocr');
      assert.equal(JSON.parse(init!.body as string).version, 'V2');
      return Response.json({
        images: [
          {
            inferResult: 'SUCCESS',
            fields: [{ inferText: '시흥 행사', lineBreak: true }],
          },
        ],
      });
    };
    assert.equal(await translate('시흥 여행', 'en'), 'A day in Siheung');
    assert.equal([...(await voice('시흥'))].join(','), '1,2');
    assert.match(await ocr(Buffer.from('image')), /시흥 행사/);
  } finally {
    globalThis.fetch = old;
    for (const key of [
      'PAPAGO_CLIENT_ID',
      'PAPAGO_CLIENT_SECRET',
      'NAVER_CLIENT_ID',
      'NAVER_CLIENT_SECRET',
      'CLOVA_OCR_URL',
      'CLOVA_OCR_SECRET',
    ])
      delete process.env[key];
  }
  await assert.rejects(translate('시흥', 'en'), /설정/);
  await assert.rejects(voice('시흥'), /설정/);
});

test('AI 어댑터는 안내·일기·포스터를 타입이 정해진 결과로 변환하고 잘못된 출력을 거절한다', async () => {
  const { naver } = await import('../lib/adapters/naver');
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.CLOVA_STUDIO_API_KEY;
  const oldModel = process.env.CLOVA_VISION_MODEL;
  process.env.CLOVA_STUDIO_API_KEY = 'test';
  process.env.CLOVA_VISION_MODEL = 'vision-test';
  let output: unknown;
  let inspect = (_url: unknown, _body: any) => {};
  try {
    globalThis.fetch = async (url, init) => {
      inspect(url, JSON.parse(init!.body as string));
      return Response.json({
        status: { code: '20000' },
        result: {
          message: { content: JSON.stringify(output) },
        },
      });
    };
    output = { answer: '근거 답변', sourceIds: ['source'] };
    assert.deepEqual(await naver.guide('관광 질문', [], []), output);
    output = { answer: '근거 답변', sourceIds: [] };
    await assert.rejects(naver.guide('관광 질문', [], []), /형식/);

    const image = new Uint8Array([1, 2, 3]);
    inspect = (url, body) => {
      assert.match(String(url), /\/vision-test$/);
      assert.equal(
        body.messages[1].content[0].text,
        '사용자가 선택한 장소: 공원',
      );
      assert.equal(body.messages[1].content[1].dataUri.data, 'AQID');
    };
    output = { draft: '풍경 일기' };
    assert.deepEqual(await naver.diary('공원', image), output);
    output = { draft: '가'.repeat(501) };
    await assert.rejects(naver.diary('공원', image), /형식/);

    inspect = (_url, body) =>
      assert.equal(body.messages[1].content, '포스터 원문');
    output = { title: '행사', date: '', location: '공원' };
    assert.deepEqual(await naver.poster('포스터 원문'), output);
    output = { title: '행사', date: '2026-02-30', location: '공원' };
    await assert.rejects(naver.poster('포스터 원문'), /형식/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.CLOVA_STUDIO_API_KEY;
    else process.env.CLOVA_STUDIO_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.CLOVA_VISION_MODEL;
    else process.env.CLOVA_VISION_MODEL = oldModel;
  }
});
