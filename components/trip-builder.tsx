import Image from 'next/image';
import type { Place } from '@/lib/domain/catalog';

export function TripBuilder({
  selected,
  name,
  date,
  ready,
  loading,
  busy,
  hidden,
  onBrowse,
  onRecommend,
  onRetrySession,
  onDetail,
  onMoveUp,
  onMoveDown,
  onClear,
  onToggle,
  onName,
  onDate,
  onSave,
}: {
  selected: Place[];
  name: string;
  date: string;
  ready: boolean;
  loading?: boolean;
  busy: boolean;
  hidden: boolean;
  onBrowse: () => void;
  onRecommend?: () => void;
  onRetrySession?: () => void;
  onDetail?: (place: Place) => void;
  onMoveUp: (index: number) => void;
  onMoveDown?: (index: number) => void;
  onClear?: () => void;
  onToggle: (id: string) => void;
  onName: (name: string) => void;
  onDate: (date: string) => void;
  onSave: () => void;
}) {
  return (
    <aside
      className="trip-builder review-builder"
      hidden={hidden}
      aria-labelledby="builder-title"
    >
      <div className="ticket-top">
        <span>나만의 하루 코스</span>
        <h2 id="builder-title">담은 여행</h2>
        <div className="ticket-wave" aria-hidden="true">
          ∿ ∿ ∿
        </div>
      </div>
      <div className="ticket-body">
        <div className="section-heading">
          <strong>담은 장소</strong>
          <div className="builder-meta">
            <span>{selected.length} / 8곳</span>
            {selected.length > 0 && onClear && (
              <button type="button" className="detail-link" onClick={onClear}>
                모두 비우기
              </button>
            )}
          </div>
        </div>
        {!selected.length ? (
          <div className="empty">
            <h3>아직 담은 장소가 없어요.</h3>
            <p>
              직접 장소를 찾거나 취향에 맞는 추천을 받아 코스를 만들어 보세요.
            </p>
            <div className="empty-actions">
              <button
                type="button"
                className="primary compact"
                onClick={onBrowse}
              >
                장소 찾기
              </button>
              {onRecommend && (
                <button
                  type="button"
                  className="secondary"
                  onClick={onRecommend}
                >
                  추천받기
                </button>
              )}
            </div>
          </div>
        ) : (
          <ol className="selected-list">
            {selected.map((p, i) => (
              <li key={p.id}>
                <span className="stop-index">{i + 1}</span>
                <span className="selection-thumbnail" aria-hidden="true">
                  {p.image ? (
                    <Image src={p.image.path} alt="" fill sizes="52px" />
                  ) : (
                    <span>≈</span>
                  )}
                </span>
                <div className="selection-name">
                  {onDetail ? (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => onDetail(p)}
                    >
                      {p.name}
                    </button>
                  ) : (
                    <strong>{p.name}</strong>
                  )}
                  <small>{p.region}</small>
                </div>
                <div className="stop-controls">
                  <button
                    type="button"
                    className="icon-button"
                    disabled={i === 0}
                    aria-label={`${p.name} 위로 이동`}
                    onClick={() => onMoveUp(i)}
                  >
                    ↑
                  </button>
                  {onMoveDown && (
                    <button
                      type="button"
                      className="icon-button"
                      disabled={i === selected.length - 1}
                      aria-label={`${p.name} 아래로 이동`}
                      onClick={() => onMoveDown(i)}
                    >
                      ↓
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`${p.name} 제외`}
                    onClick={() => onToggle(p.id)}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
        {selected.length > 0 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSave();
            }}
          >
            <div className="label-row">
              <label htmlFor="journey-name">여행 이름</label>
              <span className="char-count">{name.length} / 60</span>
            </div>
            <input
              id="journey-name"
              value={name}
              onChange={(e) => onName(e.target.value)}
              required
              maxLength={60}
            />
            <label htmlFor="journey-date">여행 날짜</label>
            <input
              id="journey-date"
              type="date"
              required
              value={date}
              onChange={(e) => onDate(e.target.value)}
            />
            {!ready && (
              <div className="inline-status" role="status">
                <span>
                  {loading
                    ? '여행 보관함을 연결하고 있어요…'
                    : '여행 보관함에 연결해야 저장할 수 있어요.'}
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
            <button
              className="primary"
              disabled={!selected.length || !ready || busy}
            >
              {busy ? '여행 저장 중…' : '여행 저장'}
            </button>
          </form>
        )}
        {selected.length > 0 && (
          <button
            type="button"
            className="secondary add-more"
            onClick={onBrowse}
          >
            장소 더 찾기
          </button>
        )}
        <p className="fine">
          여행 계획용 시연 서비스입니다. 실제 할인·입장·결제 기능은 제공하지
          않습니다.
        </p>
      </div>
    </aside>
  );
}
