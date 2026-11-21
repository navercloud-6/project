import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantInput } from '../lib/domain/assistant';
import {
  BRIEFING_ENDING,
  BRIEFING_KO_LIMIT,
  briefingOutput,
  missingNames,
  composeScript,
  headFacts,
  unknownNumbers,
  withReasons,
  ruleReason,
  withoutOwnName,
  politeEnding,
  seasonOf,
  offSeasonWords,
  foreignItems,
  tidyHead,
  type BriefingFacts,
  type BriefingHeadFacts,
  briefingFacts,
  fixEnding,
  ruleScript,
  spokenKorean,
} from '../lib/domain/briefing';
import { places } from '../lib/domain/catalog';
import {
  WEATHER_REGIONS,
  buildDemoWeather,
  buildWeatherOutfit,
  type WeatherResponse,
} from '../lib/domain/weather';
import { createOperations } from '../lib/application/operations';
import { createBriefing } from '../lib/application/briefing';
import type { AIPort, Capabilities, LimitPort } from '../lib/application/ports';
import type { JourneyService } from '../lib/application/journeys';

const now = Date.parse('2026-11-21T03:00:00Z');
const demo = (region: string) => buildDemoWeather(region, now);
// 실제 옷차림 규칙으로 만든 추운 날(최저 -5.6°C, 최고 1.7°C) 날씨.
const cold = (region: string): WeatherResponse => {
  const w = demo(region);
  const current = { ...w.current, temperature: 1.2, condition: '맑음' };
  const today = { ...w.daily[0], tempMin: -5.6, tempMax: 1.7 };
  return {
    ...w,
    current,
    daily: [today, ...w.daily.slice(1)],
    outfit: buildWeatherOutfit(region, WEATHER_REGIONS[region], current, today),
  };
};

test('끝인사 정리는 본문을 보존하고 마무리 인사만 하나로 통일한다(Astra 반례)', () => {
  assert.equal(
    fixEnding('맑아요 오늘 공원에 가요 즐거운 여행 되세요!'),
    `맑아요 오늘 공원에 가요. ${BRIEFING_ENDING}`,
  );
  assert.equal(fixEnding(''), '');
  assert.equal(fixEnding('방송을 마칩니다.'), '');
  assert.equal(
    fixEnding('맑아요.방송을 마칩니다.'),
    `맑아요. ${BRIEFING_ENDING}`,
  );
  assert.equal(
    fixEnding('방송국을 둘러보세요. 좋은 하루 보내세요! 즐거운 여행 되세요!'),
    `방송국을 둘러보세요. ${BRIEFING_ENDING}`,
  );
  assert.equal(
    fixEnding('최고 3.5도예요. 다음에 또 만나요.'),
    `최고 3.5도예요. ${BRIEFING_ENDING}`,
  );
});

test('음성용 문장은 영하·단위·기호를 읽는 말로 바꾼다', () => {
  assert.equal(
    spokenKorean('최저 -5.6도, 체감 -1°C, 강수 60%, 바람 9m/s (주의)'),
    '최저 영하 5.6도, 체감 영하 1도, 강수 60퍼센트, 바람 초속 9미터',
  );
  assert.equal(
    spokenKorean('바람이 초속 9m로 강해'),
    '바람이 초속 9미터로 강해',
  );
});

test('음성용 문장은 괄호 속 한자·보충 설명을 읽지 않는다', () => {
  assert.equal(
    spokenKorean('방화수류정(訪花隨柳亭)은 1794년(정조 18) 세운 누각 , 이다.'),
    '방화수류정은 1794년 세운 누각, 이다.',
  );
});

test('규칙 원고는 날씨→옷차림→준비물→명소 순서로 옷 이름을 그대로 말한다', () => {
  const facts = briefingFacts(cold('시흥시'), places);
  assert.equal(facts.places.length, 3);
  const script = ruleScript(facts);
  assert.ok(
    script.startsWith('안녕하세요! 오늘 시흥시 날씨부터 알려드릴게요.'),
  );
  assert.ok(script.endsWith(BRIEFING_ENDING));
  assert.ok(script.length <= BRIEFING_KO_LIMIT);
  assert.match(script, /최저 영하 5\.6도/);
  assert.doesNotMatch(script, /-\d/);
  const order = ['기온은', '롱패딩', '핫팩', facts.places[0].name].map((w) =>
    script.indexOf(w),
  );
  assert.ok(order.every((i) => i >= 0));
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  assert.match(briefingFacts(demo('전체'), places).region, /^경기도$/);
});

