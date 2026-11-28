'use client';
import { PlaceImage } from './place-image';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Place } from '@/lib/domain/catalog';
import {
  loadNaverMaps,
  naverMapSearchUrl,
  normalizeNaverMapClientId,
  onNaverMapAuthFailure,
  type NaverMap,
  type NaverMapEventListener,
  type NaverMaps,
  type NaverMarker,
  type NaverPolyline,
} from '@/lib/adapters/naver-map';
import { gyeonggiMap } from '@/lib/domain/gyeonggi';

const DEFAULT_CENTER = { lat: 37.275, lng: 127.009 };

type Records = Record<string, { rating: number; note: string }>;

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const toLatLng = (maps: NaverMaps, p: { lat: number; lng: number }) =>
  new maps.LatLng(p.lat, p.lng);

function markerState(
  place: Place,
  routeIndexById: Map<string, number>,
  visibleIds: Set<string>,
  activeId: string | null,
  records: Records | undefined,
  compact: boolean,
) {
  const routeIndex = routeIndexById.get(place.id) ?? -1;
  const inRoute = routeIndex !== -1;
  const isActive = activeId === place.id;
  const hasRecord = Boolean(records?.[place.id]);
  const isDim = !compact && !visibleIds.has(place.id) && !inRoute;
  const showLabel = isActive || inRoute;
  return { routeIndex, inRoute, isActive, hasRecord, isDim, showLabel };
}

function fitMapToPlaces(maps: NaverMaps, map: NaverMap, places: Place[]) {
  if (places.length <= 1) {
    map.setCenter(toLatLng(maps, places[0]?.coordinates ?? DEFAULT_CENTER));
    map.setZoom(places.length ? 14 : 12, false);
    return;
  }
  const first = toLatLng(maps, places[0].coordinates);
  const bounds = new maps.LatLngBounds(first, first);
  for (const place of places.slice(1))
    bounds.extend(toLatLng(maps, place.coordinates));
  map.fitBounds(bounds, { top: 48, right: 48, bottom: 56, left: 48 });
}

function markerHtml(
  name: string,
  state: ReturnType<typeof markerState>,
): string {
  const classes = [
    'nm-pin',
    state.inRoute && 'is-route',
    state.hasRecord && 'is-recorded',
    state.isActive && 'is-active',
    state.isDim && 'is-dim',
  ]
    .filter(Boolean)
    .join(' ');
  const labelText = state.inRoute ? `${state.routeIndex + 1}. ${name}` : name;
  const dot = state.inRoute
    ? `<span>${state.routeIndex + 1}</span>`
    : '<span class="nm-dot-core"></span>';
  const label = state.showLabel
    ? `<span class="nm-label">${escapeHtml(labelText)}</span>`
    : '';
  return `<div class="${classes}" title="${escapeHtml(name)}"><span class="nm-dot">${dot}</span>${label}</div>`;
}

