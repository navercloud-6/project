'use client';
import type { Place } from '@/lib/domain/catalog';
import type { Journey } from '@/lib/domain/contracts';
import type { Capabilities } from '@/lib/application/ports';
import { useState } from 'react';
import { api } from '@/lib/adapters/client-api';
import { Modal } from './modal';
import { PhotoRecord } from './assistant/photo-record';
export function VisitRecord({
  journey,
  place,
  capabilities,
  onSaved,
  onClose,
  onNotice,
}: {
  journey: Journey;
  place: Place;
  capabilities: Capabilities;
  onSaved: (journey: Journey) => void;
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  const [rating, setRating] = useState(journey.records[place.id]?.rating || 5);
  const [note, setNote] = useState(journey.records[place.id]?.note || '');
  const [draftApplied, setDraftApplied] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function saveVisit() {
    setBusy(true);
    setError('');
    try {
      const d = await api<{ journey: Journey }>('/api/journeys', 'PATCH', {
        journeyId: journey.id,
        placeId: place.id,
        rating,
        note,
      });
      onSaved(d.journey);
      onClose();
      onNotice('방문 기록을 저장했어요. 만족도는 다음 추천에 반영돼요.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${place.name} 방문 기록`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {error && (
        <p className="message error" role="alert">
          {error} 입력한 내용은 유지돼요. 다시 저장해 주세요.
        </p>
      )}
      {draftApplied && (
        <p className="tool-result" role="status">
          AI 일기 초안을 메모에 넣었어요. 확인한 뒤 ‘방문 기록 저장’을 눌러
          주세요.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void saveVisit();
        }}
      >
        <label id="rating-label">이번 방문은 어땠나요?</label>
        <div
          className="rating-picker"
          role="radiogroup"
          aria-labelledby="rating-label"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              className={rating === n ? 'rating-chip active' : 'rating-chip'}
              onClick={() => setRating(n)}
            >
              <span aria-hidden="true">{'★'.repeat(n)}</span>
              <small>{n}점</small>
            </button>
          ))}
        </div>
        <div className="label-row">
          <label htmlFor="note">나만의 메모</label>
          <span className="char-count">{note.length} / 500</span>
        </div>
        <textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="기억하고 싶은 순간을 남겨 주세요."
        />
        <p className="fine">
          만족도는 다음 추천에 반영됩니다. 메모는 AI로 보내지 않으며 방문 인증이
          아닌 개인 기록입니다.
        </p>
        <button className="primary" disabled={busy}>
          {busy ? '저장 중…' : '방문 기록 저장'}
        </button>
      </form>
      <details className="journey-options">
        <summary>사진·AI 일기 추가 (선택)</summary>
        <PhotoRecord
          key={`${journey.id}-${place.id}`}
          journey={journey}
          place={place}
          capabilities={capabilities}
          onSaved={onSaved}
          onDraft={(draft) => {
            setNote(draft);
            setDraftApplied(true);
            document.getElementById('note')?.focus();
          }}
        />
      </details>
    </Modal>
  );
}
