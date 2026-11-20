'use client';
import { useMemo, useState } from 'react';
import type { Place } from '@/lib/domain/catalog';
import type { Journey } from '@/lib/domain/contracts';
import { ErrorText, groupPlacesByRegion, type Capabilities } from './shared';
import { request, api } from '@/lib/adapters/client-api';
export function Poster({
  places,
  capabilities,
  onSaved,
  onBrowse,
}: {
  places: Place[];
  capabilities: Capabilities;
  onSaved: (j: Journey) => void;
  onBrowse?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [placeFilter, setPlaceFilter] = useState('');
  const [placeId, setPlace] = useState('');
  const [busyKind, setBusyKind] = useState<'extract' | 'save' | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const filteredPlaces = useMemo(() => {
    const q = placeFilter.trim();
    if (!q) return places;
    return places.filter(
      (p) =>
        p.id === placeId ||
        p.name.includes(q) ||
        p.region.includes(q) ||
        Boolean(p.address?.includes(q)),
    );
  }, [places, placeFilter, placeId]);

  const groupedPlaces = useMemo(
    () => groupPlacesByRegion(filteredPlaces),
    [filteredPlaces],
  );

  async function extract() {
    if (!file) return;
    setBusyKind('extract');
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
      setBusyKind(null);
    }
  }
  async function save() {
    setBusyKind('save');
    setError('');
    try {
      const d = await api<{ journey: Journey }>('/api/journeys', 'POST', {
        name: title,
        date,
        placeIds: [placeId],
        event: { location, origin: 'poster' },
      });
      onSaved(d.journey);
      setMessage('행사 여행을 저장했어요. 내 여행에서 확인해 보세요.');
      setTitle('');
      setDate('');
      setLocation('');
      setPlace('');
      setPlaceFilter('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyKind(null);
    }
  }
  const busy = busyKind !== null;
  return (
    <section className="tool-section">
      <span className="pill">포스터에서 여행으로</span>
      <h2>행사 일정을 여행으로 저장해 보세요</h2>
      <div
        className={
          capabilities.ocr ? 'poster-ocr-box' : 'poster-ocr-box is-disabled'
        }
      >
        <label htmlFor="poster-file">포스터 자동 입력 (선택)</label>
        <p className="fine">
          {capabilities.ocr
            ? 'JPEG·PNG·WebP, 2MB 이하. 포스터 읽기를 누르면 NAVER Cloud로 이미지가 전송되며 원본은 보관하지 않습니다.'
            : '현재 OCR 키가 설정되지 않아 자동 인식은 준비 중입니다. 아래 양식에 행사 정보를 직접 입력해 저장할 수 있어요.'}
        </p>
        <div className="tool-actions">
          <input
            id="poster-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy || !capabilities.ocr}
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setError('');
            }}
          />
          <button
            type="button"
            className="secondary"
            disabled={busy || !file || !capabilities.ocr}
            onClick={extract}
          >
            {busyKind === 'extract' ? '포스터 읽는 중…' : '포스터 읽기'}
          </button>
        </div>
        {text && (
          <details>
            <summary>인식한 원문 확인</summary>
            <p className="ocr-text">{text}</p>
          </details>
        )}
      </div>
      <ErrorText text={error} />
      {message && (
        <p className="tool-result" role="status">
          {message}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="label-row">
          <label htmlFor="event-title">확인한 행사명</label>
          <span className="char-count">{title.length} / 60</span>
        </div>
        <input
          id="event-title"
          required
          maxLength={60}
          placeholder="예: 시흥 갯골 축제"
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
          placeholder="예: 시흥갯골생태공원 잔디광장"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <label htmlFor="event-place-filter">관광지 빠르게 찾기</label>
        <input
          id="event-place-filter"
          type="search"
          placeholder="도시명이나 장소명으로 아래 목록 좁히기 (예: 수원, 갯골)"
          value={placeFilter}
          onChange={(e) => setPlaceFilter(e.target.value)}
        />
        <label htmlFor="event-place">연결할 관광지 (직접 확인)</label>
        <select
          id="event-place"
          required
          value={placeId}
          onChange={(e) => setPlace(e.target.value)}
        >
          <option value="">
            {filteredPlaces.length
              ? `관광지를 선택하세요 (${filteredPlaces.length}곳)`
              : '검색 결과와 일치하는 관광지가 없어요'}
          </option>
          {groupedPlaces.map(([regionName, items]) => (
            <optgroup key={regionName} label={regionName}>
              {items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="fine">
          목록에 없는 장소는 연결할 수 없어요. 행사 기간·장소가 실제와 같은지
          원본 안내에서 확인해 주세요.
        </p>
        <div className="tool-actions">
          <button className="primary compact" disabled={busy}>
            {busyKind === 'save'
              ? '여행 저장 중…'
              : '확인한 일정으로 여행 저장'}
          </button>
          {onBrowse && (
            <button type="button" className="secondary" onClick={onBrowse}>
              장소 찾기
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
