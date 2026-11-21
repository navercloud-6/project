import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alertsSpeech,
  buildAlerts,
  quakesToReport,
  shortCityName,
  warningAdvice,
  warningsFor,
  type QuakeReport,
} from '../lib/domain/alerts';
import { withSafety } from '../lib/domain/briefing';
import { createAlerts } from '../lib/application/alerts';
import { kstTime } from '../lib/adapters/kma-alerts';
import type { AlertPort } from '../lib/application/ports';

// 2026-11-21 12:00 기상청 특보 발효 현황(t6) 실제 문단 일부
const STATUS = [
  'o 강풍주의보 : 울릉도.독도',
  'o 대설주의보 : 제주도(제주도산지)',
  'o 건조주의보 : 경기도(가평), 강원도(태백, 화천), 서울(서울동북권, 서울서남권)',
  'o 한파경보 : 경기도(연천, 포천, 가평, 양주), 강원도(철원)',
].join('\r\n');

test('특보 현황에서 선택 시·군에 걸린 주의보·경보만 찾는다', () => {
  assert.equal(shortCityName('가평군'), '가평');
  assert.deepEqual(
    warningsFor(STATUS, '가평군').map((w) => w.name),
    ['건조주의보', '한파경보'],
  );
  assert.deepEqual(
    warningsFor(STATUS, '양주시').map((w) => w.name),
    ['한파경보'],
  );
  assert.deepEqual(
    warningsFor(STATUS, '남양주시'),
    [],
    '양주와 남양주를 구분한다',
  );
  assert.deepEqual(warningsFor(STATUS, '수원시'), []);
  assert.deepEqual(
    warningsFor(STATUS, '전체').map((w) => w.name),
    ['건조주의보', '한파경보'],
    '경기도 전체를 고르면 경기도에 걸린 특보를 모두 보여 준다',
  );
  assert.deepEqual(
    warningsFor('o 폭염주의보 : 경기도, 서울', '수원시').map((w) => w.areas),
    [['경기도 전체']],
  );
  assert.deepEqual(warningsFor('o 없음', '가평군'), []);
});

const hour = 60 * 60 * 1000;
const now = Date.parse('2026-11-21T03:00:00Z');
const quake = (patch: Partial<QuakeReport>): QuakeReport => ({
  time: now - hour,
  location: '경북 경주시 남남서쪽 10km 지역',
  magnitude: 3.2,
  intensity: '',
  domestic: true,
  ...patch,
});

test('지진은 국내 규모 3.0 이상·경기도 발생, 해외는 경기도에서 느낀 경우만 안내한다', () => {
  const picked = quakesToReport(
    [
      quake({}),
      quake({ magnitude: 2.9 }),
      quake({ magnitude: 2.1, location: '경기 연천군 북쪽 5km 지역' }),
      quake({ time: now - 25 * hour }),
      quake({
        domestic: false,
        location: '페루 남동쪽 37km 지역',
        magnitude: 6.7,
      }),
      quake({
        domestic: false,
        location: '일본 구마모토현 해역',
        magnitude: 5.7,
        intensity: '최대진도 Ⅱ(전남광주)',
      }),
      quake({
        domestic: false,
        location: '일본 혼슈 서쪽 해역',
        magnitude: 6.0,
        intensity: '최대진도 Ⅱ(경기)',
      }),
    ],
    now,
  );
  assert.deepEqual(
    picked.map((q) => q.location),
    [
      '경북 경주시 남남서쪽 10km 지역',
      '경기 연천군 북쪽 5km 지역',
      '일본 혼슈 서쪽 해역',
    ],
  );
});

test('안전 안내 문장은 자료 그대로 만들고 원고 첫 인사 뒤에 넣는다', () => {
  const alerts = buildAlerts(
    '가평군',
    [{ name: '건조주의보', areas: ['가평'] }],
    [{ name: '한파주의보', areas: ['가평'] }],
    [quake({ intensity: '' })],
  );
  assert.deepEqual(
    alerts.map((a) => a.kind),
    ['warning', 'preliminary', 'earthquake'],
  );
  assert.equal(
    alerts[0].detail,
    '현재 가평군에 건조주의보가 발효 중이에요. 작은 불씨도 큰불이 될 수 있으니 화재와 산불에 주의해 주세요.',
  );
  assert.match(
    alerts[1].detail,
    /한파주의보가 내려질 수 있어요\. 미리 대비해 주세요\. 동상과 빙판길/,
  );
  assert.match(alerts[2].detail, /여진에 주의해 주세요/);
  const speech = alertsSpeech(alerts);
  assert.ok(
    speech.startsWith('먼저 안전 안내예요. 현재 가평군에 건조주의보가'),
  );
  assert.equal(alertsSpeech([]), '');
  assert.equal(
    withSafety(
      '안녕하세요! 오늘 가평군 날씨부터 알려드릴게요. 지금은 맑음이에요.',
      '먼저 안전 안내예요.',
    ),
    '안녕하세요! 먼저 안전 안내예요. 오늘 가평군 날씨부터 알려드릴게요. 지금은 맑음이에요.',
  );
  assert.equal(
    withSafety('안녕하세요! 날씨예요.', ''),
    '안녕하세요! 날씨예요.',
  );
});

test('특보·지진은 전국 자료를 10분간 한 번만 받고 지진 조회 실패에도 특보는 안내한다', async () => {
  let clock = now;
  const calls: string[] = [];
  const port: AlertPort = {
    now: () => clock,
    configured: () => true,
    status: async () => {
      calls.push('status');
      return { current: STATUS, preliminary: 'o 없음', issuedAt: null };
    },
    quakes: async () => {
      calls.push('quakes');
      throw new Error('SERVICE_KEY_IS_NOT_REGISTERED_ERROR');
    },
  };
  const alerts = createAlerts(port);
  const gapyeong = await alerts('가평군');
  assert.equal(gapyeong.mode, 'live');
  assert.deepEqual(
    gapyeong.alerts.map((a) => a.title),
    ['건조주의보 발효 중', '한파경보 발효 중'],
  );
  assert.deepEqual((await alerts('수원시')).alerts, []);
  assert.deepEqual(
    calls,
    ['status', 'quakes'],
    '지역이 달라도 전국 자료는 한 번만 받는다',
  );
  clock += 11 * 60 * 1000;
  await alerts('수원시');
  assert.equal(calls.length, 4);
  const off = await createAlerts({ ...port, configured: () => false })(
    '가평군',
  );
  assert.equal(off.mode, 'unavailable');
  await assert.rejects(alerts('서울'));
});

test('기상청 시각(yyyyMMddHHmm, 한국 시각)을 UTC로 바꾼다', () => {
  assert.equal(
    new Date(kstTime(202611211200)).toISOString(),
    '2026-11-21T03:00:00.000Z',
  );
  assert.equal(
    new Date(kstTime('20261121090919')).toISOString(),
    '2026-11-21T00:09:19.000Z',
  );
});

test('특보 종류마다 짧은 주의 한마디를 붙인다', () => {
  assert.match(warningAdvice('폭염주의보'), /야외 활동/);
  assert.match(warningAdvice('한파경보'), /동상/);
  assert.match(warningAdvice('호우경보'), /하천/);
  assert.match(warningAdvice('대설주의보'), /미끄럼/);
  assert.match(warningAdvice('강풍주의보'), /간판/);
  assert.match(warningAdvice('폭풍해일주의보'), /해안가/);
  assert.equal(
    warningAdvice('알 수 없는 특보'),
    '기상 정보를 확인하며 안전에 유의해 주세요.',
  );
});