function NaverMapCanvas({
  clientId,
  compact,
  mapPlaces,
  routePlaces,
  routeIndexById,
  visibleIds,
  activeId,
  records,
  onSelect,
  onStatusChange,
  onFallback,
}: {
  clientId: string;
  compact: boolean;
  mapPlaces: Place[];
  routePlaces: Place[];
  routeIndexById: Map<string, number>;
  visibleIds: Set<string>;
  activeId: string | null;
  records?: Records;
  onSelect: (placeId: string) => void;
  onStatusChange: (status: 'loading' | 'ready') => void;
  onFallback: (reason: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapsRef = useRef<NaverMaps | null>(null);
  const mapRef = useRef<NaverMap | null>(null);
  const overlaysRef = useRef<{
    markers: NaverMarker[];
    listeners: NaverMapEventListener[];
    polylines: NaverPolyline[];
  }>({ markers: [], listeners: [], polylines: [] });
  const boundsRef = useRef<{ key: string; activeId: string | null }>({
    key: '',
    activeId: null,
  });
  const latestRef = useRef({ mapPlaces, onSelect, onStatusChange, onFallback });
  latestRef.current = { mapPlaces, onSelect, onStatusChange, onFallback };
  const [ready, setReady] = useState(false);

  const clearOverlays = useCallback(() => {
    const { markers, listeners, polylines } = overlaysRef.current;
    listeners.forEach((l) => mapsRef.current?.Event.removeListener(l));
    markers.forEach((m) => m.setMap(null));
    polylines.forEach((p) => p.setMap(null));
    overlaysRef.current = { markers: [], listeners: [], polylines: [] };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let hadSize = false;
    setReady(false);
    latestRef.current.onStatusChange('loading');

    const teardown = () => {
      clearOverlays();
      mapRef.current?.destroy();
      mapRef.current = null;
      mapsRef.current = null;
      boundsRef.current = { key: '', activeId: null };
    };
    const fail = (reason: string) => {
      if (cancelled) return;
      teardown();
      setReady(false);
      latestRef.current.onFallback(reason);
    };

    const unsubscribeAuth = onNaverMapAuthFailure(() =>
      fail(
        '네이버 지도 인증에 실패해 개략 위치도로 전환했습니다. API 키와 Web 서비스 URL 설정을 확인해 주세요.',
      ),
    );

    loadNaverMaps(clientId)
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        const element = containerRef.current;
        const first =
          latestRef.current.mapPlaces[0]?.coordinates ?? DEFAULT_CENTER;
        const map = new maps.Map(element, {
          center: toLatLng(maps, first),
          zoom: 12,
          minZoom: 9,
          maxZoom: 18,
          zoomControl: true,
          zoomControlOptions: maps.Position?.TOP_RIGHT
            ? { position: maps.Position.TOP_RIGHT }
            : undefined,
          mapDataControl: true,
          scaleControl: true,
        });
        mapsRef.current = maps;
        mapRef.current = map;
        boundsRef.current = { key: '', activeId: null };
        hadSize = element.clientWidth > 0 && element.clientHeight > 0;

        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (!rect?.width || !rect.height) return;
            maps.Event.trigger(map, 'resize');
            if (!hadSize) {
              hadSize = true;
              fitMapToPlaces(maps, map, latestRef.current.mapPlaces);
            }
          });
          observer.observe(element);
        }
        setReady(true);
        latestRef.current.onStatusChange('ready');
      })
      .catch(() =>
        fail(
          '네이버 지도를 불러오지 못해 개략 위치도로 전환했습니다. 네트워크와 API 키 설정을 확인해 주세요.',
        ),
      );

    return () => {
      cancelled = true;
      unsubscribeAuth();
      observer?.disconnect();
      teardown();
    };
  }, [clientId, clearOverlays]);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!ready || !maps || !map) return;

    clearOverlays();
    const polylines: NaverPolyline[] = [];
    if (routePlaces.length > 1) {
      const path = routePlaces.map((p) => toLatLng(maps, p.coordinates));
      const base = {
        map,
        path,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      };
      polylines.push(
        new maps.Polyline({
          ...base,
          strokeColor: '#ffffff',
          strokeOpacity: 0.9,
          strokeWeight: 7,
          zIndex: 20,
        }),
        new maps.Polyline({
          ...base,
          strokeColor: '#03c75a',
          strokeOpacity: 0.95,
          strokeWeight: 3.5,
          strokeStyle: 'shortdash',
          zIndex: 30,
        }),
      );
    }

    const markers: NaverMarker[] = [];
    const listeners: NaverMapEventListener[] = [];
    for (const place of mapPlaces) {
      const state = markerState(
        place,
        routeIndexById,
        visibleIds,
        activeId,
        records,
        compact,
      );
      const marker = new maps.Marker({
        map,
        position: toLatLng(maps, place.coordinates),
        title: place.name,
        zIndex: state.isActive ? 300 : state.inRoute ? 200 : 100,
        icon: {
          content: markerHtml(place.name, state),
          anchor: new maps.Point(16, 16),
        },
      });
      markers.push(marker);
      listeners.push(
        maps.Event.addListener(marker, 'click', () =>
          latestRef.current.onSelect(place.id),
        ),
      );
    }
    overlaysRef.current = { markers, listeners, polylines };

    const key = mapPlaces.map((p) => p.id).join('|');
    if (key !== boundsRef.current.key) {
      boundsRef.current = { key, activeId };
      fitMapToPlaces(maps, map, mapPlaces);
    } else if (activeId && activeId !== boundsRef.current.activeId) {
      boundsRef.current.activeId = activeId;
      const target = mapPlaces.find((p) => p.id === activeId);
      if (target) map.panTo(toLatLng(maps, target.coordinates));
    }
  }, [
    ready,
    compact,
    mapPlaces,
    routePlaces,
    routeIndexById,
    visibleIds,
    activeId,
    records,
    clearOverlays,
  ]);

  return (
    <div
      className={compact ? 'naver-map-stage compact' : 'naver-map-stage'}
      data-map-provider="naver"
    >
      <div
        ref={containerRef}
        className="naver-map-canvas"
        role="application"
        aria-label="네이버 지도 — 경기도 관광지 위치와 여행 동선"
      />
      {!ready && (
        <div className="naver-map-loading" role="status" aria-live="polite">
          네이버 지도를 불러오는 중입니다…
        </div>
      )}
      {ready && mapPlaces.length > 0 && (
        <button
          type="button"
          className="naver-map-fit-btn"
          onClick={() =>
            mapsRef.current &&
            mapRef.current &&
            fitMapToPlaces(mapsRef.current, mapRef.current, mapPlaces)
          }
        >
          전체 보기
        </button>
      )}
    </div>
  );
}

