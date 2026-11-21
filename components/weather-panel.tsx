'use client';
import { useEffect, useState } from 'react';
import { PlaceCard } from './place-card';
import { WeatherSymbol } from './weather-symbol';
import { api } from '@/lib/adapters/client-api';
import type { Place } from '@/lib/domain/catalog';
import { WEATHER_REGIONS, type WeatherResponse } from '@/lib/domain/weather';

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

export function WeatherPanel({
  places,
  selection,
  onTogglePlace,
  onDetailPlace,
  onExploreRegion,
}: {
  places: Place[];
  selection: string[];
  onTogglePlace: (placeId: string) => void;
  onDetailPlace: (place: Place) => void;
  onExploreRegion: (region: string) => void;
}) {
  const [selectedRegion, setSelectedRegion] = useState('전체');
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api<WeatherResponse>(
      `/api/weather?region=${encodeURIComponent(selectedRegion)}`,
    )
      .then((d) => active && setWeather(d))
      .catch((e) => active && setError((e as Error).message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [selectedRegion, retryKey]);

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
            onChange={(e) => setSelectedRegion(e.target.value)}
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
              onClick={() => setSelectedRegion(r)}
            >
              {r === '전체' ? '경기도 전체' : r}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="tool-error">
          <span>{error}</span>
          <button
            type="button"
            className="secondary compact"
            onClick={() => setRetryKey((k) => k + 1)}
          >
            다시 시도
          </button>
        </div>
      )}

      {loading && !weather ? (
        <div className="empty">날씨 정보를 불러오고 있어요…</div>
      ) : (
        weather && (
          <div
            className={
              loading ? 'weather-content is-loading' : 'weather-content'
            }
          >
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
                    {loading ? '업데이트 중…' : `기준: ${weather.observedAt}`}
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

            <section
              className="weather-outfit-section"
              aria-labelledby="weather-outfit-title"
            >
              <div className="weather-outfit-heading">
                <h2 id="weather-outfit-title">오늘의 옷차림</h2>
                <span className="pill">최고기온 {weather.outfit.band}</span>
                {weather.mode === 'demo' && (
                  <span className="pill">데모 기상 기준</span>
                )}
              </div>
              <p className="weather-outfit-summary">{weather.outfit.summary}</p>
              <dl className="weather-outfit-grid">
                {(
                  [
                    ['겉옷', weather.outfit.outer],
                    ['상의', weather.outfit.top],
                    ['하의', weather.outfit.bottom],
                    ['소품', weather.outfit.accessories],
                  ] as const
                ).map(([label, items]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      {items.length > 0 ? items.join(', ') : '없어도 돼요'}
                    </dd>
                  </div>
                ))}
              </dl>
              {weather.outfit.notes.length > 0 && (
                <div className="weather-outfit-extras">
                  <h3>추가 준비물</h3>
                  {weather.outfit.extras.length > 0 && (
                    <ul className="weather-outfit-chips">
                      {weather.outfit.extras.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                  <ul className="weather-outfit-notes">
                    {weather.outfit.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

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
