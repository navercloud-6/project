'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/adapters/client-api';
import {
  restaurantsResponseSchema,
  type RestaurantsResponse,
} from '@/lib/domain/restaurants';
import { ErrorText } from './assistant/shared';

const mapSearch = (name: string, region: string) =>
  `https://map.naver.com/p/search/${encodeURIComponent(
    `${region === '전체' ? '경기도' : region} ${name}`,
  )}`;

/** 선택 시·군의 맛집과 후기 기반 인기 메뉴. */
export function WeatherRestaurants({
  region,
  limit,
}: {
  region: string;
  // 안내 음성과 같은 개수·순서만 보여 줄 때 쓴다.
  limit?: number;
}) {
  const [state, setState] = useState<{
    region: string;
    data?: RestaurantsResponse;
    error?: string;
  }>({ region });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({ region });
    api(
      `/api/restaurants?region=${encodeURIComponent(region)}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then((r) => {
        const data = restaurantsResponseSchema.parse(r);
        if (active && data.region === region) setState({ region, data });
      })
      .catch((e) => {
        if (!active || (e instanceof Error && e.name === 'AbortError')) return;
        setState({ region, error: (e as Error).message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [region]);

  const data = state.region === region ? state.data : undefined;
  const loading = !data && !state.error;
  return (
    <section
      className="weather-restaurants"
      aria-labelledby="weather-restaurants-title"
      aria-busy={loading}
    >
      <div className="weather-outfit-heading">
        <h2 id="weather-restaurants-title">근처 맛집</h2>
        <span className="pill">NAVER 지역 검색·블로그 후기</span>
      </div>
      {loading && <p className="fine">맛집을 찾는 중…</p>}
      <ErrorText text={state.region === region ? (state.error ?? '') : ''} />
      {data?.message && <p className="fine">{data.message}</p>}
      {data && data.items.length > 0 && (
        <ul className="weather-restaurant-list">
          {data.items.slice(0, limit).map((item) => (
            <li key={item.name}>
              <div className="weather-restaurant-head">
                <strong>{item.name}</strong>
                {item.category && <span className="fine">{item.category}</span>}
              </div>
              <p className="fine">{item.address}</p>
              {item.menus.length > 0 && (
                <ul className="weather-outfit-chips" aria-label="후기 속 메뉴">
                  {item.menus.map((menu) => (
                    <li key={menu}>{menu}</li>
                  ))}
                </ul>
              )}
              <a
                href={mapSearch(item.name, region)}
                target="_blank"
                rel="noopener noreferrer"
              >
                네이버 지도에서 보기
              </a>
            </li>
          ))}
        </ul>
      )}
      {data && data.mode === 'live' && (
        <p className="fine">
          검색 결과는 리뷰 많은 순이며 술집과 다른 지역은 제외했습니다. 메뉴는
          블로그 후기 문장에 실제로 나온 이름만 표시합니다. 영업 여부와 가격은
          방문 전 확인해 주세요.
        </p>
      )}
    </section>
  );
}
