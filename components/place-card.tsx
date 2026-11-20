import Image from 'next/image';
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
    <article className={selected ? 'place selected' : 'place'}>
      <button
        type="button"
        className="place-photo"
        onClick={() => onDetail(p)}
        aria-label={`${p.name} 상세 보기`}
      >
        {p.image ? (
          <Image
            src={p.image.path}
            alt={p.image.alt}
            fill
            sizes="(max-width: 760px) calc(100vw - 36px), (max-width: 960px) calc((100vw - 68px) / 2), (max-width: 1400px) calc((100vw - 136px) / 3), 422px"
          />
        ) : (
          <span className="no-photo">시흥의 또 다른 풍경</span>
        )}
        <span className="region-label">{p.region}</span>
        {selected && <span className="selected-badge">담은 장소</span>}
      </button>
      <div className="place-body">
        <div className="tags">
          {p.tags.slice(0, 2).join(' · ') || '시흥 여행'}
        </div>
        <h3>
          <button
            type="button"
            className="text-button"
            onClick={() => onDetail(p)}
          >
            {p.name}
          </button>
        </h3>
        <p>{p.description}</p>
        <div className="place-bottom">
          <button
            type="button"
            className="detail-link"
            onClick={() => onDetail(p)}
          >
            장소 상세
          </button>
          <button
            type="button"
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
