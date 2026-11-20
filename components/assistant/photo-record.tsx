'use client';
import { useEffect, useState } from 'react';
import type { Place } from '@/lib/domain/catalog';
import type { Journey } from '@/lib/domain/contracts';
import { assistant, ErrorText, type Capabilities } from './shared';
import { request, api } from '@/lib/adapters/client-api';
export function PhotoRecord({
  journey,
  place,
  capabilities,
  onSaved,
  onDraft,
}: {
  journey: Journey;
  place: Place;
  capabilities: Capabilities;
  onSaved: (j: Journey) => void;
  onDraft: (text: string) => void;
}) {
  const url = `/api/photos?journey=${journey.id}&place=${place.id}`;
  const [exists, setExists] = useState(false);
  const [version, setVersion] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [busyKind, setBusyKind] = useState<'upload' | 'write' | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  useEffect(() => {
    let active = true;
    api<{ exists: boolean }>(url + '&metadata=1')
      .then((d) => {
        if (active) setExists(d.exists);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [url]);
  async function upload() {
    if (!file) return;
    setBusyKind('upload');
    setError('');
    try {
      const r = await request(url, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const d = await r.json();
      setExists(true);
      setVersion(Date.now());
      setDraft('');
      onSaved(d.journey);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyKind(null);
    }
  }
  async function write() {
    setBusyKind('write');
    setError('');
    try {
      const d = await (
        await assistant({
          action: 'diary',
          journeyId: journey.id,
          placeId: place.id,
        })
      ).json();
      setDraft(d.draft);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyKind(null);
    }
  }
  const busy = busyKind !== null;
  return (
    <section className="photo-record">
      <h3>사진으로 남기는 하루</h3>
      {exists && (
        <img
          className="detail-image"
          src={`${url}&v=${version}`}
          alt={`${place.name}에 저장한 나의 여행 사진`}
        />
      )}
      <label htmlFor="visit-photo">방문 사진 (2MB 이하)</label>
      <input
        id="visit-photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <div className="tool-actions">
        <button
          type="button"
          className="secondary"
          disabled={busy || !file}
          onClick={upload}
        >
          {busyKind === 'upload'
            ? '사진 저장 중…'
            : exists
              ? '사진 교체하기'
              : '사진 저장하기'}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || !exists || !capabilities.clova}
          onClick={write}
        >
          {busyKind === 'write'
            ? '일기 초안 만드는 중…'
            : '사진으로 일기 초안 만들기'}
        </button>
      </div>
      <p className="fine">
        사진은 이 브라우저의 여행에 비공개로 저장합니다. 초안 만들기를 누를 때만
        사진을 NAVER Cloud로 보냅니다. AI 키가 없으면 사진 저장만 가능합니다.
      </p>
      <ErrorText text={error} />
      {draft && (
        <div className="tool-result">
          <p>{draft}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => onDraft(draft)}
          >
            이 초안을 메모에 넣기
          </button>
          <p className="fine">
            기존 메모를 초안으로 바꿉니다. 수정 후 ‘방문 기록 저장’을 눌러
            확정하세요.
          </p>
        </div>
      )}
    </section>
  );
}
