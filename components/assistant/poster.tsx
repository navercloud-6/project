'use client';
import { useState } from 'react';
import type { Place } from '@/lib/domain/catalog';
import type { Journey } from '@/lib/domain/contracts';
import { ErrorText, type Capabilities } from './shared';
import { request, api } from '@/lib/adapters/client-api';
export function Poster({
  places,
  capabilities,
  onSaved,
}: {
  places: Place[];
  capabilities: Capabilities;
  onSaved: (j: Journey) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [placeId, setPlace] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function extract() {
    if (!file) return;
    setBusy(true);
    setError('');
    setText('');
    setTitle('');
    setDate('');
    setLocation('');
    setMessage('');
    try {
      const r = await request('/api/poster', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const d = await r.json();
      setText(d.text);
      setTitle(d.draft.title);
      setDate(d.draft.date);
      setLocation(d.draft.location);
      setMessage(d.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      const d = await api<{ journey: Journey }>('/api/journeys', 'POST', {
        name: title,
        date,
        placeIds: [placeId],
        event: { location, origin: 'poster' },
      });
      onSaved(d.journey);
      setMessage('행사 여행을 저장했습니다. 내 여행에서 확인하세요.');
      setTitle('');
      setDate('');
      setLocation('');
      setPlace('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="tool-section">
      <span className="pill">포스터에서 여행으로</span>
      <h2>행사 일정을 놓치지 마세요</h2>
      <p className="fine">
        JPEG·PNG·WebP, 2MB 이하. 인식 버튼을 누르면 NAVER Cloud로 이미지가
        전송됩니다. 포스터 원본은 보관하지 않습니다.
      </p>
      <label htmlFor="poster-file">행사 포스터</label>
      <input
        id="poster-file"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          setFile(e.target.files?.[0] || null);
          setError('');
        }}
      />
      <button
        className="secondary"
        disabled={busy || !file || !capabilities.ocr}
        onClick={extract}
      >
        {busy ? '처리 중…' : '포스터 읽기'}
      </button>
      {!capabilities.ocr && (
        <p className="fine">
          OCR 설정 전에는 아래 항목을 직접 입력해 체험할 수 있습니다.
        </p>
      )}
      {text && (
        <details>
          <summary>인식한 원문 확인</summary>
          <p className="ocr-text">{text}</p>
        </details>
      )}
      <ErrorText text={error} />
      {message && <p role="status">{message}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label htmlFor="event-title">확인한 행사명</label>
        <input
          id="event-title"
          required
          maxLength={60}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label htmlFor="event-date">방문할 행사 날짜</label>
        <input
          id="event-date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <label htmlFor="event-location">포스터에 적힌 행사 장소</label>
        <input
          id="event-location"
          required
          maxLength={200}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <label htmlFor="event-place">연결할 관광지 (직접 확인)</label>
        <select
          id="event-place"
          required
          value={placeId}
          onChange={(e) => setPlace(e.target.value)}
        >
          <option value="">관광지를 선택하세요</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="fine">
          연결할 장소가 목록에 없다면 저장하지 마세요. 행사 기간·장소가 실제로
          일치하는지 원본 안내에서 확인하세요.
        </p>
        <button className="primary" disabled={busy}>
          확인한 일정으로 여행 저장
        </button>
      </form>
    </section>
  );
}