test('도우미 briefing 입력은 날씨와 같은 지역 이름과 ko·en만 허용한다', () => {
  assert.ok(
    assistantInput.safeParse({
      action: 'briefing',
      region: '수원시',
      lang: 'en',
    }).success,
  );
  assert.ok(
    !assistantInput.safeParse({
      action: 'briefing',
      region: '서울',
      lang: 'ko',
    }).success,
  );
  assert.ok(
    !assistantInput.safeParse({
      action: 'briefing',
      region: '수원시',
      lang: 'ja',
    }).success,
  );
});

const names = (facts: BriefingFacts) =>
  facts.places.map((p) => p.name).join(', ');
function provider(
  caps: Partial<Capabilities>,
  calls: string[],
  drafts: ((facts: BriefingHeadFacts) => string)[] = [],
  reasonDrafts?: string[],
): AIPort {
  const unexpected = async (): Promise<never> => {
    throw Error('unexpected external call');
  };
  return {
    capabilities: () => ({
      clova: false,
      voice: false,
      translate: false,
      ocr: false,
      ...caps,
    }),
    recommend: unexpected,
    guide: unexpected,
    proposeEdit: unexpected,
    diary: unexpected,
    poster: unexpected,
    ocr: unexpected,
    restaurantMenus: unexpected,
    placeReasons: async (items) => {
      calls.push(`reasons:${items.length}`);
      return reasonDrafts ?? items.map(() => '조용히 걸으며 쉬어 가기 좋아요.');
    },
    briefing: async (facts) => {
      calls.push(`briefing:${facts.region}`);
      const custom = drafts.shift();
      if (custom) return custom(facts);
      assert.ok(!('places' in facts), 'HCX에는 명소·맛집을 넘기지 않는다');
      return `안녕하세요! 오늘 ${facts.region} 날씨부터 알려드릴게요. **최저 -5.6도**예요. 롱패딩을 입으세요. 안내 방송을 마치겠습니다. 좋은 하루 보내세요!`;
    },
    translate: async (text, target) => {
      calls.push(`translate:${target}`);
      assert.ok(text.startsWith('안녕하세요!'));
      return 'Hello! Here is today’s weather. Have a nice trip!';
    },
    voice: async (text, speaker) => {
      calls.push(`voice:${speaker}`);
      assert.ok(text.length > 0);
      return new Uint8Array([0x49, 0x44, 0x33]);
    },
  };
}
const service = {} as JourneyService;
const allow = { consume: async () => true };
let clock = 0;
const opsWith = (
  ai: AIPort,
  limits: LimitPort,
  weather: (region: string) => Promise<WeatherResponse>,
) =>
  createOperations(
    service,
    ai,
    limits,
    createBriefing({ ai, now: () => clock, weather }),
  );

test('키가 없으면 규칙 원고만 돌려주고 외부 AI·음성을 호출하지 않는다', async () => {
  const calls: string[] = [];
  const regions: string[] = [];
  const ops = opsWith(provider({}, calls), allow, async (r) => {
    regions.push(r);
    return cold(r);
  });
  const result = briefingOutput.parse(
    await ops.assistant('owner', {
      action: 'briefing',
      region: '가평군',
      lang: 'ko',
    }),
  );
  assert.deepEqual(regions, ['가평군']);
  assert.deepEqual(calls, []);
  assert.equal(result.mode, 'rule');
  assert.equal(result.weatherMode, 'demo');
  assert.match(result.script, /오늘 가평군 날씨부터/);

  await assert.rejects(
    ops.assistant('owner', {
      action: 'briefing',
      region: '가평군',
      lang: 'en',
    }),
    /Papago API 키/,
  );
  assert.deepEqual(regions, ['가평군'], '영어 불가 시 날씨도 부르지 않는다');
});

