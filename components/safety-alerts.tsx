'use client';
import { alertsResponseSchema } from '@/lib/domain/alerts';
import { useRegionQuery } from './assistant/shared';

/** 선택 지역의 기상특보·예비특보·최근 지진 안내(있을 때만 눈에 띄게 보여 준다). */
export function SafetyAlerts({ region }: { region: string }) {
  // 특보 조회 실패는 화면을 막지 않는다(안내 원고에도 넣지 않음).
  const { data } = useRegionQuery('/api/alerts', region, alertsResponseSchema);
  if (!data || data.mode !== 'live') return null;
  if (data.alerts.length === 0)
    return (
      <p className="safety-clear fine" role="status">
        ✓ 현재 이 지역에 발효 중인 기상특보나 최근 지진 소식이 없어요.
      </p>
    );
  return (
    <section
      className="safety-alerts"
      role="alert"
      aria-labelledby="safety-alerts-title"
    >
      <h2 id="safety-alerts-title">⚠ 안전 안내</h2>
      <ul>
        {data.alerts.map((a) => (
          <li key={`${a.kind}:${a.title}`} className={`safety-${a.kind}`}>
            <strong>{a.title}</strong>
            <span>{a.detail}</span>
          </li>
        ))}
      </ul>
      <p className="fine">
        출처: {data.source}. 최신 정보는 기상청·안전디딤돌 앱에서 확인해 주세요.
      </p>
    </section>
  );
}
