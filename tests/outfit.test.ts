import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOutfit,
  outfitBand,
  type OutfitInput,
} from '../lib/domain/outfit';
import {
  WEATHER_REGIONS,
  buildDemoWeather,
  buildWeatherOutfit,
} from '../lib/domain/weather';

const base: OutfitInput = {
  regionName: '수원시',
  coastal: false,
  tempMax: 15,
  tempMin: 10,
  precipitationProbability: 10,
  apparentTemperature: 14,
  windSpeed: 2,
  precipitation: 0,
  currentWeatherCode: 2,
  todayWeatherCode: 2,
};
const outfit = (patch: Partial<OutfitInput>) =>
  buildOutfit({ ...base, ...patch });

test('옷차림 구간은 오늘 최고기온을 이하 경계로 나눈다', () => {
  const cases: [number, string][] = [
    [-10, '4°C 이하'],
    [4, '4°C 이하'],
    [4.5, '5~8°C'],
    [8, '5~8°C'],
    [8.1, '9~11°C'],
    [11, '9~11°C'],
    [11.5, '12~16°C'],
    [16, '12~16°C'],
    [16.5, '17~19°C'],
    [19, '17~19°C'],
    [19.5, '20~22°C'],
    [22, '20~22°C'],
    [22.5, '23~27°C'],
    [27, '23~27°C'],
    [27.5, '28°C 이상'],
    [35, '28°C 이상'],
  ];
  for (const [temp, label] of cases)
    assert.equal(outfitBand(temp).label, label, `${temp}°C`);
});

test('옷차림은 겉옷·상의·하의·소품과 실제 수치의 이유 문장을 준다', () => {
  const cold = outfit({
    tempMax: 3,
    tempMin: -3,
    apparentTemperature: -1,
  });
  assert.deepEqual(cold.outer, ['롱패딩', '두꺼운 코트']);
  assert.deepEqual(cold.top, ['니트', '히트텍']);
  assert.deepEqual(cold.bottom, ['기모 바지']);
  assert.deepEqual(cold.accessories, ['목도리', '장갑']);
  assert.equal(
    cold.summary,
    '최저 -3도, 최고 3도라 롱패딩에 니트, 기모 바지를 입으세요. 목도리와 장갑을 챙기세요. 낮에도 3도라 겉옷을 벗기 어렵습니다.',
  );
  // 소품과 겹치는 목도리·장갑은 추가 준비물에 다시 넣지 않는다.
  assert.deepEqual(cold.extras, ['귀마개']);

  const mild = outfit({ tempMax: 18, tempMin: 12 });
  assert.match(mild.summary, /쌀쌀하면 얇은 가디건을 걸치세요/);
  const hot = outfit({ tempMax: 25, tempMin: 19, currentWeatherCode: 3 });
  assert.deepEqual(hot.outer, []);
  assert.deepEqual(hot.extras, []);
  assert.deepEqual(hot.notes, []);
});

test('같은 날씨 입력은 항상 같은 옷차림을 만든다', () => {
  assert.deepEqual(outfit({ tempMax: 7 }), outfit({ tempMax: 7 }));
});

test('비·바람·눈 준비물은 기준값의 등호 양쪽에서 판정한다', () => {
  assert.ok(!outfit({ precipitationProbability: 59 }).extras.includes('우산'));
  const rain = outfit({ precipitationProbability: 60 });
  assert.deepEqual(rain.extras, ['우산', '방수 신발']);
  assert.match(rain.notes[0], /강수확률이 60%/);
  assert.ok(outfit({ precipitation: 0.2 }).extras.includes('우산'));
  assert.ok(outfit({ currentWeatherCode: 61 }).extras.includes('우산'));

  assert.ok(
    !outfit({ precipitationProbability: 70, windSpeed: 7.9 }).extras.includes(
      '우비',
    ),
  );
  const stormy = outfit({ precipitationProbability: 70, windSpeed: 8 });
  assert.ok(stormy.extras.includes('우비'));
  assert.ok(stormy.extras.includes('바람막이'));
  assert.ok(stormy.extras.includes('끈 있는 모자'));

  const heavy = outfit({ todayWeatherCode: 65 });
  for (const item of ['우산', '우비', '방수 신발', '여벌 양말'])
    assert.ok(heavy.extras.includes(item), item);
  assert.equal(new Set(heavy.extras).size, heavy.extras.length);

  const snow = outfit({ todayWeatherCode: 73, precipitation: 0.5 });
  assert.ok(snow.extras.includes('미끄럼 방지 신발'));
  assert.ok(snow.extras.includes('방수 장갑'));
  assert.ok(!snow.extras.includes('우산'));
});

