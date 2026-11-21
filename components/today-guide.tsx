'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/adapters/client-api';
import type { Place } from '@/lib/domain/catalog';
import {
  WEATHER_REGIONS,
  weatherResponseSchema,
  type WeatherResponse,
} from '@/lib/domain/weather';
import type { BriefingOutput } from '@/lib/domain/briefing';
import type { Capabilities } from './assistant/shared';
import { GyeonggiMapPanel } from './gyeonggi-map';
import { OutfitCard } from './outfit-card';
import { PlaceCard } from './place-card';
import { WeatherBriefing } from './weather-briefing';
import { WeatherRestaurants } from './weather-restaurants';
import { SafetyAlerts } from './safety-alerts';

const regionForCity = (cityId: string | null) =>
  Object.keys(WEATHER_REGIONS).find(
    (name) => WEATHER_REGIONS[name].cityId === cityId,
  ) ?? '전체';

/**
 * 여행 도우미 — 오늘의 안내.
 * 지도에서 시·군 선택 → 안내 원고·음성 → 간단한 날씨·옷차림 → 추천 명소·맛집 순서로 보여 준다.
 */
export function TodayGuide({
  places,
  selection,
  selectedCityId,
  onSelectCity,
  onDetail,
  onToggle,
  capabilities,
}: {
  places: Place[];
  selection: string[];
  selectedCityId: string | null;
  onSelectCity: (cityId: string | null) => void;
  onDetail: (place: Place) => void;
  onToggle: (placeId: string) => void;
  capabilities?: Capabilities;
}) {
  const region = regionForCity(selectedCityId);
  const place = region === '전체' ? '경기도' : region;
  const [state, setState] = useState<{
    region: string;
    data?: WeatherResponse;
    error?: string;
  }>({ region });
  // 안내 원고가 말한 명소·맛집(순서·추천 이유를 화면 카드에 그대로 쓴다)
  const [briefing, setBriefing] = useState<BriefingOutput | null>(null);

  useEffect(() => {
    let active = true;
    setState({ region });
    api(`/api/weather?region=${encodeURIComponent(region)}`)
      .then((r) => {
        const data = weatherResponseSchema.parse(r);
        if (active && data.region === region) setState({ region, data });
      })
      .catch((e) => {
        if (active) setState({ region, error: (e as Error).message });
      });
    return () => {
      active = false;
    };
  }, [region]);

  const weather = state.region === region ? state.data : undefined;
  const spoken = briefing?.region === region ? briefing : null;
  // 원고가 오면 원고가 말한 순서·이유로, 오기 전에는 날씨 추천 순서(최대 3곳)로 보여 준다.
  const spots = (
    spoken
      ? spoken.places
      : (weather?.recommendedPlaceIds ?? [])
          .slice(0, 3)
          .map((id) => ({ id, reason: '' }))
  )
    .map(({ id, reason }) => ({
      place: places.find((p) => p.id === id),
      reason,
    }))
    .filter((s): s is { place: Place; reason: string } => Boolean(s.place));

  return (
    <div className="today-guide">
      {/* 홈(경기 둘러보기)과 같은 제목·지도 구성 */}
      <section
        className="city-explorer today-main"
        aria-labelledby="today-title"
      >
        <div className="city-explorer-heading">
          <div>
            <span className="city-explorer-eyebrow">여행 도우미</span>
            <h2 id="today-title">
              지도에서 도시를 골라 오늘의 안내를 받아 보세요
            </h2>
            <p>
              안전 안내·날씨·옷차림·추천 명소·맛집을 정리하고 1분 음성으로
              들려드려요.
            </p>
          </div>
          <span className="city-explorer-region-count">
            경기도 31개 시·군 안내
          </span>
        </div>
        {/* 홈과 같은 지도(날씨 카드는 지도 안 오른쪽 위, 선택 상자는 아래) */}
        <GyeonggiMapPanel
          selectedCityId={selectedCityId}
          onSelectCity={onSelectCity}
        />
      </section>

      {/* 지도 아래 가로로 넓게: 재난·안전 안내 */}
      <SafetyAlerts region={region} />

      {/* 지도 아래 가로로 넓게: 오늘의 안내(원고·음성) */}
      <WeatherBriefing
        region={region}
        capabilities={capabilities}
        onLoaded={setBriefing}
      />

      {weather && (
        <OutfitCard outfit={weather.outfit} demo={weather.mode === 'demo'} />
      )}

      <section className="today-spots" aria-labelledby="today-spots-title">
        <div className="weather-outfit-heading">
          <h2 id="today-spots-title">추천 관광 명소</h2>
          {weather && (
            <span className="pill">
              {weather.advisory.suitability === 'indoor'
                ? '실내 위주'
                : weather.advisory.suitability === 'mixed'
                  ? '실내외 함께'
                  : '야외 산책'}
            </span>
          )}
        </div>
        {spots.length > 0 ? (
          <div className="weather-place-grid">
            {spots.map(({ place: p, reason }) => (
              <div key={p.id} className="today-spot">
                {reason && <p className="today-spot-reason">{reason}</p>}
                <PlaceCard
                  place={p}
                  selected={selection.includes(p.id)}
                  onDetail={onDetail}
                  onToggle={onToggle}
                />
              </div>
            ))}
          </div>
        ) : (
          weather && <p className="fine">이 지역의 추천 장소가 아직 없어요.</p>
        )}
      </section>

      <WeatherRestaurants
        region={region}
        limit={spoken ? spoken.restaurants.length || 3 : 3}
      />
    </div>
  );
}