test('키가 있으면 HCX 원고를 정리해 한국어는 nara, 영어는 번역 후 clara로 읽는다', async () => {
  const calls: string[] = [];
  const ops = opsWith(
    provider({ clova: true, voice: true, translate: true }, calls),
    allow,
    async (r) => cold(r),
  );
  const ko = briefingOutput.parse(
    await ops.assistant('owner', {
      action: 'briefing',
      region: '시흥시',
      lang: 'ko',
    }),
  );
  assert.equal(ko.mode, 'clova');
  assert.equal(
    ko.script,
    composeScript(
      '안녕하세요! 오늘 시흥시 날씨부터 알려드릴게요. 최저 영하 5.6도예요. 롱패딩을 입으세요.',
      withReasons(briefingFacts(cold('시흥시'), places), [
        '조용히 걸으며 쉬어 가기 좋아요.',
        '조용히 걸으며 쉬어 가기 좋아요.',
        '조용히 걸으며 쉬어 가기 좋아요.',
      ]),
    ),
  );
  assert.match(
    ko.script,
    /오늘의 추천 명소예요\. 시흥 갯골생태공원, 조용히 걸으며/,
  );
  assert.ok(ko.script.endsWith(BRIEFING_ENDING));
  assert.deepEqual(
    missingNames(ko.script, briefingFacts(cold('시흥시'), places)),
    [],
  );
  // 원고가 만들어지면 음성도 바로 미리 만든다(동시에 요청하므로 순서는 보지 않는다).
  const voice = await ops.assistant('owner', {
    action: 'briefingVoice',
    region: '시흥시',
    lang: 'ko',
  });
  assert.ok(voice instanceof Uint8Array);
  assert.deepEqual([...calls].sort(), [
    'briefing:시흥시',
    'reasons:3',
    'voice:nara',
  ]);

  // 듣기를 다시 눌러도 미리 만든 음성을 쓴다.
  calls.length = 0;
  await ops.assistant('owner', {
    action: 'briefingVoice',
    region: '시흥시',
    lang: 'ko',
  });
  assert.deepEqual(calls, []);

  // 영어는 저장된 한국어 원고를 번역만 하고, 음성은 clara로 미리 만든다.
  const en = briefingOutput.parse(
    await ops.assistant('owner', {
      action: 'briefing',
      region: '시흥시',
      lang: 'en',
    }),
  );
  assert.equal(en.lang, 'en');
  assert.match(en.script, /^Hello!/);
  await ops.assistant('owner', {
    action: 'briefingVoice',
    region: '시흥시',
    lang: 'en',
  });
  assert.deepEqual(calls, ['translate:en', 'voice:clara']);
});

test('같은 시·군·언어의 원고와 음성은 10분간 다시 쓰고 그때는 한도를 차감하지 않는다', async () => {
  const calls: string[] = [];
  const consumed: string[] = [];
  clock = 0;
  const ops = opsWith(
    provider({ clova: true, voice: true }, calls),
    {
      consume: async (key) => {
        consumed.push(key);
        return true;
      },
    },
    async (r) => cold(r),
  );
  const ask = (action: 'briefing' | 'briefingVoice') =>
    ops.assistant('owner', { action, region: '수원시', lang: 'ko' });
  const [a, b] = await Promise.all([ask('briefing'), ask('briefing')]);
  assert.deepEqual(a, b);
  assert.equal(
    calls.filter((c) => c.startsWith('briefing')).length,
    1,
    '동시 요청은 한 번만 만든다',
  );
  await ask('briefingVoice');
  const used = consumed.length;
  clock = 9 * 60 * 1000;
  await ask('briefing');
  await ask('briefingVoice');
  assert.equal(
    consumed.length,
    used,
    '저장된 원고·음성은 한도를 차감하지 않는다',
  );
  assert.equal(calls.filter((c) => c.startsWith('voice')).length, 1);
  clock = 11 * 60 * 1000;
  await ask('briefing');
  assert.equal(
    calls.filter((c) => c.startsWith('briefing')).length,
    2,
    '10분이 지나면 새로 만든다',
  );
  assert.ok(consumed.length > used);
  clock = 0;
});

test('통합 안내는 도우미 시간당 한도를 함께 쓴다', async () => {
  const keys: string[] = [];
  const ops = opsWith(
    provider({}, []),
    {
      consume: async (key) => {
        keys.push(key);
        return false;
      },
    },
    async () => assert.fail('한도 초과 시 날씨를 부르면 안 된다'),
  );
  await assert.rejects(
    ops.assistant('owner', { action: 'briefing', region: '전체', lang: 'ko' }),
    /한도/,
  );
  assert.deepEqual(keys, ['assistant:owner']);
});

