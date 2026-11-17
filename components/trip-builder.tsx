import Image from 'next/image';
import type { Place } from '@/lib/domain/catalog';

export function TripBuilder({
  selected,
  name,
  date,
  ready,
  busy,
  hidden,
  onBrowse,
  onMoveUp,
  onToggle,
  onName,
  onDate,
  onSave,
}: {
  selected: Place[];
  name: string;
  date: string;
  ready: boolean;
  busy: boolean;
  hidden: boolean;
  onBrowse: () => void;
  onMoveUp: (index: number) => void;
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
        <span>나의 하루를 잇는</span>
        <h2 id="builder-title">나의 여행 코스</h2>
        <div className="ticket-wave" aria-hidden="true">
          ∿ ∿ ∿
        </div>
      </div>
      <div className="ticket-body">
        <div className="section-heading">
          <strong>담은 장소</strong>
          <span>{selected.length} / 8</span>
        </div>
        {!selected.length ? (
          <div className="empty">
            <h3>아직 담은 장소가 없어요.</h3>
            <p>장소를 담으면 순서와 날짜를 정할 수 있어요.</p>
            <button className="secondary" onClick={onBrowse}>
              장소 찾기
            </button>
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
                  <strong>{p.name}</strong>
                  <small>{p.region}</small>
                </div>
                <button
                  className="icon-button"
                  disabled={i === 0}
                  aria-label={`${p.name} 위로 이동`}
                  onClick={() => onMoveUp(i)}
                >
                  ↑
                </button>
                <button
                  className="icon-button"
                  aria-label={`${p.name} 제외`}
                  onClick={() => onToggle(p.id)}
                >
                  ×
                </button>
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
            <label htmlFor="journey-name">여행 이름</label>
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
            <button
              className="primary"
              disabled={!selected.length || !ready || busy}
            >
              {busy ? '여행 저장 중…' : '여행 저장'}
            </button>
          </form>
        )}
        {selected.length > 0 && (
          <button className="secondary add-more" onClick={onBrowse}>
            장소 더 담기
          </button>
        )}
        <p className="fine">
          여행 계획용 시연 서비스입니다. 실제 할인·입장·결제 기능은 없습니다.
        </p>
      </div>
    </aside>
  );
}
