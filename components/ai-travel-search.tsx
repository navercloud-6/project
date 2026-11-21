'use client';
import type { RefObject } from 'react';
import type { Place } from '@/lib/domain/catalog';
import type { Recommendation } from '@/lib/domain/contracts';
import {
  QUICK_SEARCH_CHIPS,
  placeLabelBadges,
} from '@/lib/domain/place-labels';

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
  const stopIds = new Set(result?.stops.map((s) => s.placeId) ?? []);
  const extraRelated = (result?.relatedPlaceIds ?? [])
    .filter((id) => !stopIds.has(id))
    .map((id) => byId.get(id))
    .filter((p): p is Place => Boolean(p))
    .slice(0, 6);
  const quickPreview = trimmed && !result ? filtered.slice(0, 6) : [];

  return (
    <section className="ai-search-section" aria-labelledby="ai-search-heading">
      <form
        className="ai-search-panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed.length >= 2) onSearch();
        }}
      >
        <div className="ai-search-header">
          <div className="planner-heading">
            <span className="ai-icon" aria-hidden="true">
              ✳
            </span>
            <span>
              <strong id="ai-search-heading">
                {aiEnabled ? 'AI 여행 검색·추천' : '여행 테마 검색·추천'}
              </strong>
              <small>
                {aiEnabled
                  ? 'NAVER Cloud · CLOVA 라벨링 + Reranker + HyperCLOVA X'
                  : '609곳 사전 라벨 기반으로 연관 관광지와 맞춤 코스를 찾아 드려요'}
              </small>
            </span>
          </div>
          <div className="ai-search-meta">
            <span className="total">
              {region === '전체' ? '경기도 전체' : region} {filtered.length}곳
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
              placeholder="예: 호수, 실내, 비 오는 날 아이와 함께, 조용한 산책"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
            />
            <span aria-hidden="true">⌕</span>
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
            disabled={busy || !ready || trimmed.length < 2}
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

        <p className="fine ai-search-hint">
          {aiEnabled
            ? '입력하면 609곳 라벨로 즉시 찾고, "AI 검색·추천"을 누르면 NAVER Cloud Reranker·CLOVA가 맞춤 코스를 제안해요. 개인정보는 입력하지 마세요.'
            : '입력하면 609곳 사전 라벨로 즉시 찾고, "AI 검색·추천"을 누르면 라벨 기반 데모 추천 코스를 만들어 드려요.'}
        </p>
      </form>

      {trimmed && !result && (
        <div className="ai-instant-preview" aria-live="polite">
          <div className="ai-instant-header">
            <div>
              <strong>
                &ldquo;{trimmed}&rdquo; 연관 관광지 {filtered.length}곳
              </strong>
              <span>
                {filtered.length > 0
                  ? '사전 라벨·키워드로 먼저 찾았어요. "AI 검색·추천"을 누르면 맞춤 코스와 이유까지 정리해 드려요.'
                  : '일치하는 라벨·장소가 없어요. 다른 키워드나 지역을 선택해 보세요.'}
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
            <ul className="ai-preview-grid">
              {quickPreview.map((place) => {
                const isSelected = selection.includes(place.id);
                return (
                  <li key={place.id} className="ai-preview-card">
                    <div className="ai-preview-meta">
                      <span className="ai-preview-region">{place.region}</span>
                      <span className="ai-preview-badges">
                        {placeLabelBadges(place).join(' · ')}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="text-button ai-preview-title"
                      onClick={() => onDetail(place)}
                    >
                      {place.name}
                    </button>
                    <p>{place.description}</p>
                    <div className="ai-preview-actions">
                      <button
                        type="button"
                        className="detail-link"
                        onClick={() => onDetail(place)}
                      >
                        장소 상세
                      </button>
                      <button
                        type="button"
                        className={isSelected ? 'add selected' : 'add'}
                        aria-pressed={isSelected}
                        onClick={() => onToggle(place.id)}
                      >
                        {isSelected ? '담기 취소' : '여행에 담기'}
                      </button>
                    </div>
                  </li>
                );
              })}
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
          <ol className="recommend-stops">
            {result.stops.map((s) => {
              const place = byId.get(s.placeId);
              const isSelected = selection.includes(s.placeId);
              return (
                <li key={s.placeId}>
                  <div className="recommend-stop-head">
                    <div>
                      {place ? (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => onDetail(place)}
                        >
                          {place.name}
                        </button>
                      ) : (
                        <strong>{s.placeId}</strong>
                      )}
                      {place && (
                        <small>
                          {place.region} · {placeLabelBadges(place).join(' · ')}
                        </small>
                      )}
                    </div>
                    {place && (
                      <button
                        type="button"
                        className={isSelected ? 'add selected' : 'add'}
                        aria-pressed={isSelected}
                        onClick={() => onToggle(place.id)}
                      >
                        {isSelected ? '담기 취소' : '여행에 담기'}
                      </button>
                    )}
                  </div>
                  <p>{s.reason}</p>
                </li>
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

          {extraRelated.length > 0 && (
            <div className="ai-related-shelf">
              <h3>함께 둘러볼 연관 관광지</h3>
              <ul className="ai-preview-grid">
                {extraRelated.map((place) => {
                  const isSelected = selection.includes(place.id);
                  return (
                    <li key={place.id} className="ai-preview-card">
                      <div className="ai-preview-meta">
                        <span className="ai-preview-region">
                          {place.region}
                        </span>
                        <span className="ai-preview-badges">
                          {placeLabelBadges(place).join(' · ')}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="text-button ai-preview-title"
                        onClick={() => onDetail(place)}
                      >
                        {place.name}
                      </button>
                      <div className="ai-preview-actions">
                        <button
                          type="button"
                          className="detail-link"
                          onClick={() => onDetail(place)}
                        >
                          장소 상세
                        </button>
                        <button
                          type="button"
                          className={isSelected ? 'add selected' : 'add'}
                          aria-pressed={isSelected}
                          onClick={() => onToggle(place.id)}
                        >
                          {isSelected ? '담기 취소' : '여행에 담기'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <p className="fine">
            검토 전 자료를 활용한 시연 제안입니다. 방문 순서·이동시간·운영
            여부를 보장하지 않습니다.
          </p>
        </section>
      )}
    </section>
  );
}
