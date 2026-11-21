'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/adapters/client-api';
import {
  briefingOutput,
  type BriefingLanguage,
  type BriefingOutput,
} from '@/lib/domain/briefing';
import { ErrorText, type Capabilities } from './assistant/shared';

const LABEL: Record<BriefingLanguage, string> = {
  ko: '한국어로 듣기',
  en: 'English',
};

function audioUrl(base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
}

/** 날씨·옷차림·추천 명소를 한 번에 들려주는 시·군 안내. */
export function WeatherBriefing({
  region,
  capabilities,
}: {
  region: string;
  capabilities?: Capabilities;
}) {
  const [busy, setBusy] = useState<BriefingLanguage | null>(null);
  const [result, setResult] = useState<BriefingOutput | null>(null);
  const [audio, setAudio] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setResult(null);
    setError('');
    setAudio('');
  }, [region]);
  useEffect(
    () => () => {
      if (audio) URL.revokeObjectURL(audio);
    },
    [audio],
  );

  async function run(lang: BriefingLanguage) {
    setBusy(lang);
    setError('');
    try {
      const data = briefingOutput.parse(
        await api('/api/assistant', 'POST', {
          action: 'briefing',
          region,
          lang,
        }),
      );
      setResult(data);
      setAudio(data.audio ? audioUrl(data.audio) : '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const englishOff = capabilities ? !capabilities.translate : false;
  const place = region === '전체' ? '경기도' : region;
  return (
    <section
      className="weather-briefing"
      aria-labelledby="weather-briefing-title"
    >
      <div className="weather-briefing-heading">
        <h2 id="weather-briefing-title">오늘의 안내 듣기</h2>
        <p className="fine">
          {place}의 날씨·옷차림·추천 명소를 1분 안내로 들려드려요.
        </p>
      </div>
      <div className="weather-briefing-actions">
        {(['ko', 'en'] as const).map((lang) => (
          <button
            key={lang}
            type="button"
            className={lang === 'ko' ? undefined : 'secondary'}
            disabled={busy !== null || (lang === 'en' && englishOff)}
            onClick={() => run(lang)}
          >
            {busy === lang ? '안내 만드는 중…' : LABEL[lang]}
          </button>
        ))}
      </div>
      {englishOff && (
        <p className="fine">영어 안내는 Papago 키 설정 후 사용할 수 있어요.</p>
      )}
      <ErrorText text={error} />
      {result && (
        <div className="weather-briefing-result">
          {audio ? (
            <audio
              controls
              autoPlay
              src={audio}
              aria-label={`${place} 오늘의 안내 음성`}
            />
          ) : (
            <p className="fine">
              음성 키가 설정되지 않아 안내 원고만 보여드려요.
            </p>
          )}
          <p className="weather-briefing-script" lang={result.lang}>
            {result.script}
          </p>
          <p className="fine">
            {result.mode === 'clova'
              ? 'HyperCLOVA X가 날씨·옷차림·추천 명소 자료로 작성한 원고입니다.'
              : '규칙 기반으로 작성한 원고입니다.'}
            {result.lang === 'en' && ' Papago로 번역했습니다.'}
            {result.weatherMode === 'demo' && ' 데모 기상 기준입니다.'}
          </p>
        </div>
      )}
    </section>
  );
}
