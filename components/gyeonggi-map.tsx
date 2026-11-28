'use client';
import { memo, useId } from 'react';
import { CityWeatherBadge } from './city-weather-badge';
import { DEFAULT_WEATHER_CITY_ID } from '@/lib/domain/city-weather';
import { gyeonggiCities, gyeonggiMap } from '@/lib/domain/gyeonggi';

/** 경기도 시·군 선택 지도(경기 둘러보기·오늘의 안내에서 함께 쓴다). */
export const GyeonggiMapPanel = memo(function GyeonggiMapPanel({
  selectedCityId,
  onSelectCity,
}: {
  selectedCityId: string | null;
  onSelectCity: (cityId: string | null) => void;
}) {
  const selectedGradientId = useId();
  return (
    <div className="gyeonggi-map-panel">
      <div className="gyeonggi-map-heading">
        <span>
          <span className="map-status-dot" /> 경기도 여행 지도
        </span>
        <CityWeatherBadge cityId={selectedCityId ?? DEFAULT_WEATHER_CITY_ID} />
      </div>
      <svg
        className="gyeonggi-map-svg"
        viewBox={gyeonggiMap.viewBox}
        role="group"
        aria-label="경기도 시·군 선택 지도"
      >
        <defs>
          <linearGradient id={selectedGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#03c75a" />
            <stop offset="100%" stopColor="#04d1c9" />
          </linearGradient>
        </defs>
        <g className="gyeonggi-map-context" aria-hidden="true">
          <path d={gyeonggiMap.context.path} fillRule="evenodd" />
          <text
            x={gyeonggiMap.context.label[0]}
            y={gyeonggiMap.context.label[1]}
          >
            서울
          </text>
        </g>
        {gyeonggiCities.map((item) => (
          <path
            key={item.id}
            d={item.path}
            fillRule="evenodd"
            className={
              item.id === selectedCityId
                ? 'gyeonggi-city-shape is-selected'
                : 'gyeonggi-city-shape'
            }
            style={
              item.id === selectedCityId
                ? { fill: `url(#${selectedGradientId})` }
                : undefined
            }
            data-city-id={item.id}
            role="button"
            tabIndex={0}
            aria-label={`${item.name} 선택`}
            aria-pressed={item.id === selectedCityId}
            onClick={() => onSelectCity(item.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectCity(item.id);
              }
            }}
          >
            <title>{item.name}</title>
          </path>
        ))}
        <g className="gyeonggi-map-labels" aria-hidden="true">
          {gyeonggiCities.map((item) => (
            <text
              key={item.id}
              x={item.label[0]}
              y={item.label[1]}
              className={item.id === selectedCityId ? 'is-selected' : ''}
            >
              {item.shortName}
            </text>
          ))}
        </g>
      </svg>
      <div className="gyeonggi-map-guidance">
        <svg
          className="gyeonggi-map-compass"
          viewBox="0 0 24 48"
          width="24"
          height="48"
          role="img"
          aria-label="북쪽 방향"
        >
          <text x="12" y="12">
            N
          </text>
          <path d="m12 20 5 15-5-3-5 3Z" />
          <path d="M12 32v12" />
        </svg>
      </div>
      <div className="gyeonggi-map-controls">
        <label>
          <span className="sr-only">지도에서 선택할 시·군</span>
          <select
            value={selectedCityId ?? ''}
            onChange={(e) => onSelectCity(e.target.value || null)}
          >
            <option value="">시·군을 목록에서 선택</option>
            {gyeonggiCities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => onSelectCity(null)}>
          <span aria-hidden="true">↺</span> 경기도 전체 보기
        </button>
      </div>
      <p className="gyeonggi-map-credit">
        경계:{' '}
        <a href={gyeonggiMap.source.upstream} target="_blank" rel="noreferrer">
          SGIS · 공공누리 제1유형
        </a>
        {' · '}가공:{' '}
        <a href={gyeonggiMap.source.url} target="_blank" rel="noreferrer">
          vuski/admdongkor
        </a>
        {' · '}
        <a
          href={gyeonggiMap.source.licenseUrl}
          target="_blank"
          rel="noreferrer"
        >
          CC BY 4.0
        </a>
        <br />
        2026.10.01 기준 · 시·군 병합 및 화면용 단순화
      </p>
    </div>
  );
});
