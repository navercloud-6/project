'use client';
import Image from 'next/image';
import { useId } from 'react';
import type { Place } from '@/lib/domain/catalog';
import type { WeatherIcon } from '@/lib/domain/weather';
import { WeatherSymbol, weatherIconLabels } from './weather-symbol';
import {
  gyeonggiCities,
  gyeonggiMap,
  placesInCity,
} from '@/lib/domain/gyeonggi';

export type CityMapWeather = {
  icon: WeatherIcon;
  temperature: number;
  mode: 'demo' | 'live';
};

const previewWeather: CityMapWeather = {
  icon: 'sun',
  temperature: 10,
  mode: 'demo',
};

function LocationIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M38 20c0 10-14 22-14 22S10 30 10 20a14 14 0 1 1 28 0Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="20" r="5" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

export function GyeonggiCityExplorer({
  places,
  selectedCityId,
  selection,
  weather = previewWeather,
  onSelectCity,
  onDetail,
  onToggle,
}: {
  places: Place[];
  selectedCityId: string | null;
  selection: string[];
  weather?: CityMapWeather;
  onSelectCity: (cityId: string | null) => void;
  onDetail: (place: Place) => void;
  onToggle: (placeId: string) => void;
}) {
  const labelId = useId();
  const city = gyeonggiCities.find((item) => item.id === selectedCityId);
  const cityPlaces = placesInCity(places, selectedCityId);
  const populated = new Set(places.map((p) => p.cityId));
  const availableCities = gyeonggiCities.filter((item) =>
    populated.has(item.id),
  );

  return (
    <section className="city-explorer" aria-labelledby={labelId}>
      <div className="city-explorer-heading">
        <div>
          <span className="city-explorer-eyebrow">GYEONGGI TRAVEL</span>
          <h1 id={labelId}>지도에서 시작하는 경기도 여행</h1>
          <p>마음이 가는 도시를 누르고, 새로운 하루를 찾아보세요.</p>
        </div>
        <span className="city-explorer-region-count">
          31개 시·군, 저마다 다른 여행
        </span>
      </div>

      <div className="city-explorer-grid">
        <div className="gyeonggi-map-panel">
          <div className="gyeonggi-map-heading">
            <span>
              <span className="map-status-dot" /> 경기도 여행 지도
            </span>
            <div
              className="gyeonggi-map-weather"
              role="img"
              aria-label={`${weather.mode === 'demo' ? '예시 날씨' : '날씨'}: ${weatherIconLabels[weather.icon]}, ${weather.temperature}도`}
            >
              <WeatherSymbol
                icon={weather.icon}
                size={40}
                className={`gyeonggi-map-weather-icon ${weather.icon}`}
              />
              <strong>
                {weather.temperature}
                <span>°C</span>
              </strong>
              {weather.mode === 'demo' && <small>예시 날씨</small>}
            </div>
          </div>
          <svg
            className="gyeonggi-map-svg"
            viewBox={gyeonggiMap.viewBox}
            role="group"
            aria-label="경기도 시·군 선택 지도"
          >
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
                <option value="">지역을 목록에서 선택</option>
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
            <a
              href={gyeonggiMap.source.upstream}
              target="_blank"
              rel="noreferrer"
            >
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

        <aside className="city-places-panel" aria-label="선택한 도시의 관광지">
          <div className="city-places-heading">
            <span className="city-places-eyebrow">YOUR NEXT STOP</span>
            <div className="city-places-title-row">
              <h2>{city ? `${city.name} 둘러보기` : '어디로 떠나볼까요?'}</h2>
              {city && (
                <span className="city-place-count">{cityPlaces.length}곳</span>
              )}
            </div>
            <p role="status" aria-live="polite">
              {city
                ? cityPlaces.length
                  ? `${city.name}의 등록 관광지 ${cityPlaces.length}곳을 만나보세요.`
                  : `${city.name}의 관광 정보를 준비하고 있습니다.`
                : '지도에서 도시를 선택하면 관광지가 나타나요.'}
            </p>
          </div>
          {city && cityPlaces.length ? (
            <>
              <ul
                key={city.id}
                className="city-place-list"
                aria-label={`${city.name} 관광지 목록`}
              >
                {cityPlaces.map((place) => {
                  const added = selection.includes(place.id);
                  return (
                    <li key={place.id}>
                      <article className="city-place-card">
                        <button
                          className="city-place-photo"
                          type="button"
                          onClick={() => onDetail(place)}
                          aria-label={`${place.name} 상세 보기`}
                        >
                          {place.image ? (
                            <Image
                              src={place.image.path}
                              alt={place.image.alt}
                              fill
                              sizes="88px"
                            />
                          ) : (
                            <LocationIcon />
                          )}
                        </button>
                        <div className="city-place-body">
                          <span className="city-place-category">
                            {place.tags[0] || place.region}
                          </span>
                          <h3>
                            <button
                              type="button"
                              onClick={() => onDetail(place)}
                              aria-label={`${place.name} 상세 보기`}
                            >
                              {place.name}
                            </button>
                          </h3>
                          <p>{place.description}</p>
                          <div className="city-place-actions">
                            <span>{place.region}</span>
                            <button
                              className={
                                added
                                  ? 'city-place-add is-added'
                                  : 'city-place-add'
                              }
                              type="button"
                              aria-pressed={added}
                              aria-label={`${place.name} ${added ? '담기 취소' : '여행에 담기'}`}
                              onClick={() => onToggle(place.id)}
                            >
                              {added ? '✓ 담은 장소' : '+ 여행에 담기'}
                            </button>
                          </div>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
              <p className="city-places-note">
                검토 전 관광 자료입니다. 상세에서 출처와 운영 안내를 확인하세요.
              </p>
            </>
          ) : (
            <div className="city-places-empty">
              <div className="city-empty-art">
                <LocationIcon />
              </div>
              <h3>
                {city ? '관광 정보 준비 중' : '가보고 싶은 도시를 골라보세요'}
              </h3>
              <p>
                {city
                  ? '새로운 여행지를 차근차근 모으고 있어요. 다른 도시도 둘러보세요.'
                  : '도시마다 다른 풍경과 이야기를 지도에서 발견해 보세요.'}
              </p>
              {availableCities.length > 0 && (
                <div className="city-quick-picks">
                  <span>지금 둘러볼 수 있는 도시</span>
                  {availableCities.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectCity(item.id)}
                    >
                      {item.name} <span aria-hidden="true">↗</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
