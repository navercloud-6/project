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
      onNotice('방문 기록을 저장했습니다. 만족도는 다음 추천에 반영됩니다.');
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
          {error} 입력한 내용은 유지됩니다. 다시 저장해 주세요.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void saveVisit();
        }}
      >
        <label htmlFor="rating">이번 방문은 어땠나요?</label>
        <select
          id="rating"
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {'★'.repeat(n)} ({n}점)
            </option>
          ))}
        </select>
        <label htmlFor="note">나만의 메모</label>
        <textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="기억하고 싶은 순간을 남겨 주세요."
        />
        <p className="fine">
          만족도는 다음 추천에 반영됩니다. 메모는 AI로 보내지 않습니다. 방문
          인증이 아닌 개인 기록입니다.
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
            document.getElementById('note')?.focus();
          }}
        />
      </details>
    </Modal>
  );
}
