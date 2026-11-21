'use client';
import { useEffect, useState } from 'react';
import { PlaceCard } from './place-card';
import { OutfitCard } from './outfit-card';
import { WeatherSymbol } from './weather-symbol';
import { api } from '@/lib/adapters/client-api';
import type { Place } from '@/lib/domain/catalog';
import {
  WEATHER_REGIONS,
  weatherResponseSchema,
  type WeatherResponse,
} from '@/lib/domain/weather';

const REGION_LIST = Object.keys(WEATHER_REGIONS);
const QUICK_REGIONS = [
  '전체',
  '수원시',
  '용인시',
  '고양시',
  '성남시',
  '화성시',
  '파주시',
  '가평군',
  '여주시',
  '시흥시',
] as const;

function formatDayLabel(dateStr: string, index: number): string {
  if (index === 0) return '오늘';
  if (index === 1) return '내일';
  const parsed = new Date(`${dateStr}T00:00:00+09:00`);
  if (isNaN(parsed.getTime())) return dateStr;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(parsed);
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

function regionForCity(cityId: string | null) {
  return (
    REGION_LIST.find((name) => WEATHER_REGIONS[name].cityId === cityId) ??
    '전체'
  );
}

export function WeatherPanel(props: WeatherPanelProps) {
  const selectedRegion = regionForCity(props.selectedCityId);
  const [state, setState] = useState<WeatherPanelState>({
    region: selectedRegion,
    status: 'loading',
  });
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ region: selectedRegion, status: 'loading' });
    api<WeatherResponse>(
      `/api/weather?region=${encodeURIComponent(selectedRegion)}`,
    )
      .then((response) => {
        const data = weatherResponseSchema.parse(response);
        if (data.region !== selectedRegion)
          throw new Error('선택한 도시의 날씨를 확인하지 못했어요.');
        if (active) setState({ region: selectedRegion, status: 'ready', data });
      })
      .catch((e) => {
        if (active)
          setState({
            region: selectedRegion,
            status: 'error',
            error: (e as Error).message,
          });
      });
    return () => {
      active = false;
    };
  }, [selectedRegion, retryKey]);

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
  const selectRegion = (name: string) =>
    onSelectCity(WEATHER_REGIONS[name].cityId);

  const recommendedPlaces = (weather?.recommendedPlaceIds ?? [])
    .map((id) => places.find((p) => p.id === id))
    .filter((p): p is Place => Boolean(p));

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

      <div className="weather-selector">
        <label className="weather-city-picker">
          <span>시·군 선택</span>
          <select
            value={selectedRegion}
            onChange={(e) => selectRegion(e.target.value)}
            aria-label="경기도 시·군 선택"
          >
            {REGION_LIST.map((r) => (
              <option key={r} value={r}>
                {r === '전체' ? '경기도 전체 (수원 대표)' : r}
              </option>
            ))}
          </select>
        </label>
        <div
          className="weather-regions"
          role="group"
          aria-label="경기도 주요 시·군 빠른 선택"
        >
          {QUICK_REGIONS.map((r) => (
            <button
              key={r}
              type="button"
              className={
                selectedRegion === r
                  ? 'weather-region-chip active'
                  : 'weather-region-chip'
              }
              aria-pressed={selectedRegion === r}
              onClick={() => selectRegion(r)}
            >
              {r === '전체' ? '경기도 전체' : r}
            </button>
          ))}
        </div>
      </div>

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
                <p className="fine">
                  시·군 대표 좌표 기준 참고 정보입니다. 해안·산림 국지 기상과
                  시설 운영 여부는 방문 전 공식 안내를 확인해 주세요.
                </p>
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
                      selected={selection.includes(p.id)}
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
