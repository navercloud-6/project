import { z } from 'zod';

export const ALERT_CACHE_MS = 10 * 60 * 1000;
// 최근 이 시간 안에 난 국내 지진만 안내한다.
export const QUAKE_WINDOW_MS = 24 * 60 * 60 * 1000;
// 이 규모 이상이거나 경기도에서 난 지진만 안내한다.
export const QUAKE_MIN_MAGNITUDE = 3.0;

export const alertSchema = z.object({
  kind: z.enum(['warning', 'preliminary', 'earthquake']),
  title: z.string(),
  detail: z.string(),
});
export type Alert = z.infer<typeof alertSchema>;

export const alertsResponseSchema = z.object({
  region: z.string(),
  mode: z.enum(['live', 'unavailable']),
  source: z.string(),
  issuedAt: z.string().nullable(),
  message: z.string().nullable(),
  alerts: z.array(alertSchema),
});
export type AlertsResponse = z.infer<typeof alertsResponseSchema>;

/** '수원시' → '수원', '가평군' → '가평'(기상청 특보 구역 표기). */
export const shortCityName = (region: string) => region.replace(/(시|군)$/, '');

/**
 * 특보 현황 문단(o 건조주의보 : 경기도(가평), 서울(...))에서
 * 선택 지역에 해당하는 특보 이름을 찾는다. '전체'는 경기도에 걸린 특보를 모두 돌려준다.
 */
export function warningsFor(
  text: string,
  region: string,
): { name: string; areas: string[] }[] {
  const out: { name: string; areas: string[] }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*o\s*/, '').trim();
    const m = line.match(/^(.+?(?:주의보|경보))\s*:\s*(.+)$/);
    if (!m) continue;
    const name = m[1].replace(/^\(\d+\)\s*/, '').trim();
    const gyeonggi = m[2].match(/경기도(?:\(([^)]*)\))?/);
    if (!gyeonggi) continue;
    // '경기도'만 있으면 도 전체, 괄호가 있으면 그 시·군들
    const areas = gyeonggi[1]
      ? gyeonggi[1]
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean)
      : ['경기도 전체'];
    if (
      region === '전체' ||
      areas.includes('경기도 전체') ||
      areas.some((a) => a.startsWith(shortCityName(region)))
    )
      out.push({ name, areas });
  }
  return out;
}

export type QuakeReport = {
  time: number;
  location: string;
  magnitude: number;
  // 최대 진도와 느낀 지역(예: '최대진도 Ⅱ(전남광주)'), 없으면 빈 문자열
  intensity: string;
  // 기상청 통보 종류상 국내 지진인지
  domestic: boolean;
};

// 기상청 지진 통보 종류(fcTp): 3·5 국내지진정보, 11 국내 조기경보, 13 정밀분석, 14 지진속보
export const DOMESTIC_QUAKE_TYPES = new Set([3, 5, 11, 13, 14]);

/**
 * 최근 24시간 지진 중 안내할 것:
 * - 국내 지진: 경기도에서 났거나 규모 3.0 이상
 * - 해외 지진: 경기도에서 진동이 느껴진 경우만(예: 일본 지진의 최대진도가 경기)
 */
export function quakesToReport(
  quakes: QuakeReport[],
  now: number,
): QuakeReport[] {
  return quakes.filter(
    (q) =>
      now >= q.time &&
      now - q.time <= QUAKE_WINDOW_MS &&
      (q.domestic
        ? q.location.includes('경기') || q.magnitude >= QUAKE_MIN_MAGNITUDE
        : q.intensity.includes('경기')),
  );
}

// 특보 종류별 주의 한마디(앞에서부터 처음 맞는 것을 쓴다).
const WARNING_ADVICE: [string, string][] = [
  ['건조', '작은 불씨도 큰불이 될 수 있으니 화재와 산불에 주의해 주세요.'],
  ['폭염', '한낮 야외 활동을 줄이고 물을 자주 드시며 그늘에서 쉬어 가세요.'],
  [
    '한파',
    '동상과 빙판길에 주의하고 따뜻하게 입고 야외 활동은 짧게 해 주세요.',
  ],
  ['대설', '눈길 미끄럼에 주의하고 대중교통을 이용해 주세요.'],
  ['호우', '하천·계곡과 지하차도 같은 낮은 곳은 피해 주세요.'],
  ['태풍', '외출을 줄이고 간판이나 공사장 근처를 피해 주세요.'],
  ['강풍', '간판·나무 아래를 피하고 높은 곳이나 해안 산책은 삼가 주세요.'],
  ['풍랑', '바닷가와 방파제 접근을 피해 주세요.'],
  ['폭풍해일', '해안가와 저지대에서 벗어나 주세요.'],
  ['지진해일', '해안에서 벗어나 높은 곳으로 대피해 주세요.'],
  ['황사', '마스크를 쓰고 야외 활동을 줄여 주세요.'],
  ['미세먼지', '마스크를 쓰고 야외 활동을 줄여 주세요.'],
];
export function warningAdvice(name: string): string {
  return (
    WARNING_ADVICE.find(([key]) => name.includes(key))?.[1] ??
    '기상 정보를 확인하며 안전에 유의해 주세요.'
  );
}

const placeName = (region: string) => (region === '전체' ? '경기도' : region);

/** 화면·음성에 쓸 안내 문장을 만든다(자료 그대로, AI를 거치지 않는다). */
export function buildAlerts(
  region: string,
  warnings: { name: string; areas: string[] }[],
  preliminary: { name: string; areas: string[] }[],
  quakes: QuakeReport[],
): Alert[] {
  const where = placeName(region);
  return [
    ...warnings.map(
      (w): Alert => ({
        kind: 'warning',
        title: `${w.name} 발효 중`,
        detail:
          (region === '전체'
            ? `경기도(${w.areas.join(', ')})에 ${w.name}가 발효 중이에요.`
            : `현재 ${where}에 ${w.name}가 발효 중이에요.`) +
          ` ${warningAdvice(w.name)}`,
      }),
    ),
    ...preliminary.map(
      (w): Alert => ({
        kind: 'preliminary',
        title: `${w.name} 예비특보`,
        detail: `${where}에 ${w.name}가 내려질 수 있어요. 미리 대비해 주세요. ${warningAdvice(w.name)}`,
      }),
    ),
    ...quakes.map(
      (q): Alert => ({
        kind: 'earthquake',
        title: `지진 발생 · 규모 ${q.magnitude.toFixed(1)}`,
        detail: `${q.location}에서 규모 ${q.magnitude.toFixed(1)} 지진이 있었어요${q.intensity ? ` (${q.intensity})` : ''}. 여진에 주의해 주세요.`,
      }),
    ),
  ];
}

/** 음성 원고 맨 앞에 붙일 안전 안내 문장. 알림이 없으면 빈 문자열. */
export function alertsSpeech(alerts: Alert[]): string {
  if (alerts.length === 0) return '';
  return `먼저 안전 안내예요. ${alerts.map((a) => a.detail).join(' ')}`;
}