test('명소·맛집 이름은 코드가 자료 그대로 붙이고 이름 오기를 찾아낸다', () => {
  const facts = briefingFacts(cold('수원시'), places, [
    {
      name: '셰프스위트',
      category: '음식점>양식',
      address: '경기도 수원시 팔달구 1',
      link: null,
      menus: [],
    },
  ]);
  assert.deepEqual(
    missingNames(`${names(facts)}에 가 보세요. 셰프 시크릿도 좋아요.`, facts),
    ['셰프스위트'],
  );
  assert.deepEqual(missingNames(`${names(facts)}, 셰프 스위트`, facts), []);
  assert.deepEqual(
    missingNames(composeScript('안녕하세요!', facts), facts),
    [],
  );
});

test('HCX 앞부분에 자료에 없는 숫자가 있으면 1번 다시 요청하고 그래도 틀리면 규칙 원고를 쓴다', async () => {
  const head = headFacts(briefingFacts(cold('수원시'), places));
  // 현재 1.2도를 '영하 1.2도'로, 최저 -5.6도를 '영하 6도'로 바꾼 경우
  assert.deepEqual(
    unknownNumbers('지금 영하 1.2도, 최저 영하 6도예요.', head),
    [-1.2, -6],
  );
  assert.deepEqual(
    unknownNumbers(
      '지금 1.2도, 최저 영하 5.6도, 최고 1.7도, 비 올 확률 10퍼센트예요.',
      {
        ...head,
        weather: { ...head.weather, precipitationProbability: 10 },
      },
    ),
    [],
  );

  const weather = async (r: string) => cold(r);
  const retried: string[] = [];
  const second = briefingOutput.parse(
    await opsWith(
      provider({ clova: true }, retried, [() => '지금은 영하 1.2도예요.']),
      allow,
      weather,
    ).assistant('owner', { action: 'briefing', region: '수원시', lang: 'ko' }),
  );
  assert.equal(second.mode, 'clova');
  assert.deepEqual([...retried].sort(), [
    'briefing:수원시',
    'briefing:수원시',
    'reasons:3',
  ]);

  const failed: string[] = [];
  const rule = briefingOutput.parse(
    await opsWith(
      provider({ clova: true }, failed, [
        () => '지금은 영하 1.2도예요.',
        () => '최고 2도예요.',
      ]),
      allow,
      weather,
    ).assistant('owner', { action: 'briefing', region: '수원시', lang: 'ko' }),
  );
  assert.equal(rule.mode, 'rule');
  assert.equal(
    rule.script,
    ruleScript(
      withReasons(
        briefingFacts(cold('수원시'), places),
        Array(3).fill('조용히 걸으며 쉬어 가기 좋아요.'),
      ),
    ),
  );
  assert.equal(failed.filter((c) => c.startsWith('briefing')).length, 2);
});

test('HCX 앞부분은 오늘 없는 옷·준비물과 맺음말 조각을 걸러낸다', () => {
  const head = headFacts(briefingFacts(cold('시흥시'), places));
  // cold()는 4°C 이하 구간: 롱패딩·두꺼운 코트 / 니트·히트텍 / 기모 바지 / 목도리·장갑
  assert.deepEqual(
    foreignItems('롱패딩이나 두꺼운 코트에 니트, 기모 바지를 입으세요.', head),
    [],
  );
  assert.deepEqual(
    foreignItems('얇은 겉옷도 여러 벌 가져오세요. 반바지도 좋아요.', head),
    ['반바지', '얇은 겉옷'],
  );
  assert.equal(
    tidyHead(
      '안녕하세요! 오늘 날씨예요. 핫팩을 챙기세요. 그럼 따뜻하게 입고 오셔서. 즐거운 여행 되세요!',
    ),
    '안녕하세요! 오늘 날씨예요. 핫팩을 챙기세요.',
  );
});

