'use client';
import Image from 'next/image';
import { useEffect, useId, useState } from 'react';
import type { Place } from '@/lib/domain/catalog';

type RegionAnchor = { name: string; x: number; y: number };

const REGION_ANCHORS: RegionAnchor[] = [
  { name: '대야·소래산', x: 478, y: 38 },
  { name: '은계', x: 565, y: 92 },
  { name: '월곶', x: 310, y: 170 },
  { name: '장곡·갯골', x: 445, y: 205 },
  { name: '하중·호조벌', x: 625, y: 155 },
  { name: '물왕', x: 695, y: 240 },
  { name: '배곧', x: 235, y: 252 },
  { name: '정왕·옥구', x: 375, y: 330 },
  { name: '오이도', x: 115, y: 325 },
  { name: '거북섬', x: 72, y: 452 },
];

type PlaceMapProps = {
  places: Place[];
  visiblePlaces: Place[];
  routeIds: string[];
  onToggle?: (placeId: string) => void;
  onDetail: (place: Place) => void;
  records?: Record<string, { rating: number; note: string }>;
  onRecord?: (place: Place) => void;
  compact?: boolean;
};

export function PlaceMap({
  places,
  visiblePlaces,
  routeIds,
  onToggle,
  onDetail,
  records,
  onRecord,
  compact = false,
}: PlaceMapProps) {
  const mapId = useId();
  const seaGradient = `${mapId}-sea`;
  const landGradient = `${mapId}-land`;
  const [activeId, setActiveId] = useState<string | null>(
    routeIds[0] ?? visiblePlaces[0]?.id ?? null,
  );

  useEffect(() => {
    if (
      activeId &&
      (visiblePlaces.some((p) => p.id === activeId) ||
        routeIds.includes(activeId))
    ) {
      return;
    }
    setActiveId(routeIds[0] ?? visiblePlaces[0]?.id ?? null);
  }, [activeId, visiblePlaces, routeIds]);

  const visibleIds = new Set(visiblePlaces.map((p) => p.id));
  const routePlaces = routeIds
    .map((id) => places.find((p) => p.id === id))
    .filter((p): p is Place => Boolean(p));

  const mapPlaces = compact
    ? routePlaces
    : places.filter((p) => visibleIds.has(p.id) || routeIds.includes(p.id));

  const activePlace =
    places.find((p) => p.id === activeId) ??
    routePlaces[0] ??
    visiblePlaces[0] ??
    null;

  const polylinePoints = routePlaces
    .map((p) => `${p.coordinates.x},${p.coordinates.y}`)
    .join(' ');

  return (
    <div className={compact ? 'place-map-wrap compact' : 'place-map-wrap'}>
      <div className="map-toolbar">
        <div className="map-legend" aria-label="지도 범례">
          {!compact && (
            <span className="legend-item">
              <span className="legend-dot" aria-hidden="true" /> 관광지 (
              {visiblePlaces.length}곳)
            </span>
          )}
          <span className="legend-item">
            <span className="legend-dot route" aria-hidden="true" />{' '}
            {compact
              ? `여행 코스 (${routePlaces.length}곳)`
              : `담은 여행 동선 (${routePlaces.length}/8)`}
          </span>
          {records && (
            <span className="legend-item">
              <span className="legend-dot recorded" aria-hidden="true" /> 방문
              기록 완료
            </span>
          )}
        </div>
        <span className="map-caption">
          시흥시 권역·개략 위치도 (검토 전 시연 자료 · 실제 도로 경로 아님)
        </span>
      </div>

      <div
        className="map-canvas-shell"
        role="region"
        aria-label="시흥 관광지 인터랙티브 지도"
      >
        <svg
          className="siheung-map-svg"
          viewBox="0 0 800 520"
          role="img"
          aria-label="시흥시 권역별 관광지 위치와 여행 동선 지도"
        >
          <defs>
            <linearGradient id={seaGradient} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#dff0fa" />
              <stop offset="100%" stopColor="#eaf4fa" />
            </linearGradient>
            <linearGradient id={landGradient} x1="0" y1="0" x2="0.9" y2="1">
              <stop offset="0%" stopColor="#f8fbf9" />
              <stop offset="100%" stopColor="#eef6f2" />
            </linearGradient>
          </defs>

          {/* 서해 배경 */}
          <rect
            x="0"
            y="0"
            width="800"
            height="520"
            fill={`url(#${seaGradient})`}
            rx="12"
          />

          {/* 서해 물결 장식 */}
          <g stroke="#b8d9ed" strokeWidth="1.5" fill="none" opacity="0.7">
            <path d="M 28 120 Q 48 112 68 120 T 108 120" />
            <path d="M 45 220 Q 65 212 85 220 T 125 220" />
            <path d="M 24 490 Q 44 482 64 490 T 104 490" />
          </g>
          <text x="36" y="160" className="map-sea-label">
            서해 (황해)
          </text>
          <text x="235" y="488" className="map-sea-label">
            시화호
          </text>

          {/* 시흥 내륙 지형 폴리곤 */}
          <path
            d="M 380 18 L 620 18 L 765 95 L 778 330 L 665 435 L 435 430 L 315 398 L 220 385 L 135 415 L 102 385 L 128 340 L 210 325 L 245 268 L 318 182 L 352 105 Z"
            fill={`url(#${landGradient})`}
            stroke="#b9d5cb"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {/* 거북섬 (인공섬) 지형 */}
          <path
            d="M 96 426 Q 138 412 184 440 Q 186 476 142 482 Q 98 478 96 426 Z"
            fill="#f4faf7"
            stroke="#b9d5cb"
            strokeWidth="2.2"
          />

          {/* 시화방조제 연결선 (오이도 ~ 거북섬/대부도 방향) */}
          <path
            d="M 148 408 L 132 428"
            stroke="#9abcc9"
            strokeWidth="3"
            strokeDasharray="4 3"
          />

          {/* 갯골 생태 수로 & 호조벌 물길 */}
          <path
            d="M 332 196 Q 395 215 455 235 T 575 215"
            fill="none"
            stroke="#a5d1e8"
            strokeWidth="7"
            strokeLinecap="round"
            opacity="0.75"
          />
          <path
            d="M 455 235 Q 485 268 535 280"
            fill="none"
            stroke="#a5d1e8"
            strokeWidth="4.5"
            strokeLinecap="round"
            opacity="0.65"
          />

          {/* 은계호수 · 물왕호수 수면 표현 */}
          <ellipse
            cx="525"
            cy="116"
            rx="22"
            ry="11"
            fill="#bde0f2"
            stroke="#8ec2de"
            strokeWidth="1.2"
          />
          <ellipse
            cx="685"
            cy="276"
            rx="30"
            ry="15"
            fill="#bde0f2"
            stroke="#8ec2de"
            strokeWidth="1.2"
          />

          {/* 소래산 능선 표현 */}
          <path
            d="M 442 82 L 478 44 L 514 82 Z"
            fill="#dfeee6"
            stroke="#9ec4b3"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />

          {/* 권역 라벨 */}
          {REGION_ANCHORS.map((r) => (
            <text
              key={r.name}
              x={r.x}
              y={r.y}
              className="map-region-text"
              textAnchor="middle"
            >
              {r.name}
            </text>
          ))}

          {/* 여행 패스 동선 연결선 */}
          {routePlaces.length > 1 && (
            <g aria-hidden="true">
              <polyline
                points={polylinePoints}
                fill="none"
                stroke="#ffffff"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.9"
              />
              <polyline
                points={polylinePoints}
                fill="none"
                stroke="#1258a5"
                strokeWidth="3.5"
                strokeDasharray="8 5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )}

          {/* 관광지 마커 */}
          {mapPlaces.map((p) => {
            const routeIndex = routeIds.indexOf(p.id);
            const inRoute = routeIndex !== -1;
            const isActive = activePlace?.id === p.id;
            const isVisible = visibleIds.has(p.id);
            const hasRecord = Boolean(records && records[p.id]);
            const showLabel =
              isActive ||
              inRoute ||
              mapPlaces.length <= 8 ||
              [
                'PLACE_REAL_001',
                'PLACE_REAL_008',
                'PLACE_REAL_009',
                'PLACE_REAL_011',
                'PLACE_REAL_012',
              ].includes(p.id);

            const radius = isActive ? 16 : inRoute ? 14 : 10;
            const fill = hasRecord
              ? '#176b63'
              : inRoute
                ? '#1258a5'
                : isActive
                  ? '#176b63'
                  : '#ffffff';
            const stroke = isActive
              ? '#e79323'
              : inRoute || hasRecord
                ? '#ffffff'
                : '#176b63';
            const opacity = !compact && !isVisible && !inRoute ? 0.4 : 1;

            return (
              <g
                key={p.id}
                className={isActive ? 'map-marker active' : 'map-marker'}
                transform={`translate(${p.coordinates.x}, ${p.coordinates.y})`}
                role="button"
                tabIndex={0}
                aria-label={`${p.name} (${p.region})${inRoute ? ` · 코스 ${routeIndex + 1}번째` : ''}${hasRecord ? ' · 방문 기록 완료' : ''}`}
                aria-pressed={isActive}
                style={{ opacity }}
                onClick={() => setActiveId(p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveId(p.id);
                  }
                }}
              >
                {isActive && (
                  <circle
                    r={radius + 5}
                    fill="none"
                    stroke="#e79323"
                    strokeWidth="2.5"
                    opacity="0.85"
                  />
                )}
                <circle
                  r={radius}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isActive ? 3 : 2.2}
                />
                {inRoute ? (
                  <text
                    y="4"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="11"
                    fontWeight="800"
                  >
                    {routeIndex + 1}
                  </text>
                ) : (
                  <circle r="4" fill={isActive ? '#ffffff' : '#176b63'} />
                )}
                {showLabel && (
                  <g transform={`translate(0, ${radius + 14})`}>
                    <rect
                      x={-Math.max(p.name.length * 5.8 + 10, 44)}
                      y="-11"
                      width={Math.max(p.name.length * 11.6 + 20, 88)}
                      height="20"
                      rx="6"
                      fill={isActive ? '#183343' : '#ffffffeb'}
                      stroke={isActive ? '#183343' : '#cbe0ec'}
                      strokeWidth="1"
                    />
                    <text
                      y="3"
                      textAnchor="middle"
                      fill={isActive ? '#ffffff' : '#183343'}
                      fontSize="11"
                      fontWeight="700"
                    >
                      {inRoute ? `${routeIndex + 1}. ${p.name}` : p.name}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* 동선 요약 바 */}
      {routePlaces.length > 0 && (
        <div className="map-route-bar" aria-label="여행 동선 순서">
          <strong>{compact ? '여행 코스 순서' : '현재 담은 동선'}</strong>
          <ol className="map-route-steps">
            {routePlaces.map((p, idx) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={
                    activePlace?.id === p.id
                      ? 'route-chip active'
                      : 'route-chip'
                  }
                  onClick={() => setActiveId(p.id)}
                >
                  <span className="route-chip-num">{idx + 1}</span>
                  <span>{p.name}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* 선택된 마커 미니 카드 */}
      {activePlace ? (
        <article className="map-place-card" aria-live="polite">
          {activePlace.image ? (
            <button
              type="button"
              className="map-card-photo"
              onClick={() => onDetail(activePlace)}
              aria-label={`${activePlace.name} 상세 보기`}
            >
              <Image
                fill
                sizes="(max-width: 760px) calc(100vw - 36px), 210px"
                src={activePlace.image.path}
                alt={activePlace.image.alt}
                loading="lazy"
              />
            </button>
          ) : (
            <button
              type="button"
              className="map-card-photo no-photo-box"
              onClick={() => onDetail(activePlace)}
              aria-label={`${activePlace.name} 상세 보기`}
            >
              <span>시흥의 풍경</span>
            </button>
          )}
          <div className="map-card-body">
            <div className="map-card-meta">
              <span className="pill">{activePlace.region}</span>
              {routeIds.includes(activePlace.id) && (
                <span className="route-order-badge">
                  코스 {routeIds.indexOf(activePlace.id) + 1}번째
                </span>
              )}
              <span className="tags">
                {activePlace.tags.join(' · ') || '시흥 여행'}
              </span>
            </div>
            <h3>
              <button
                type="button"
                className="text-button"
                onClick={() => onDetail(activePlace)}
              >
                {activePlace.name}
              </button>
            </h3>
            <p>{activePlace.description}</p>
            <p className="map-card-address">
              주소: {activePlace.address || '상세 주소 미기재 (공식 출처 참고)'}{' '}
              · 북위 {activePlace.coordinates.lat.toFixed(4)}°, 동경{' '}
              {activePlace.coordinates.lng.toFixed(4)}°
            </p>
            {records && records[activePlace.id] && (
              <p className="map-card-record">
                방문 만족도 {'★'.repeat(records[activePlace.id].rating)} ·{' '}
                {records[activePlace.id].note || '방문을 기록했어요.'}
              </p>
            )}
            <div className="map-card-actions">
              <button
                type="button"
                className="detail-link"
                onClick={() => onDetail(activePlace)}
              >
                장소 정보
              </button>
              {onToggle && (
                <button
                  type="button"
                  className={
                    routeIds.includes(activePlace.id) ? 'add selected' : 'add'
                  }
                  aria-pressed={routeIds.includes(activePlace.id)}
                  onClick={() => onToggle(activePlace.id)}
                >
                  {routeIds.includes(activePlace.id)
                    ? '담기 취소'
                    : '여행에 담기'}
                </button>
              )}
              {onRecord && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onRecord(activePlace)}
                >
                  {records?.[activePlace.id] ? '기록 수정' : '방문 기록'}
                </button>
              )}
            </div>
          </div>
        </article>
      ) : (
        <div className="empty">
          <h3>표시할 관광지가 없어요.</h3>
          <p>검색어나 지역 필터를 조정해 보세요.</p>
        </div>
      )}
    </div>
  );
}
