'use client';
import { useState } from 'react';
import { GyeonggiMapPanel } from './gyeonggi-map';
import { PlaceCard } from './place-card';
import { OutfitCard } from './outfit-card';
import { WeatherSymbol } from './weather-symbol';
import { useRegionQuery } from './assistant/shared';
import {
  placeById,
  places as catalogPlaces,
  type Place,
} from '@/lib/domain/catalog';
import {
  regionForCity,
  weatherResponseSchema,
  type WeatherResponse,
} from '@/lib/domain/weather';

const DAY_LABEL_FORMAT = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
});

function formatDayLabel(dateStr: string, index: number): string {
  if (index === 0) return '오늘';
  if (index === 1) return '내일';
  const parsed = new Date(`${dateStr}T00:00:00+09:00`);
  if (isNaN(parsed.getTime())) return dateStr;
  return DAY_LABEL_FORMAT.format(parsed);
}

const SUITABILITY_LABEL: Record<
  WeatherResponse['advisory']['suitability'],
  string
> = {
  outdoor: '야외 산책 추천',
  mixed: '실내외 병행 추천',
  indoor: '실내 관람 추천',
};

type WeatherPanelProps = {
  selectedCityId: string | null;
  onSelectCity: (cityId: string | null) => void;
  places: Place[];
  selection: string[];
  onTogglePlace: (placeId: string) => void;
  onDetailPlace: (place: Place) => void;
  onExploreRegion: (region: string) => void;
};

export type WeatherPanelState =
  | { region: string; status: 'loading' }
  | { region: string; status: 'error'; error: string }
  | { region: string; status: 'ready'; data: WeatherResponse };

export function WeatherPanel(props: WeatherPanelProps) {
  const selectedRegion = regionForCity(props.selectedCityId);
  const [retryKey, setRetryKey] = useState(0);
  const query = useRegionQuery(
    '/api/weather',
    selectedRegion,
    weatherResponseSchema,
    retryKey,
  );
  const state: WeatherPanelState = query.data
    ? { region: selectedRegion, status: 'ready', data: query.data }
    : query.error
      ? { region: selectedRegion, status: 'error', error: query.error }
      : { region: selectedRegion, status: 'loading' };

  return (
    <WeatherPanelView
      {...props}
      state={state}
      onRetry={() => setRetryKey((key) => key + 1)}
    />
  );
}