test('장소 추천 이유는 짧은 한 문장만 쓰고 틀린 문장은 태그 기반 규칙 문장으로 바꾼다', () => {
  const facts = briefingFacts(cold('수원시'), places, [
    {
      name: '셰프스위트',
      category: '음식점>양식',
      address: '경기도 수원시 1',
      link: null,
      menus: [],
    },
  ]);
  const [a, b, c] = facts.places;
  const result = withReasons(facts, [
    '호수 둘레를 걸으며 쉬어 가기 좋아요',
    '셰프스위트에서 식사 후 들르기 좋아요.',
    '1794년에 지은 곳이에요.',
  ]).places;
  assert.equal(result[0].reason, '호수 둘레를 걸으며 쉬어 가기 좋아요.');
  assert.equal(
    result[1].reason,
    ruleReason(b.tags),
    '다른 장소 이름이 섞이면 버린다',
  );
  assert.equal(result[2].reason, ruleReason(c.tags), '숫자가 있으면 버린다');
  assert.equal(
    withReasons(facts, ['가'.repeat(80)]).places[0].reason,
    ruleReason(a.tags),
    '너무 긴 문장은 버린다',
  );
  assert.equal(
    ruleReason(['관광명소', '문화시설']),
    '실내 전시라 날씨와 상관없이 둘러보기 좋아요.',
  );
  assert.equal(ruleReason(['관광명소']), '오늘 둘러보기 알맞은 곳이에요.');
});

test('추천 이유 앞의 같은 장소 이름은 지우고 끝맺음은 해요체로 맞춘다', () => {
  assert.equal(
    withoutOwnName('화성행궁은 조선 왕의 임시 거처였던 곳이에요.', '화성행궁'),
    '조선 왕의 임시 거처였던 곳이에요.',
  );
  assert.equal(
    withoutOwnName(
      '아침 고요 수목원에서 다양한 식물을 봐요.',
      '아침고요수목원',
    ),
    '다양한 식물을 봐요.',
  );
  assert.equal(
    withoutOwnName('호수를 보며 걸어요.', '광교호수공원'),
    '호수를 보며 걸어요.',
  );
  assert.equal(
    politeEnding('경치를 감상할 수 있습니다.'),
    '경치를 감상할 수 있어요.',
  );
  assert.equal(politeEnding('피크닉 하기 좋습니다.'), '피크닉 하기 좋아요.');
});

test('계절은 달과 실제 기온으로 정하고 다른 계절 풍경의 추천 이유는 규칙 문장으로 바꾼다', () => {
  assert.equal(seasonOf('2026-11-21', -6.5, 1.7), '겨울', '영하권 11월은 겨울');
  assert.equal(seasonOf('2026-11-05', 6, 15), '가을');
  assert.equal(seasonOf('2026-04-10', 8, 18), '봄');
  assert.equal(seasonOf('2026-09-02', 21, 29), '여름', '더운 9월은 여름');
  assert.deepEqual(offSeasonWords('섬 전체가 꽃으로 뒤덮인 풍경', '겨울'), [
    '꽃',
  ]);
  assert.deepEqual(offSeasonWords('단풍나무 길에서 가을 분위기', '겨울'), [
    '단풍',
    '가을',
  ]);
  assert.deepEqual(offSeasonWords('단풍나무 길에서 가을 분위기', '가을'), []);
  assert.deepEqual(offSeasonWords('눈 덮인 설경이 멋져요', '겨울'), []);
  assert.deepEqual(offSeasonWords('돗자리 펴고 피크닉을 즐겨요', '겨울'), [
    '피크닉',
    '돗자리',
  ]);
  assert.deepEqual(offSeasonWords('돗자리 펴고 피크닉을 즐겨요', '봄'), []);

  const facts = briefingFacts(cold('가평군'), places);
  assert.equal(facts.weather.season, '겨울');
  const [first] = withReasons(facts, [
    '호수를 둘러싼 단풍나무 길을 걸으며 가을 분위기를 만끽하기 좋아요.',
  ]).places;
  assert.equal(first.reason, ruleReason(first.tags));
  // 오늘 날짜를 말하는 것은 지어낸 숫자로 보지 않는다.
  const head = headFacts(facts);
  const [, month, day] = head.weather.date.split('-').map(Number);
  assert.deepEqual(
    unknownNumbers(`오늘은 ${month}월 ${day}일이에요.`, head),
    [],
  );
});
