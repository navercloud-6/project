import type { Place } from '@/lib/domain/catalog';

export function PlaceCard({
  place: p,
  selected,
  onDetail,
  onToggle,
}: {
  place: Place;
  selected: boolean;
  onDetail: (place: Place) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <article className="place">
      <button
        className="place-photo"
        onClick={() => onDetail(p)}
        aria-label={`${p.name} 상세 보기`}
      >
        {p.image ? (
          <img src={p.image.path} alt={p.image.alt} loading="lazy" />
        ) : (
          <span className="no-photo">시흥의 또 다른 풍경</span>
        )}
        <span className="region-label">{p.region}</span>
      </button>
      <div className="place-body">
        <div className="tags">
          {p.tags.slice(0, 2).join(' / ') || '시흥 여행'}
        </div>
        <h3>
          <button className="text-button" onClick={() => onDetail(p)}>
            {p.name}
          </button>
        </h3>
        <p>{p.description}</p>
        <div className="place-bottom">
          <button className="detail-link" onClick={() => onDetail(p)}>
            장소 정보
          </button>
          <button
            className={selected ? 'add selected' : 'add'}
            aria-pressed={selected}
            onClick={() => onToggle(p.id)}
          >
            {selected ? '담기 취소' : '여행에 담기'}
          </button>
        </div>
      </div>
    </article>
  );
}
