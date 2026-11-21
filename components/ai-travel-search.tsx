'use client';
import Image from 'next/image';
import type { RefObject } from 'react';
import type { Place } from '@/lib/domain/catalog';
import {
  RECOMMENDATION_STOP_LIMIT,
  type Recommendation,
} from '@/lib/domain/contracts';
import {
  QUICK_SEARCH_CHIPS,
  placeLabelBadges,
} from '@/lib/domain/place-labels';

function SearchPlaceItem({
  place,
  selected,
  order,
  reason,
  onDetail,
  onToggle,
}: {
  place: Place;
  selected: boolean;
  order?: number;
  reason?: string;
  onDetail: (place: Place) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <li className="ai-place-item">
      <button
        type="button"
        className="ai-place-link"
        aria-label={`${place.name} 상세 보기`}
        onClick={() => onDetail(place)}
      >
        {order !== undefined && (
          <span className="ai-place-order" aria-hidden="true">
            {order}
          </span>
        )}
        <span className="ai-place-copy">
          <strong>{place.name}</strong>
          <span className="ai-place-meta">
            {place.region} · {placeLabelBadges(place).join(' · ')}
          </span>
          {reason && <span className="ai-place-reason">{reason}</span>}
        </span>
        <span className="ai-place-detail" aria-hidden="true">
          <span>장소 상세</span> ›
        </span>
      </button>
      <button
        type="button"
        className={selected ? 'add selected' : 'add'}
        aria-pressed={selected}
        onClick={() => onToggle(place.id)}
      >
        {selected ? '담기 취소' : '여행에 담기'}
      </button>
    </li>
  );
}