function FallbackSvg({
  mapId,
  compact,
  mapPlaces,
  routePlaces,
  routeIndexById,
  visibleIds,
  activePlace,
  records,
  onSelect,
}: {
  mapId: string;
  compact: boolean;
  mapPlaces: Place[];
  routePlaces: Place[];
  routeIndexById: Map<string, number>;
  visibleIds: Set<string>;
  activePlace: Place | null;
  records?: Records;
  onSelect: (placeId: string) => void;
}) {
  const bgGradient = `${mapId}-bg`;
  const landGradient = `${mapId}-land`;
  const polylinePoints = routePlaces
    .map((p) => `${p.coordinates.x},${p.coordinates.y}`)
    .join(' ');
  const activeId = activePlace?.id ?? null;
  const orderedMarkers = mapPlaces
    .map((p) => ({
      p,
      s: markerState(p, routeIndexById, visibleIds, activeId, records, compact),
    }))
    .sort((a, b) => {
      const rank = (m: typeof a) => (m.s.isActive ? 2 : m.s.inRoute ? 1 : 0);
      return rank(a) - rank(b);
    });

  return (
    <svg
      className="place-map-svg"
      viewBox="0 0 800 520"
      role="img"
      aria-label="경기도 관광지 위치와 여행 동선 개략 지도"
    >
      <defs>
        <linearGradient id={bgGradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e8fbf2" />
          <stop offset="100%" stopColor="#e6faf9" />
        </linearGradient>
        <linearGradient id={landGradient} x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#fafefd" />
          <stop offset="100%" stopColor="#e5f7f2" />
        </linearGradient>
      </defs>

      <rect width="800" height="520" fill={`url(#${bgGradient})`} rx="12" />
      <g
        transform="translate(133.333333 20) scale(0.666666667)"
        aria-hidden="true"
      >
        <path
          d={gyeonggiMap.context.path}
          fill="#e5efec"
          stroke="#c0d8d1"
          fillRule="evenodd"
        />
        <g fill={`url(#${landGradient})`} stroke="#a7e1cd" strokeWidth="1.5">
          {gyeonggiMap.cities.map((city) => (
            <path key={city.id} d={city.path} fillRule="evenodd" />
          ))}
        </g>
      </g>

      {routePlaces.length > 1 && (
        <g
          aria-hidden="true"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline
            points={polylinePoints}
            stroke="#ffffff"
            strokeWidth="7"
            opacity="0.9"
          />
          <polyline
            points={polylinePoints}
            stroke="#03c75a"
            strokeWidth="3.5"
            strokeDasharray="8 5"
          />
        </g>
      )}

      {orderedMarkers.map(({ p, s }) => {
        const pt = p.coordinates;
        const radius = s.inRoute ? (s.isActive ? 11 : 9) : s.isActive ? 7 : 4;
        const fill =
          s.hasRecord || (s.isActive && !s.inRoute) ? '#046858' : '#03c75a';
        const stroke = s.isActive ? '#e79323' : '#ffffff';
        const boxHalf = Math.max(p.name.length * 5.8 + 10, 44);

        return (
          <g
            key={p.id}
            className={s.isActive ? 'map-marker active' : 'map-marker'}
            transform={`translate(${pt.x}, ${pt.y})`}
            role="button"
            tabIndex={0}
            aria-label={`${p.name} (${p.region})${s.inRoute ? ` · 코스 ${s.routeIndex + 1}번째` : ''}${s.hasRecord ? ' · 방문 기록 완료' : ''}`}
            aria-pressed={s.isActive}
            style={{ opacity: s.isDim ? 0.35 : 1 }}
            onClick={() => onSelect(p.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(p.id);
              }
            }}
          >
            {s.isActive && (
              <circle
                r={radius + 4}
                fill="none"
                stroke="#e79323"
                strokeWidth="2"
                opacity="0.9"
              />
            )}
            <circle
              r={radius}
              fill={fill}
              stroke={stroke}
              strokeWidth={s.isActive ? 2.2 : s.inRoute ? 1.8 : 1.2}
            />
            {s.inRoute ? (
              <text
                y="3.5"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="10"
                fontWeight="800"
              >
                {s.routeIndex + 1}
              </text>
            ) : (
              s.isActive && <circle r="2.5" fill="#ffffff" />
            )}
            {s.showLabel && (
              <g transform={`translate(0, ${radius + 14})`}>
                <rect
                  x={-boxHalf}
                  y="-11"
                  width={boxHalf * 2}
                  height="20"
                  rx="6"
                  fill={s.isActive ? '#122922' : '#ffffffeb'}
                  stroke={s.isActive ? '#122922' : '#aeead8'}
                  strokeWidth="1"
                />
                <text
                  y="3"
                  textAnchor="middle"
                  fill={s.isActive ? '#ffffff' : '#122922'}
                  fontSize="11"
                  fontWeight="700"
                >
                  {s.inRoute ? `${s.routeIndex + 1}. ${p.name}` : p.name}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function PlaceMap({
  places,
  visiblePlaces,
  routeIds,
  onToggle,
  onDetail,
  records,
  onRecord,
  compact = false,
  naverMapClientId = '',
}: {
  places: Place[];
  visiblePlaces: Place[];
  routeIds: string[];
  onToggle?: (placeId: string) => void;
  onDetail: (place: Place) => void;
  records?: Records;
  onRecord?: (place: Place) => void;
  compact?: boolean;
  naverMapClientId?: string;
}) {
  const mapId = useId();
  const clientId = normalizeNaverMapClientId(naverMapClientId);
  const [naverStatus, setNaverStatus] = useState<'loading' | 'ready'>(
    'loading',
  );
  const [fallbackReason, setFallbackReason] = useState('');
  const [activeId, setActiveId] = useState<string | null>(
    routeIds[0] ?? visiblePlaces[0]?.id ?? null,
  );

  useEffect(() => {
    setFallbackReason('');
    setNaverStatus('loading');
  }, [clientId]);

  useEffect(() => {
    if (
      activeId &&
      (visiblePlaces.some((p) => p.id === activeId) ||
        routeIds.includes(activeId))
    )
      return;
    setActiveId(routeIds[0] ?? visiblePlaces[0]?.id ?? null);
  }, [activeId, visiblePlaces, routeIds]);

  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const visibleIds = useMemo(
    () => new Set(visiblePlaces.map((p) => p.id)),
    [visiblePlaces],
  );
  const routeIndexById = useMemo(
    () => new Map(routeIds.map((id, idx) => [id, idx])),
    [routeIds],
  );
  const routePlaces = useMemo(
    () =>
      routeIds.map((id) => byId.get(id)).filter((p): p is Place => Boolean(p)),
    [routeIds, byId],
  );
  const mapPlaces = useMemo(
    () =>
      compact
        ? routePlaces
        : places.filter(
            (p) => visibleIds.has(p.id) || routeIndexById.has(p.id),
          ),
    [compact, routePlaces, places, visibleIds, routeIndexById],
  );
  const activePlace =
    (activeId ? byId.get(activeId) : undefined) ??
    routePlaces[0] ??
    visiblePlaces[0] ??
    null;

  const useNaverMap = Boolean(clientId) && !fallbackReason;
  const captionText = useNaverMap
    ? naverStatus === 'ready'
      ? '네이버 지도 · 경기도 관광지 위치 및 직선 동선'
      : '네이버 지도를 불러오는 중입니다'
    : fallbackReason
      ? '개략 위치도 폴백'
      : '경기도 관광지 위치도';
  const activeRouteIdx = activePlace
    ? (routeIndexById.get(activePlace.id) ?? -1)
    : -1;
  const activeRecord = activePlace ? records?.[activePlace.id] : undefined;

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
        <span className="map-caption">{captionText}</span>
      </div>

      {fallbackReason && (
        <p className="naver-map-notice" role="status">
          {fallbackReason}
        </p>
      )}

      <div
        className="map-canvas-shell"
        role="region"
        aria-label={
          useNaverMap
            ? '경기 관광지 네이버 지도'
            : '경기 관광지 인터랙티브 개략 지도'
        }
      >
        {useNaverMap ? (
          <NaverMapCanvas
            clientId={clientId}
            compact={compact}
            mapPlaces={mapPlaces}
            routePlaces={routePlaces}
            routeIndexById={routeIndexById}
            visibleIds={visibleIds}
            activeId={activePlace?.id ?? null}
            records={records}
            onSelect={setActiveId}
            onStatusChange={setNaverStatus}
            onFallback={setFallbackReason}
          />
        ) : (
          <FallbackSvg
            mapId={mapId}
            compact={compact}
            mapPlaces={mapPlaces}
            routePlaces={routePlaces}
            routeIndexById={routeIndexById}
            visibleIds={visibleIds}
            activePlace={activePlace}
            records={records}
            onSelect={setActiveId}
          />
        )}
      </div>

      {useNaverMap && mapPlaces.length > 1 && (
        <div className="map-place-picker">
          <label htmlFor={`${mapId}-picker`}>지도 장소 선택</label>
          <select
            id={`${mapId}-picker`}
            value={activePlace?.id ?? ''}
            onChange={(e) => setActiveId(e.target.value || null)}
          >
            {mapPlaces.map((place) => {
              const idx = routeIndexById.get(place.id) ?? -1;
              return (
                <option key={place.id} value={place.id}>
                  {idx !== -1 ? `${idx + 1}. ` : ''}
                  {place.name} ({place.region})
                </option>
              );
            })}
          </select>
        </div>
      )}

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

      {activePlace ? (
        <article className="map-place-card" aria-live="polite">
          <button
            type="button"
            className={
              activePlace.image
                ? 'map-card-photo'
                : 'map-card-photo no-photo-box'
            }
            onClick={() => onDetail(activePlace)}
            aria-label={`${activePlace.name} 상세 보기`}
          >
            <PlaceImage
              sizes="(max-width: 760px) calc(100vw - 36px), 210px"
              image={activePlace.image}
              fallback={<span className="no-photo">경기도의 풍경</span>}
            />
          </button>
          <div className="map-card-body">
            <div className="map-card-meta">
              <span className="pill">{activePlace.region}</span>
              {activeRouteIdx !== -1 && (
                <span className="route-order-badge">
                  코스 {activeRouteIdx + 1}번째
                </span>
              )}
              <span className="tags">
                {activePlace.tags.join(' · ') || '경기 여행'}
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
            {activeRecord && (
              <p className="map-card-record">
                방문 만족도 {'★'.repeat(activeRecord.rating)} ·{' '}
                {activeRecord.note || '방문을 기록했어요.'}
              </p>
            )}
            <div className="map-card-actions">
              <div className="map-card-links">
                <button
                  type="button"
                  className="detail-link"
                  onClick={() => onDetail(activePlace)}
                >
                  장소 상세
                </button>
                <a
                  className="map-external-link"
                  href={naverMapSearchUrl(activePlace)}
                  target="_blank"
                  rel="noreferrer"
                >
                  네이버 지도 ↗
                </a>
              </div>
              {onToggle && (
                <button
                  type="button"
                  className={activeRouteIdx !== -1 ? 'add selected' : 'add'}
                  aria-pressed={activeRouteIdx !== -1}
                  onClick={() => onToggle(activePlace.id)}
                >
                  {activeRouteIdx !== -1 ? '담기 취소' : '여행에 담기'}
                </button>
              )}
              {onRecord && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onRecord(activePlace)}
                >
                  {activeRecord ? '기록 수정' : '방문 기록'}
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