export function WeatherPanelView({
  selectedCityId,
  onSelectCity,
  places,
  selection,
  onTogglePlace,
  onDetailPlace,
  onExploreRegion,
  state,
  onRetry,
}: WeatherPanelProps & { state: WeatherPanelState; onRetry: () => void }) {
  const selectedRegion = regionForCity(selectedCityId);
  const loading = state.region !== selectedRegion || state.status === 'loading';
  const error = !loading && state.status === 'error' ? state.error : '';
  const weather =
    !loading && state.status === 'ready' && state.data.region === selectedRegion
      ? state.data
      : null;

  const recommendedIds = weather?.recommendedPlaceIds ?? [];
  const lookup =
    places === catalogPlaces
      ? placeById
      : recommendedIds.length > 0
        ? new Map(places.map((p) => [p.id, p]))
        : null;
  const recommendedPlaces = lookup
    ? recommendedIds
        .map((id) => lookup.get(id))
        .filter((p): p is Place => Boolean(p))
    : [];
  const selectionSet = new Set(selection);

  return (
    <div className="weather-page" aria-busy={loading}>
      <div className="section-heading">
        <div>
          <span className="pill">경기도 시·군별 기상과 외출 가이드</span>
          <h1>경기 날씨</h1>
          <p>
            경기도 31개 시·군의 현재 기온·바람·5일 예보를 확인하고 날씨에
            어울리는 장소를 담아 보세요.
          </p>
        </div>
      </div>

      <section
        className="city-explorer weather-map-section"
        aria-label="경기도 시·군 선택 지도"
      >
        <GyeonggiMapPanel
          selectedCityId={selectedCityId}
          onSelectCity={onSelectCity}
        />
      </section>

      {error && (
        <div role="alert" className="tool-error">
          <span>{error}</span>
          <button type="button" className="secondary compact" onClick={onRetry}>
            다시 시도
          </button>
        </div>
      )}

      {loading ? (
        <div className="empty" role="status">
          날씨 정보를 불러오고 있어요…
        </div>
      ) : (
        weather && (
          <div className="weather-content">
            <section
              className="weather-hero-card"
              aria-labelledby="weather-current-title"
            >
              <div className="weather-current-main">
                <div className="weather-meta-row">
                  <span className="pill">
                    {weather.mode === 'live'
                      ? 'Open-Meteo 실시간 기상'
                      : '데모 기상 안내'}
                  </span>
                  <span className="weather-observed">
                    {`기준: ${weather.observedAt}`}
                  </span>
                </div>
                <h2 id="weather-current-title">
                  {weather.region === '전체'
                    ? '경기도 대표 (수원 중심)'
                    : `경기도 · ${weather.region}`}
                </h2>
                <p className="weather-area-note">{weather.areaNote}</p>

                <div className="weather-temp-row">
                  <span className="weather-main-icon">
                    <WeatherSymbol icon={weather.current.icon} size={46} />
                  </span>
                  <strong className="weather-temp-value">
                    {weather.current.temperature.toFixed(1)}°C
                  </strong>
                  <div className="weather-condition-summary">
                    <strong>{weather.current.condition}</strong>
                    <span>
                      체감 {weather.current.apparentTemperature.toFixed(1)}°C
                    </span>
                  </div>
                </div>

                <dl className="weather-metrics">
                  <div>
                    <dt>습도</dt>
                    <dd>{weather.current.humidity}%</dd>
                  </div>
                  <div>
                    <dt>풍속</dt>
                    <dd>{weather.current.windSpeed.toFixed(1)} m/s</dd>
                  </div>
                  <div>
                    <dt>현재 강수량</dt>
                    <dd>{weather.current.precipitation.toFixed(1)} mm</dd>
                  </div>
                </dl>
              </div>

              <div
                className={`weather-advisory-box ${weather.advisory.suitability}`}
              >
                <span className="pill">
                  {SUITABILITY_LABEL[weather.advisory.suitability]}
                </span>
                <h3>{weather.advisory.headline}</h3>
                <p>{weather.advisory.detail}</p>
                <p className="fine">시·군 대표 좌표 기준 참고 정보입니다.</p>
              </div>
            </section>

            <OutfitCard
              outfit={weather.outfit}
              demo={weather.mode === 'demo'}
            />

            <section
              className="weather-forecast-section"
              aria-labelledby="weather-daily-title"
            >
              <div className="section-heading">
                <div>
                  <h2 id="weather-daily-title">5일 일별 예보</h2>
                  <p>
                    여행 날짜를 고를 때 최저·최고 기온과 강수확률을 참고해
                    보세요.
                  </p>
                </div>
              </div>
              <ol className="weather-daily-grid">
                {weather.daily.map((day, idx) => (
                  <li key={day.date} className="weather-day-card">
                    <strong className="weather-day-label">
                      {formatDayLabel(day.date, idx)}
                    </strong>
                    <span className="weather-day-date">
                      {day.date.slice(5).replace('-', '.')}
                    </span>
                    <div className="weather-day-icon">
                      <WeatherSymbol icon={day.icon} size={28} />
                      <span>{day.condition}</span>
                    </div>
                    <div className="weather-day-temps">
                      <span className="temp-min">
                        {day.tempMin.toFixed(0)}°
                      </span>
                      <span className="temp-divider">/</span>
                      <span className="temp-max">
                        {day.tempMax.toFixed(0)}°
                      </span>
                    </div>
                    <span className="weather-day-rain">
                      강수확률 {day.precipitationProbability}%
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <section
              className="weather-places-section"
              aria-labelledby="weather-places-title"
            >
              <div className="section-heading">
                <div>
                  <h2 id="weather-places-title">오늘 날씨에 어울리는 장소</h2>
                  <p>
                    {weather.region === '전체' ? '경기도 전역' : weather.region}
                    에서 {SUITABILITY_LABEL[weather.advisory.suitability]}{' '}
                    기준으로 골랐어요.
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary compact"
                  onClick={() => onExploreRegion(selectedRegion)}
                >
                  {selectedRegion === '전체'
                    ? '전체 장소 찾기'
                    : `${selectedRegion} 장소 더 보기`}
                </button>
              </div>
              {recommendedPlaces.length > 0 ? (
                <div className="weather-place-grid">
                  {recommendedPlaces.map((p) => (
                    <PlaceCard
                      key={p.id}
                      place={p}
                      selected={selectionSet.has(p.id)}
                      onDetail={onDetailPlace}
                      onToggle={onTogglePlace}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty">
                  <p>이 지역의 추천 장소가 아직 없어요.</p>
                  <div className="empty-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => onExploreRegion('전체')}
                    >
                      전체 장소 찾기
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )
      )}
    </div>
  );
}
