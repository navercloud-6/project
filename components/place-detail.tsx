'use client';
import { PlaceImage } from './place-image';
import type { Place } from '@/lib/domain/catalog';
import type { Capabilities } from '@/lib/application/ports';
import { PhotoCredit } from './photo-credit';
import { Modal } from './modal';
import { LanguageTools } from './assistant/language-tools';
export function PlaceDetail({
  detail,
  selected,
  full,
  selectionCount = 0,
  capabilities,
  onClose,
  onToggle,
  onReview,
}: {
  detail: Place;
  selected: boolean;
  full: boolean;
  selectionCount?: number;
  capabilities: Capabilities;
  onClose: () => void;
  onToggle: (id: string) => void;
  onReview?: () => void;
}) {
  return (
    <Modal title={detail.name} onClose={onClose}>
      <div
        className={
          detail.image ? 'detail-image' : 'detail-image detail-image-empty'
        }
      >
        <PlaceImage
          image={detail.image}
          sizes="(max-width: 760px) calc(100vw - 84px), 620px"
          loading="eager"
          fallback={
            <div className="detail-photo-placeholder">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8" cy="8" r="1.5" />
                <path d="m3 17 5-5 4 4 3-3 6 6" />
              </svg>
              <strong>등록된 사진이 없어요</strong>
              <span>장소 정보는 아래에서 확인해 주세요.</span>
            </div>
          }
        />
      </div>
      <span className="pill">{detail.region} · 검토 전 자료</span>
      <p>{detail.description}</p>
      <dl>
        <dt>주소</dt>
        <dd>{detail.address}</dd>
        <dt>운영·요금·예약</dt>
        <dd>현재 정보 미확인. 방문 전 공식 안내를 확인해 주세요.</dd>
        <dt>자료 확인일</dt>
        <dd>{detail.checkedOn} (현재 운영 확인일 아님)</dd>
      </dl>
      {detail.sources.map((s) => (
        <p key={s.code}>
          <a href={s.url} target="_blank" rel="noreferrer">
            {s.publisher} — {s.title} ↗
          </a>
        </p>
      ))}
      {detail.image && (
        <p className="fine">
          <PhotoCredit image={detail.image} />. 카드 표시를 위해 일부가 잘려
          보일 수 있습니다.
        </p>
      )}
      {full && !selected && (
        <div className="tool-result" role="status">
          <p>
            한 여행에는 최대 8곳까지 담을 수 있어요. 담은 여행에서 장소를 제외한
            뒤 다시 담아 주세요.
          </p>
          {onReview && (
            <button type="button" className="secondary" onClick={onReview}>
              담은 여행에서 정리하기
            </button>
          )}
        </div>
      )}
      <div className="modal-actions">
        {selected && onReview && (
          <button type="button" className="primary" onClick={onReview}>
            {selectionCount > 0
              ? `담은 여행 확인 (${selectionCount}곳)`
              : '담은 여행 확인'}
          </button>
        )}
        <button
          type="button"
          className={selected ? 'secondary' : 'primary'}
          disabled={full && !selected}
          onClick={() => onToggle(detail.id)}
        >
          {selected ? '담기 취소' : '여행에 담기'}
        </button>
      </div>
      <details className="journey-options">
        <summary>번역·음성 안내 (선택)</summary>
        <LanguageTools
          key={detail.id}
          placeId={detail.id}
          capabilities={capabilities}
        />
      </details>
    </Modal>
  );
}