export function AiTravelSearch({
  aiEnabled,
  regions,
  region,
  query,
  filtered,
  selection,
  savedPrompt,
  busy,
  ready,
  loading,
  result,
  places,
  inputRef,
  resultRef,
  onQuery,
  onRegion,
  onSearch,
  onReset,
  onApply,
  onClearResult,
  onToggle,
  onDetail,
  onScrollCatalog,
  onRetrySession,
}: {
  aiEnabled: boolean;
  regions: string[];
  region: string;
  query: string;
  filtered: Place[];
  selection: string[];
  savedPrompt?: string;
  busy: boolean;
  ready: boolean;
  loading?: boolean;
  result: Recommendation | null;
  places: Place[];
  inputRef?: RefObject<HTMLInputElement | null>;
  resultRef: RefObject<HTMLElement | null>;
  onQuery: (query: string) => void;
  onRegion: (region: string) => void;
  onSearch: () => void;
  onReset: () => void;
  onApply: (result: Recommendation) => void;
  onClearResult: () => void;
  onToggle: (id: string) => void;
  onDetail: (place: Place) => void;
  onScrollCatalog: () => void;
  onRetrySession?: () => void;
}) {
  const trimmed = query.trim();
  const hasFilter = trimmed !== '' || region !== '전체' || result !== null;
  const byId = new Map(places.map((p) => [p.id, p]));
  const quickPreview =
    trimmed && !result ? filtered.slice(0, RECOMMENDATION_STOP_LIMIT) : [];

  return (
    <section className="ai-search-section" aria-labelledby="ai-search-heading">
      <form
        className="ai-search-panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed.length >= 2 && !busy && ready && filtered.length)
            onSearch();
        }}
      >
        <div className="ai-search-header">
          <div className="planner-heading">
            <Image
              className="ai-search-service-icon"
              src="/icons/naver-cloud/clova-studio.png"
              alt=""
              width={24}
              height={24}
              unoptimized
            />
            <strong id="ai-search-heading">
              {aiEnabled ? 'AI 여행 검색·추천' : '여행 테마 검색·추천'}
            </strong>
          </div>
          <div className="ai-search-meta">
            <span className="total">
              {result
                ? `추천 ${result.stops.length}곳`
                : `${trimmed ? '검색 ' : ''}${filtered.length}곳`}
            </span>
            {hasFilter && (
              <button type="button" className="detail-link" onClick={onReset}>
                초기화
              </button>
            )}
          </div>
        </div>

        <div className="ai-search-controls">
          <label
            className="search ai-search-input-wrap"
            htmlFor="ai-travel-query"
          >
            <span className="sr-only">원하는 여행 방식이나 키워드 검색</span>
            <input
              ref={inputRef}
              id="ai-travel-query"
              type="search"
              maxLength={500}
              placeholder="예: 아이와 함께 호수 산책"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
            />
            <Image
              className="ai-search-input-icon"
              src="/icons/naver-cloud/cloud-search.png"
              alt=""
              width={24}
              height={24}
              unoptimized
            />
          </label>
          <label className="ai-search-region-wrap">
            <span className="sr-only">지역 선택</span>
            <select
              id="ai-travel-region"
              value={region}
              onChange={(e) => onRegion(e.target.value)}
            >
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="primary ai-search-submit"
            disabled={busy || !ready || trimmed.length < 2 || !filtered.length}
          >
            {busy ? 'AI가 찾는 중…' : 'AI 검색·추천'}
          </button>
        </div>

        <div
          className="suggestions ai-search-chips"
          role="group"
          aria-label="빠른 테마 검색"
        >
          {QUICK_SEARCH_CHIPS.map((chip) => {
            const active = trimmed === chip.query;
            return (
              <button
                type="button"
                key={chip.label}
                className={active ? 'active' : undefined}
                aria-pressed={active}
                onClick={() => onQuery(active ? '' : chip.query)}
              >
                {chip.label}
              </button>
            );
          })}
          {savedPrompt && savedPrompt.trim().length >= 2 && (
            <button
              type="button"
              className={trimmed === savedPrompt.trim() ? 'active' : undefined}
              onClick={() => onQuery(savedPrompt.trim())}
            >
              내 저장 취향
            </button>
          )}
        </div>

        {!ready && (
          <div className="inline-status" role="status">
            <span>
              {loading
                ? '여행 보관함을 연결하고 있어요. 키워드 검색은 바로 이용할 수 있어요.'
                : '여행 보관함에 연결해야 AI 코스 추천을 받을 수 있어요.'}
            </span>
            {!loading && onRetrySession && (
              <button
                type="button"
                className="secondary compact"
                onClick={onRetrySession}
              >
                다시 시도
              </button>
            )}
          </div>
        )}
      </form>

      {trimmed && !result && (
        <div className="ai-instant-preview" aria-live="polite">
          <div className="ai-instant-header">
            <div>
              <strong>
                &ldquo;{trimmed}&rdquo; 조건에 맞는 관광지 {filtered.length}곳
              </strong>
              <span>
                {filtered.length > 0
                  ? busy
                    ? '입력한 조건에 맞는 장소에서 추천 코스를 고르고 있어요.'
                    : `먼저 ${quickPreview.length}곳을 보여드려요. "AI 검색·추천"을 누르면 최대 ${RECOMMENDATION_STOP_LIMIT}곳의 코스를 제안해요.`
                  : '조건에 맞는 장소가 없어요. 검색어나 지역을 바꿔 보세요.'}
              </span>
            </div>
            {filtered.length > 0 && (
              <button
                type="button"
                className="secondary compact"
                onClick={onScrollCatalog}
              >
                전체 {filtered.length}곳 보기
              </button>
            )}
          </div>
          {quickPreview.length > 0 && (
            <ul className="ai-place-list">
              {quickPreview.map((place) => (
                <SearchPlaceItem
                  key={place.id}
                  place={place}
                  selected={selection.includes(place.id)}
                  onDetail={onDetail}
                  onToggle={onToggle}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {result && (
        <section
          className="recommendation ai-search-result"
          ref={resultRef}
          tabIndex={-1}
          aria-labelledby="recommend-title"
        >
          <div className="section-heading">
            <div>
              <span className="pill">
                {result.mode === 'demo'
                  ? '라벨 데모 추천'
                  : result.reranked
                    ? 'CLOVA Reranker + AI 추천'
                    : 'CLOVA AI 추천'}
              </span>
              <h2 id="recommend-title">{result.title}</h2>
              <p>{result.summary}</p>
            </div>
            <button
              type="button"
              className="detail-link"
              onClick={onClearResult}
            >
              추천 닫기
            </button>
          </div>
          <p className="fine">
            {selection.length > 0
              ? `이 코스를 한 번에 담으면 현재 담은 장소 ${selection.length}곳이 추천 장소로 교체돼요.`
              : '추천 코스를 한 번에 담거나, 마음에 드는 장소만 골라 담을 수 있어요.'}
          </p>
          <ol className="ai-place-list">
            {result.stops.map((s, index) => {
              const place = byId.get(s.placeId);
              return place ? (
                <SearchPlaceItem
                  key={place.id}
                  place={place}
                  selected={selection.includes(place.id)}
                  onDetail={onDetail}
                  onToggle={onToggle}
                  order={index + 1}
                  reason={s.reason}
                />
              ) : (
                <li key={s.placeId}>장소 정보를 불러올 수 없어요.</li>
              );
            })}
          </ol>
          <div className="tool-actions">
            <button
              type="button"
              className="primary compact"
              onClick={() => onApply(result)}
            >
              이 코스로 담기
            </button>
            <button
              type="button"
              className="secondary"
              onClick={onScrollCatalog}
            >
              전체 검색 결과 보기 ({filtered.length}곳)
            </button>
          </div>

          <p className="fine">
            검토 전 자료를 활용한 시연 제안입니다. 방문 순서·이동시간·운영
            여부를 보장하지 않습니다.
          </p>
        </section>
      )}
    </section>
  );
}
