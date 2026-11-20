'use client';
import { useState } from 'react';
import type { Place } from '@/lib/domain/catalog';
import type { Journey } from '@/lib/domain/contracts';
import {
  assistant,
  ErrorText,
  type Capabilities,
  type History,
} from './shared';
type Proposal = {
  name: string;
  date: string;
  placeIds: string[];
  explanation: string;
  mode: string;
};
export function EditJourney({
  journey,
  places,
  capabilities,
  onSaved,
}: {
  journey: Journey;
  places: Place[];
  capabilities: Capabilities;
  onSaved: (j: Journey) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [history, setHistory] = useState<History>([]);
  const [preview, setPreview] = useState<{
    proposal: Proposal;
    revision: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  async function propose() {
    setBusy(true);
    setError('');
    setPreview(null);
    setDone('');
    try {
      setPreview(
        await (
          await assistant({
            action: 'edit',
            journeyId: journey.id,
            prompt,
            history,
          })
        ).json(),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      const d = await (
        await assistant({ action: 'apply', journeyId: journey.id, ...preview })
      ).json();
      onSaved(d.journey);
      setHistory(
        [
          ...history,
          { role: 'user', content: prompt },
          { role: 'assistant', content: JSON.stringify(preview.proposal) },
        ].slice(-6) as History,
      );
      setPreview(null);
      setDone('여행 변경을 저장했습니다.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="edit-tool">
      <p className="fine">
        {capabilities.clova
          ? '원하는 변경을 말해 주세요. 변경안을 확인한 뒤 적용합니다.'
          : '규칙 데모: “2번째 빼기”, “순서 반대로”, “오이도 빨강등대 추가”'}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void propose();
        }}
      >
        <label htmlFor={`edit-${journey.id}`}>변경 요청</label>
        <input
          id={`edit-${journey.id}`}
          value={prompt}
          minLength={2}
          maxLength={500}
          required
          placeholder="예: 순서 반대로, 2번째 빼기"
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button className="secondary" disabled={busy}>
          {busy && !preview ? '변경안 만드는 중…' : '변경안 만들기'}
        </button>
      </form>
      <ErrorText text={error} />
      {done && (
        <p className="tool-result" role="status">
          {done}
        </p>
      )}
      {preview && (
        <div className="tool-result">
          <span className="pill">
            {preview.proposal.mode === 'demo' ? '데모 변경안' : 'AI 변경안'}
          </span>
          <p>{preview.proposal.explanation}</p>
          <p>
            <strong>{preview.proposal.name}</strong> · {preview.proposal.date}
          </p>
          <div className="edit-comparison">
            <div>
              <h4>현재</h4>
              <ol>
                {journey.placeIds.map((id) => (
                  <li key={id}>{places.find((p) => p.id === id)?.name}</li>
                ))}
              </ol>
            </div>
            <div>
              <h4>변경 후</h4>
              <ol>
                {preview.proposal.placeIds.map((id) => (
                  <li key={id}>{places.find((p) => p.id === id)?.name}</li>
                ))}
              </ol>
            </div>
          </div>
          <p className="fine">
            방문 기록·사진이 있는 장소는 제외할 수 없습니다.
          </p>
          <div className="tool-actions">
            <button
              type="button"
              className="primary compact"
              disabled={busy}
              onClick={apply}
            >
              {busy ? '적용 중…' : '이 변경 적용하기'}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
