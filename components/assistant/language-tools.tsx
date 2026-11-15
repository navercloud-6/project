'use client';
import { useEffect, useId, useState } from 'react';
import { assistant, ErrorText, type Capabilities } from './shared';
export function LanguageTools({
  placeId,
  journeyId,
  capabilities,
}: {
  placeId?: string;
  journeyId?: string;
  capabilities: Capabilities;
}) {
  const id = useId();
  const [target, setTarget] = useState('en');
  const [text, setText] = useState('');
  const [audio, setAudio] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(
    () => () => {
      if (audio) URL.revokeObjectURL(audio);
    },
    [audio],
  );
  async function run(kind: 'voice' | 'translate') {
    setBusy(true);
    setError('');
    try {
      const r = await assistant({ action: kind, placeId, journeyId, target });
      if (kind === 'voice') setAudio(URL.createObjectURL(await r.blob()));
      else setText((await r.json()).text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="language-tools">
      <div className="tool-actions">
        {placeId && (
          <button
            type="button"
            className="secondary"
            disabled={busy || !capabilities.voice}
            onClick={() => run('voice')}
          >
            설명 듣기
          </button>
        )}
        <label htmlFor={id}>번역 언어</label>
        <select
          id={id}
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setText('');
          }}
        >
          <option value="en">English</option>
          <option value="ja">日本語</option>
          <option value="zh-CN">中文</option>
        </select>
        <button
          type="button"
          className="secondary"
          disabled={busy || !capabilities.translate}
          onClick={() => run('translate')}
        >
          {busy ? '처리 중…' : '번역 보기'}
        </button>
      </div>
      {(!capabilities.translate || (placeId && !capabilities.voice)) && (
        <p className="fine">
          음성은 CLOVA Voice, 번역은 Papago 키 설정 후 사용할 수 있습니다.
        </p>
      )}
      {journeyId && capabilities.translate && (
        <p className="fine">
          여행 이름·날짜·장소 설명을 Papago로 전송합니다. 방문 메모는
          제외됩니다.
        </p>
      )}
      <ErrorText text={error} />
      {audio && <audio controls src={audio} aria-label="관광지 음성 안내" />}
      {text && (
        <div className="tool-result" lang={target}>
          <span className="pill">Papago · 기계 번역</span>
          <p>{text}</p>
        </div>
      )}
    </div>
  );
}
