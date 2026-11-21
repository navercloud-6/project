import {
  ALERT_CACHE_MS,
  QUAKE_WINDOW_MS,
  alertsResponseSchema,
  buildAlerts,
  quakesToReport,
  warningsFor,
  type AlertsResponse,
  type QuakeReport,
} from '@/lib/domain/alerts';
import { weatherQuerySchema } from '@/lib/domain/weather';
import type { AlertPort } from './ports';

const SOURCE = '기상청 기상특보·지진정보 (공공데이터포털)';

/**
 * 시·군 안전 알림: 기상청 특보 발효 현황에서 선택 지역의 주의보·경보·예비특보를 찾고,
 * 최근 24시간 국내 지진을 더한다. 전국 자료라 10분간 한 번만 받아 모든 지역이 같이 쓴다.
 * 지진 조회가 실패해도(활용신청 전 등) 특보 안내는 계속한다.
 */
export function createAlerts(port: AlertPort) {
  let status: {
    at: number;
    value: Awaited<ReturnType<AlertPort['status']>>;
  } | null = null;
  let quakes: { at: number; value: QuakeReport[] } | null = null;

  return async function fetchAlerts(regionInput = '전체') {
    const { region } = weatherQuerySchema.parse({ region: regionInput });
    if (!port.configured())
      return alertsResponseSchema.parse({
        region,
        mode: 'unavailable',
        source: SOURCE,
        issuedAt: null,
        message: '특보·지진 안내는 공공데이터포털 인증키 설정 후 제공됩니다.',
        alerts: [],
      });
    const now = port.now();
    if (!status || now - status.at >= ALERT_CACHE_MS)
      status = { at: now, value: await port.status() };
    if (!quakes || now - quakes.at >= ALERT_CACHE_MS)
      quakes = {
        at: now,
        value: await port.quakes(now - QUAKE_WINDOW_MS).catch(() => []),
      };
    const alerts = buildAlerts(
      region,
      warningsFor(status.value.current, region),
      warningsFor(status.value.preliminary, region),
      quakesToReport(quakes.value, now),
    );
    return alertsResponseSchema.parse({
      region,
      mode: 'live',
      source: SOURCE,
      issuedAt: status.value.issuedAt,
      message: null,
      alerts,
    }) satisfies AlertsResponse;
  };
}