test('추위·일교차·더위 준비물은 기준값의 등호 양쪽에서 판정한다', () => {
  assert.ok(
    !outfit({ tempMax: 4.1, apparentTemperature: 0.1 }).extras.includes(
      '귀마개',
    ),
  );
  assert.ok(
    outfit({ tempMax: 4, apparentTemperature: 3 }).extras.includes('귀마개'),
  );
  const chilly = outfit({ tempMax: 9, apparentTemperature: 0 });
  assert.ok(chilly.extras.includes('귀마개'));
  assert.match(chilly.notes.join(' '), /체감온도가 0도/);

  assert.ok(!outfit({ tempMax: 3, tempMin: -4.9 }).extras.includes('핫팩'));
  assert.ok(outfit({ tempMax: 3, tempMin: -5 }).extras.includes('핫팩'));

  assert.ok(
    !outfit({ tempMax: 17.9, tempMin: 10 }).extras.includes('얇은 겉옷'),
  );
  const range = outfit({ tempMax: 18, tempMin: 10 });
  assert.ok(range.extras.includes('얇은 겉옷'));
  assert.match(range.notes.join(' '), /일교차가 8도/);
  // 롱패딩·코트 구간에서는 일교차가 커도 얇은 겉옷을 권하지 않는다(경계 12°C).
  assert.ok(
    !outfit({ tempMax: 11.9, tempMin: 1 }).extras.includes('얇은 겉옷'),
  );
  assert.ok(outfit({ tempMax: 12, tempMin: 2 }).extras.includes('얇은 겉옷'));
  assert.ok(
    !outfit({ tempMax: 1.5, tempMin: -6.5 }).extras.includes('얇은 겉옷'),
  );

  const sunny = { tempMin: 22, todayWeatherCode: 0, currentWeatherCode: 0 };
  assert.ok(!outfit({ ...sunny, tempMax: 27.9 }).extras.includes('선크림'));
  const hot = outfit({ ...sunny, tempMax: 28 });
  assert.deepEqual(hot.extras, ['선글라스', '선크림', '물']);
  assert.ok(hot.accessories.includes('모자'));
  assert.ok(
    !outfit({ ...sunny, tempMax: 30, todayWeatherCode: 3 }).extras.includes(
      '선크림',
    ),
  );
});

test('해안 시·군은 지역 이름으로 해풍 바람막이를 안내하고 더운 날에는 생략한다', () => {
  const coastal = Object.entries(WEATHER_REGIONS)
    .filter(([, meta]) => meta.coastal)
    .map(([name]) => name);
  assert.ok(coastal.includes('시흥시'));
  const siheung = buildWeatherOutfit(
    '시흥시',
    WEATHER_REGIONS['시흥시'],
    { apparentTemperature: 12, windSpeed: 3, precipitation: 0, weatherCode: 1 },
    { tempMax: 15, tempMin: 9, precipitationProbability: 10, weatherCode: 1 },
  );
  assert.ok(siheung.extras.includes('바람막이'));
  assert.match(siheung.notes.join(' '), /시흥시는 해안 권역이라 해풍/);

  const inland = buildWeatherOutfit(
    '가평군',
    WEATHER_REGIONS['가평군'],
    { apparentTemperature: 12, windSpeed: 3, precipitation: 0, weatherCode: 1 },
    { tempMax: 15, tempMin: 9, precipitationProbability: 10, weatherCode: 1 },
  );
  assert.ok(!inland.extras.includes('바람막이'));
  assert.ok(
    !outfit({ coastal: true, tempMax: 23 }).extras.includes('바람막이'),
  );

  // 롱패딩 구간에서는 바람막이 대신 방풍 겉옷·해풍 체감 안내를 한다(경계 8°C).
  const coldCoast = outfit({
    regionName: '시흥시',
    coastal: true,
    tempMax: 1.7,
    tempMin: -5.6,
    windSpeed: 9,
  });
  assert.ok(!coldCoast.extras.includes('바람막이'));
  assert.ok(coldCoast.extras.includes('끈 있는 모자'));
  assert.match(coldCoast.notes.join(' '), /해풍 때문에 더 춥게/);
  assert.match(coldCoast.notes.join(' '), /바람이 잘 들지 않는 겉옷/);
  assert.ok(!outfit({ coastal: true, tempMax: 8 }).extras.includes('바람막이'));
  assert.ok(
    outfit({ coastal: true, tempMax: 8.1 }).extras.includes('바람막이'),
  );
});

test('데모 날씨도 모든 지역에서 같은 규칙의 옷차림을 포함한다', () => {
  const now = Date.parse('2026-11-21T03:00:00Z');
  for (const region of Object.keys(WEATHER_REGIONS)) {
    const weather = buildDemoWeather(region, now);
    assert.equal(weather.mode, 'demo');
    assert.equal(
      weather.outfit.band,
      outfitBand(weather.daily[0].tempMax).label,
    );
    assert.ok(weather.outfit.summary.startsWith('최저 '));
  }
});
