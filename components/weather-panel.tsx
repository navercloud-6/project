'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { PlaceCard } from './place-card';
import { api } from '@/lib/adapters/client-api';
import type { Place } from '@/lib/domain/catalog';
import type { WeatherIcon, WeatherResponse } from '@/lib/domain/weather';

const REGION_LIST = [
  '전체',
  '장곡·갯골',
  '오이도',
  '배곧',
  '거북섬',
  '월곶',
  '정왕·옥구',
  '하중·호조벌',
  '물왕',
  '은계',
  '대야·소래산',
];

const weatherSymbols: Record<WeatherIcon, ReactNode> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77" />
    </>
  ),
  'cloud-sun': (
    <>
      <path d="M12 2v2M5.6 5.6l1.4 1.4M2 12h2M18.4 5.6 17 7" />
      <path d="M9 15.5a3.5 3.5 0 1 1 3.2-4.9A4.5 4.5 0 1 1 17.5 19H9a3.5 3.5 0 0 1 0-7" />
    </>
  ),
  rain: (
    <>
      <path d="M7 15a4 4 0 0 1-.8-7.9A5.5 5.5 0 0 1 17 8a3.5 3.5 0 0 1 .5 7H7Z" />
      <path d="m9 18-1.5 3m5-3-1.5 3m5-3-1.5 3" />
    </>
  ),
  snow: (
    <>
      <path d="M7 15a4 4 0 0 1-.8-7.9A5.5 5.5 0 0 1 17 8a3.5 3.5 0 0 1 .5 7H7Z" />
      <path d="M8.5 18.5h.01M12 19.5h.01M15.5 18.5h.01" strokeWidth="2.6" />
    </>
  ),
  wind: (
    <>
      <path d="M3 8h10a2.5 2.5 0 1 0-2.5-2.5M3 12h15a2.5 2.5 0 1 1-2.5 2.5M3 16h7a2.5 2.5 0 1 1-2.5 2.5" />
    </>
  ),
  cloud: (
    <>
      <path d="M7.5 18a4.5 4.5 0 0 1-.9-8.9A6 6 0 0 1 18 10a4 4 0 0 1 .5 8h-11Z" />
    </>
  ),
};

function WeatherSymbol({
  icon,
  size = 28,
}: {
  icon: WeatherIcon;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {weatherSymbols[icon]}
    </svg>
  );
}

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
      .then((d) => {
        if (active) setWeather(d);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedRegion, retryKey]);

  const recommendedPlaces = (weather?.recommendedPlaceIds ?? [])
    .map((id) => places.find((p) => p.id === id))
    .filter((p): p is Place => Boolean(p));

  return (
    <div className="weather-page">
      <div className="section-heading">
        <div>
          <span className="pill">시흥 권역별 기상과 여행 가이드</span>
          <h1>바다와 갯골의 오늘 날씨</h1>
          <p>
            방문할 시흥 권역의 기온·바람·강수 예보를 확인하고 날씨에 어울리는
            장소를 담아보세요.
          </p>
        </div>
        <button
          type="button"
          className="secondary compact"
          onClick={() => onExploreRegion(selectedRegion)}
        >
          {selectedRegion === '전체'
            ? '전체 관광지 둘러보기'
            : `${selectedRegion} 장소 둘러보기`}
        </button>
      </div>

      <div className="weather-regions" role="group" aria-label="시흥 권역 선택">
        {REGION_LIST.map((r) => (
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
            {r === '전체' ? '시흥 전체' : r}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="tool-error">
          <span>{error}</span>
          <button
            type="button"
            className="secondary"
            onClick={() => setRetryKey((k) => k + 1)}
          >
            다시 시도
          </button>
        </div>
      )}

      {loading && !weather ? (
        <div className="empty">시흥 권역별 날씨 정보를 불러오고 있습니다…</div>
      ) : (
        weather && (
          <>
            <section
              className="weather-hero-card"
              aria-labelledby="weather-current-title"
            >
              <div className="weather-current-main">
                <div className="weather-meta-row">
                  <span className="pill">
                    {weather.mode === 'live'
                      ? 'Open-Meteo 실시간 기상'
                      : '데모 기상 안내 (오프라인·시연 폴백)'}
                  </span>
                  <span className="weather-observed">
                    기준: {weather.observedAt} · 북위{' '}
                    {weather.coordinates.lat.toFixed(3)}°, 동경{' '}
                    {weather.coordinates.lng.toFixed(3)}°
                  </span>
                </div>
                <h2 id="weather-current-title">
                  {weather.region === '전체'
                    ? '시흥시 대표 (시청·장곡)'
                    : `시흥 ${weather.region}`}
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
                    <dt>바람 (풍속)</dt>
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
                  기상 정보는 권역 대표 좌표 기준 참고용이며, 해안·산림 국지
                  기상이나 시설 운영 여부는 방문 전 공식 안내를 확인하세요.
                </p>
              </div>
            </section>

            <section
              className="weather-forecast-section"
              aria-labelledby="weather-daily-title"
            >
              <div className="section-heading">
                <div>
                  <h2 id="weather-daily-title">5일 일별 예보</h2>
                  <p>
                    여행 날짜를 정할 때 최저·최고 기온과 강수확률을 참고하세요.
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
                  <h2 id="weather-places-title">
                    오늘 날씨에 어울리는 시흥 명소
                  </h2>
                  <p>
                    {weather.region === '전체'
                      ? '시흥 전역'
                      : `${weather.region} 권역 중심`}
                    에서 {SUITABILITY_LABEL[weather.advisory.suitability]}{' '}
                    기준으로 골랐습니다.
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary compact"
                  onClick={() => onExploreRegion(selectedRegion)}
                >
                  {selectedRegion === '전체'
                    ? '전체 장소 더 보기'
                    : `${selectedRegion} 장소 더 보기`}
                </button>
              </div>
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
            </section>
          </>
        )
      )}
    </div>
  );
}
