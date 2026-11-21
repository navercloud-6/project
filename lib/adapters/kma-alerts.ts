import { z } from 'zod';
import type { AlertPort } from '@/lib/application/ports';
import { ApplicationError } from '@/lib/domain/errors';
import { DOMESTIC_QUAKE_TYPES, type QuakeReport } from '@/lib/domain/alerts';

// 공공데이터포털(data.go.kr) 기상청 API. 비용 무료, 개발계정 하루 10,000건.
const STATUS_URL =
  'https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus';
const QUAKE_URL = 'https://apis.data.go.kr/1360000/EqkInfoService/getEqkMsg';

const configured = () => Boolean(process.env.DATA_GO_KR_SERVICE_KEY);

async function get(base: string, params: Record<string, string>) {
  if (!configured())
    throw new ApplicationError(
      'UNAVAILABLE',
      '공공데이터포털 인증키 설정이 필요합니다.',
    );
  const url = new URL(base);
  url.searchParams.set('serviceKey', process.env.DATA_GO_KR_SERVICE_KEY!);
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('dataType', 'JSON');
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetch(url.href, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ApplicationError(
      'UPSTREAM_TIMEOUT',
      '기상청 응답이 지연되었습니다.',
    );
  }
  const body = await response.json().catch(() => null);
  const code = body?.response?.header?.resultCode;
  // 03 = 자료 없음(특보·지진이 없는 경우)
  if (!response.ok || (code !== '00' && code !== '03'))
    throw new ApplicationError(
      'UPSTREAM_INVALID',
      '기상청 특보·지진 정보를 확인할 수 없습니다.',
    );
  return body.response.body?.items?.item ?? [];
}

const statusItem = z.object({
  t6: z.string().optional().default(''),
  t7: z.string().optional().default(''),
  tmFc: z.union([z.string(), z.number()]).optional(),
});
const quakeItem = z.object({
  loc: z.string().optional().default(''),
  mt: z.union([z.string(), z.number()]).optional(),
  inT: z.string().optional().default(''),
  tmEqk: z.union([z.string(), z.number()]),
  fcTp: z.union([z.string(), z.number()]).optional(),
});

/** 'yyyyMMddHHmm(ss)' 한국 시각 → epoch ms */
export function kstTime(value: string | number): number {
  const s = String(value).padEnd(14, '0');
  return (
    Date.UTC(
      Number(s.slice(0, 4)),
      Number(s.slice(4, 6)) - 1,
      Number(s.slice(6, 8)),
      Number(s.slice(8, 10)),
      Number(s.slice(10, 12)),
      Number(s.slice(12, 14)),
    ) -
    9 * 60 * 60 * 1000
  );
}

const kstDay = (ms: number) =>
  new Date(ms + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');

export const kmaAlerts: AlertPort = {
  now: () => Date.now(),
  configured,
  async status() {
    const items = z
      .array(statusItem)
      .safeParse([await get(STATUS_URL, { numOfRows: '1' })].flat());
    if (!items.success || items.data.length === 0)
      return { current: '', preliminary: '', issuedAt: null };
    const [item] = items.data;
    return {
      current: item.t6,
      preliminary: item.t7,
      issuedAt: item.tmFc ? new Date(kstTime(item.tmFc)).toISOString() : null,
    };
  },
  async quakes(from) {
    const items = z.array(quakeItem).safeParse(
      [
        await get(QUAKE_URL, {
          numOfRows: '20',
          fromTmFc: kstDay(from),
          toTmFc: kstDay(Date.now()),
        }),
      ].flat(),
    );
    if (!items.success) return [];
    return items.data.map(
      (q): QuakeReport => ({
        time: kstTime(q.tmEqk),
        location: q.loc,
        magnitude: Number(q.mt ?? 0),
        intensity: q.inT,
        domestic: DOMESTIC_QUAKE_TYPES.has(Number(q.fcTp)),
      }),
    );
  },
};
