'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { api, request } from '@/lib/adapters/client-api';
import { ErrorText, type Capabilities } from './shared';
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
  const [busyKind, setBusyKind] = useState<'voice' | 'translate' | null>(null);
  const [error, setError] = useState('');
  // 정적 장소 설명의 음성·번역은 같은 화면 안에서 다시 요청하지 않고 재사용한다.
  const voiceCache = useRef(new Map<string, string>());
  const translationCache = useRef(new Map<string, string>());
  useEffect(() => {
    const savedVoices = voiceCache.current;
    return () => {
      for (const url of savedVoices.values()) URL.revokeObjectURL(url);
    };
  }, []);
  useEffect(() => {
    setText(
      placeId
        ? (translationCache.current.get(`${placeId}:${target}`) ?? '')
        : '',
    );
    setAudio(placeId ? (voiceCache.current.get(placeId) ?? '') : '');
    setError('');
  }, [placeId, journeyId]);
  async function run(kind: 'voice' | 'translate') {
    if (kind === 'voice' && placeId) {
      const cached = voiceCache.current.get(placeId);
      if (cached) {
        setAudio(cached);
        setError('');
        return;
      }
    }
    if (kind === 'translate' && placeId) {
      const cached = translationCache.current.get(`${placeId}:${target}`);
      if (cached) {
        setText(cached);
        setError('');
        return;
      }
    }
    setBusyKind(kind);
    setError('');
    try {
      if (kind === 'voice') {
        const r = await request('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'voice', placeId }),
        });
        const url = URL.createObjectURL(await r.blob());
        if (placeId) voiceCache.current.set(placeId, url);
        setAudio(url);
      } else {
        const res = await api<{ text: string }>('/api/assistant', 'POST', {
          action: 'translate',
          placeId,
          journeyId,
          target,
        });
        if (placeId)
          translationCache.current.set(`${placeId}:${target}`, res.text);
        setText(res.text);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyKind(null);
    }
  }
  const busy = busyKind !== null;
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
            {busyKind === 'voice' ? '음성 불러오는 중…' : '설명 듣기'}
          </button>
        )}
        <label htmlFor={id}>번역 언어</label>
        <select
          id={id}
          value={target}
          onChange={(e) => {
            const next = e.target.value;
            setTarget(next);
            setText(
              placeId
                ? (translationCache.current.get(`${placeId}:${next}`) ?? '')
                : '',
            );
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
          {busyKind === 'translate' ? '번역하는 중…' : '번역 보기'}
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
