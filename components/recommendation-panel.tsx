import type { RefObject } from 'react';
import type { Place } from '@/lib/domain/catalog';
import type { Recommendation } from '@/lib/domain/contracts';

export function RecommendationPanel({
  active,
  aiEnabled,
  regions,
  region,
  prompt,
  busy,
  ready,
  loading,
  result,
  places,
  selectionCount,
  resultRef,
  onGenerate,
  onRegion,
  onPrompt,
  onApply,
  onDetail,
  onBrowse,
  onRetrySession,
}: {
  active: boolean;
  aiEnabled: boolean;
  regions: string[];
  region: string;
  prompt: string;
  busy: boolean;
  ready: boolean;
  loading?: boolean;
  result: Recommendation | null;
  places: Place[];
  selectionCount: number;
  resultRef: RefObject<HTMLElement | null>;
  onGenerate: () => void;
  onRegion: (region: string) => void;
  onPrompt: (prompt: string) => void;
  onApply: (result: Recommendation) => void;
  onDetail?: (place: Place) => void;
  onBrowse?: () => void;
  onRetrySession?: () => void;
}) {
  return (
    <>
      <section
        hidden={!active}
        aria-label="여행 추천"
        className="recommend-planner"
      >
        <form
          className="planner"
          onSubmit={(e) => {
            e.preventDefault();
            onGenerate();
          }}
        >
          <div className="planner-heading">
            <span className="ai-icon" aria-hidden="true">
              ✳
            </span>
            <span>
              {aiEnabled ? 'AI 여행 메이트' : '데모 여행 메이트'}
              <small>
                {aiEnabled
                  ? 'NAVER Cloud · HyperCLOVA X'
                  : '취향과 과거 만족도를 바탕으로 장소를 골라 드려요'}
              </small>
            </span>
          </div>
          <label htmlFor="recommend-region">추천받을 지역</label>
          <select
            id="recommend-region"
            value={region}
            onChange={(e) => onRegion(e.target.value)}
          >
            {regions.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <div className="label-row">
            <label htmlFor="wish">동행과 취향을 알려주세요</label>
            <span className="char-count">{prompt.length} / 500</span>
          </div>
          <textarea
            id="wish"
            required
            minLength={2}
            maxLength={500}
            placeholder="예: 아이와 함께 자연을 구경하고 싶어요. 공원과 산책 코스 위주로 추천해 주세요."
            value={prompt}
            onChange={(e) => onPrompt(e.target.value)}
          />
          <div className="suggestions">
            {['아이와 자연 산책', '바다를 보는 하루', '전시와 역사 여행'].map(
              (text) => (
                <button type="button" key={text} onClick={() => onPrompt(text)}>
                  {text}
                </button>
              ),
            )}
          </div>
          {!ready && (
            <div className="inline-status" role="status">
              <span>
                {loading
                  ? '여행 보관함을 연결하고 있어요…'
                  : '여행 보관함에 연결해야 추천을 받을 수 있어요.'}
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
          <button className="primary" disabled={busy || !ready}>
            {busy ? '맞춤 코스를 만들고 있어요…' : '맞춤 추천받기'}
          </button>
          <p className="fine">
            {aiEnabled
              ? '입력한 취향과 과거 만족도가 NAVER Cloud로 전달됩니다. 개인정보는 입력하지 마세요.'
              : '현재 데모 모드입니다. 실제 AI 응답이 아니며 키워드와 만족도로 장소를 골라 드립니다.'}
          </p>
        </form>
      </section>
      {active && result && (
        <section
          className="recommendation"
          ref={resultRef}
          tabIndex={-1}
          aria-labelledby="recommend-title"
        >
          <div className="section-heading">
            <div>
              <span className="pill">
                {result.mode === 'demo' ? '데모 추천' : 'CLOVA AI 추천'}
              </span>
              <h2 id="recommend-title">{result.title}</h2>
              <p>{result.summary}</p>
            </div>
          </div>
          <p className="fine">
            {selectionCount > 0
              ? `이 추천을 적용하면 현재 담은 장소 ${selectionCount}곳이 추천 장소로 교체돼요.`
              : '이 추천을 적용하면 추천 장소가 담은 여행에 바로 추가돼요.'}
          </p>
          <ol className="recommend-stops">
            {result.stops.map((s) => {
              const place = places.find((p) => p.id === s.placeId);
              return (
                <li key={s.placeId}>
                  {place && onDetail ? (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => onDetail(place)}
                    >
                      {place.name}
                    </button>
                  ) : (
                    <strong>{place?.name}</strong>
                  )}
                  {place && <small>{place.region}</small>}
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
            {onBrowse && (
              <button type="button" className="secondary" onClick={onBrowse}>
                장소 직접 찾기
              </button>
            )}
          </div>
          <p className="fine">
            검토 전 자료를 활용한 시연 제안입니다. 방문 순서·이동시간·운영
            여부를 보장하지 않습니다.
          </p>
        </section>
      )}
    </>
  );
}
