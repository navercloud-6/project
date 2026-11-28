'use client';

import { useEffect, useState } from 'react';
import { cityWeatherClient } from '@/lib/adapters/city-weather-client';
import {
  cityWeatherLocationById,
  DEFAULT_WEATHER_CITY_ID,
  type CityWeatherResponse,
} from '@/lib/domain/city-weather';
import { WeatherSymbol } from './weather-symbol';

const CITY_TIME_FORMAT = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export type CityWeatherState =
  | { cityId: string; status: 'loading' | 'error' }
  | { cityId: string; status: 'ready'; data: CityWeatherResponse };

export function CityWeatherView({
  cityId,
  state,
  onRetry,
}: {
  cityId: string;
  state: CityWeatherState;
  onRetry: () => void;
}) {
  const city = cityWeatherLocationById.get(cityId)!;
  const current =
    state.cityId === cityId ? state : { cityId, status: 'loading' as const };
  const data = current.status === 'ready' ? current.data : null;
  const time = data ? CITY_TIME_FORMAT.format(new Date(data.observedAt)) : '';

  return (
    <div
      className="gyeonggi-map-weather"
      role="group"
      aria-label={`${city.name} 기준 날씨`}
      aria-busy={current.status === 'loading'}
    >
      <span className="city-weather-location">{city.name} 기준</span>
      <div className="city-weather-reading" role="status" aria-live="polite">
        {data ? (
          <>
            <WeatherSymbol
              icon={data.current.icon}
              size={36}
              className={`gyeonggi-map-weather-icon ${data.current.icon}`}
            />
            <strong>
              {data.current.temperature}
              <span>°C</span>
            </strong>
            <span className="city-weather-condition">
              {data.current.condition}
            </span>
            <small>{data.mode === 'demo' ? '예시 날씨' : '현재 날씨'}</small>
          </>
        ) : (
          <>
            <span className="city-weather-unknown" aria-hidden="true">
              {current.status === 'loading' ? '…' : '?'}
            </span>
            <strong>
              --<span>°C</span>
            </strong>
            <span className="city-weather-message">
              {current.status === 'loading'
                ? '날씨 불러오는 중'
                : '날씨 정보를 불러오지 못했어요'}
            </span>
          </>
        )}
      </div>
      {data && (
        <div className="city-weather-meta">
          <time
            dateTime={data.observedAt}
            title={`자료 기준 시각: ${data.observedAt}; 조회 시각: ${data.fetchedAt}`}
          >
            {time} 기준
          </time>
        </div>
      )}
      {current.status === 'error' && (
        <button type="button" className="city-weather-retry" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  );
}

export function CityWeatherBadge({
  cityId = DEFAULT_WEATHER_CITY_ID,
}: {
  cityId?: string;
}) {
  const [state, setState] = useState<CityWeatherState>({
    cityId,
    status: 'loading',
  });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      setState({ cityId, status: 'loading' });
      try {
        const data = await cityWeatherClient.get(cityId);
        if (!active) return;
        setState({ cityId, status: 'ready', data });
        timer = setTimeout(
          load,
          Math.max(1000, Date.parse(data.expiresAt) - Date.now()),
        );
      } catch {
        if (active) setState({ cityId, status: 'error' });
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [cityId, retry]);
  return (
    <CityWeatherView
      cityId={cityId}
      state={state}
      onRetry={() => setRetry((value) => value + 1)}
    />
  );
}
