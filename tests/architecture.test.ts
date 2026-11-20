import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { createJourneys } from '../lib/application/journeys';
import { createOperations } from '../lib/application/operations';
import { createSession } from '../lib/application/session';
import { createWeather } from '../lib/application/weather';
import { buildDemoWeather } from '../lib/domain/weather';
import { revisionOf } from '../lib/domain/journey';
import type { Journey } from '../lib/domain/contracts';
import type {
  AIPort,
  IdentityPort,
  JourneyRepository,
  SessionRepository,
} from '../lib/application/ports';

const root = resolve(import.meta.dirname, '..');
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? files(path)
      : path.endsWith('.ts') || path.endsWith('.tsx')
        ? [path]
        : [];
  });
}
test('안쪽 계층은 프레임워크·어댑터·I/O에 의존하지 않고 라우트는 조립 지점을 사용한다', () => {
  for (const layer of ['domain', 'application']) {
    for (const file of files(resolve(root, 'lib', layer))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(
        /(?:from\s*|import\s*\(|require\s*\()(['"])([^'"]+)\1/g,
      )) {
        const name = match[2];
        const target = name.startsWith('@/')
          ? resolve(root, name.slice(2))
          : resolve(dirname(file), name);
        const allowed =
          name === 'zod' ||
          target.startsWith(resolve(root, 'lib/domain') + sep) ||
          (layer === 'application' &&
            target.startsWith(resolve(root, 'lib/application') + sep)) ||
          target === resolve(root, 'data/places.json') ||
          target === resolve(root, 'data/gyeonggi-map.json');
        assert.ok(allowed, `${relative(root, file)} -> ${name}`);
      }
      assert.doesNotMatch(
        source,
        /\b(?:process\.env|Date\.now\s*\(|fetch\s*\(|new Request\b|Response\.|Buffer\.|toolCalls|toolChoice|dataUri|imageData|require\s*\()/,
      );
    }
  }
  for (const file of files(resolve(root, 'app'))) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(
      source,
      /(?:node:sqlite|adapters\/(?:sqlite|naver|open-meteo))/,
    );
  }
});

function memory() {
  const rows = new Map<string, Journey>();
  let inTransaction = false;
  const repository: JourneyRepository = {
    list: (owner) =>
      [...rows]
        .filter(([key]) => key.startsWith(owner + ':'))
        .map(([, value]) => structuredClone(value)),
    find: (owner, id) => structuredClone(rows.get(owner + ':' + id)),
    insert(owner, journey) {
      rows.set(owner + ':' + journey.id, structuredClone(journey));
    },
    update(owner, journey) {
      assert.ok(inTransaction);
      rows.set(owner + ':' + journey.id, structuredClone(journey));
    },
    photo: () => undefined,
    photoPlaces: () => [],
    putPhoto() {
      assert.ok(inTransaction);
    },
    transaction(operation) {
      assert.equal(inTransaction, false);
      inTransaction = true;
      try {
        return operation();
      } finally {
        inTransaction = false;
      }
    },
  };
  let next = 0;
  const identity: IdentityPort = {
    id: () => `id-${++next}`,
    now: () => 1000,
    token: () => 'a'.repeat(64),
    digest: (token) => 'hash:' + token,
  };
  return { service: createJourneys(repository, identity), identity };
}
const draft = {
  name: '바다 여행',
  date: '2026-11-15',
  placeIds: ['PLACE_REAL_001', 'PLACE_REAL_003'],
};
function ai(overrides: Partial<AIPort> = {}): AIPort {
  const unexpected = async (): Promise<never> => {
    throw Error('unexpected external call');
  };
  return {
    capabilities: () => ({
      clova: false,
      voice: false,
      translate: false,
      ocr: false,
    }),
    recommend: unexpected,
    guide: unexpected,
    proposeEdit: unexpected,
    diary: unexpected,
    poster: unexpected,
    translate: unexpected,
    voice: unexpected,
    ocr: unexpected,
    ...overrides,
  };
}

test('여행 유스케이스는 저장소 대역으로 소유권·충돌·기록 보호를 트랜잭션 안에서 검사한다', () => {
  const { service } = memory();
  const saved = service.saveJourney('owner', draft);
  assert.throws(
    () => service.getJourney('other', saved.id),
    /찾을 수 없습니다/,
  );
  service.saveRecord('owner', {
    journeyId: saved.id,
    placeId: draft.placeIds[0],
    rating: 5,
    note: '비공개 메모',
  });
  const current = service.getJourney('owner', saved.id);
  assert.throws(
    () => service.applyEdit('owner', saved.id, revisionOf(saved), draft),
    /변경되었습니다/,
  );
  assert.throws(
    () =>
      service.applyEdit('owner', saved.id, revisionOf(current), {
        ...draft,
        placeIds: [draft.placeIds[1]],
      }),
    /방문 기록/,
  );
  const edited = service.applyEdit('owner', saved.id, revisionOf(current), {
    ...draft,
    placeIds: [...draft.placeIds].reverse(),
  });
  assert.equal(edited.records[draft.placeIds[0]].note, '비공개 메모');
});

test('추천 유스케이스는 만족도만 외부에 전달하고 한도 초과 시 이미지 처리를 시작하지 않는다', async () => {
  const { service } = memory();
  const saved = service.saveJourney('owner', draft);
  service.saveRecord('owner', {
    journeyId: saved.id,
    placeId: draft.placeIds[0],
    rating: 5,
    note: 'SECRET_NOTE',
  });
  let calls = 0;
  const provider = ai({
    capabilities: () => ({
      clova: true,
      voice: false,
      translate: false,
      ocr: false,
    }),
    recommend: async (_prompt, _candidates, feedback) => {
      calls++;
      assert.deepEqual(feedback, [{ placeId: draft.placeIds[0], rating: 5 }]);
      return {
        title: '여행',
        summary: '추천',
        stops: [{ placeId: draft.placeIds[0], reason: '바다' }],
      };
    },
  });
  const operations = createOperations(service, provider, {
    consume: () => true,
  });
  await operations.recommendation('owner', {
    prompt: '바다 여행',
    region: '전체',
  });
  assert.equal(calls, 1);
  const blocked = createOperations(service, provider, { consume: () => false });
  const load = async () => {
    assert.fail('한도 초과 요청의 이미지를 읽으면 안 된다');
  };
  await assert.rejects(
    blocked.uploadPhoto('owner', saved.id, draft.placeIds[0], load),
    /한도/,
  );
  await assert.rejects(blocked.poster('owner', load), /한도/);
});

test('세션과 날씨 유스케이스는 쿠키·환경 변수·네트워크 없이 포트로 실행한다', async () => {
  const { identity } = memory();
  const sessions = new Map<string, number>();
  const repository: SessionRepository = {
    owner: (hash, now) => ((sessions.get(hash) ?? 0) > now ? hash : undefined),
    insert: (owner, expires) => {
      sessions.set(owner, expires);
    },
  };
  const session = createSession(repository, identity);
  assert.throws(() => session(undefined), /세션/);
  const created = session(undefined, true);
  assert.equal(created.token?.length, 64);
  assert.deepEqual(session(created.token), { owner: created.owner });
  assert.equal(sessions.get(created.owner), 1000 + 30 * 86400000);
  const weather = createWeather({
    now: () => Date.parse('2026-11-17T15:00:00Z'),
    demo: () => false,
    current: async () => {
      throw Error('offline');
    },
  });
  const fallback = await weather('오이도');
  assert.equal(fallback.mode, 'demo');
  assert.equal(fallback.daily[0].date, '2026-11-18');
  assert.equal(fallback.observedAt, '2026-11-18 시연 기준');
  await assert.rejects(weather('없는 지역'));
});

test('날씨 도메인은 같은 기준 시간에 같은 결과를 내고 한국 자정·연도 경계를 반영한다', () => {
  const before = Date.parse('2026-12-31T14:59:59Z');
  const after = before + 1000;
  const first = buildDemoWeather('전체', before);
  assert.deepEqual(first, buildDemoWeather('전체', before));
  assert.deepEqual(
    first.daily.map((day) => day.date),
    ['2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04'],
  );
  assert.equal(buildDemoWeather('전체', after).daily[0].date, '2027-01-01');
});
