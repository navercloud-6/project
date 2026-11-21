'use client';
import { useEffect, useRef, useState } from 'react';
import { api, request } from '@/lib/adapters/client-api';
import {
  BRIEFING_CACHE_MS,
  briefingOutput,
  type BriefingLanguage,
  type BriefingOutput,
} from '@/lib/domain/briefing';
import { ErrorText, type Capabilities } from './assistant/shared';

const BRIEFING_DEBOUNCE_MS = 350;

type TextState = {
  key: string;
  data?: BriefingOutput;
  error?: string;
};

/**
 * 날씨·옷차림·추천 명소·맛집 통합 안내.
 * 시·군(또는 언어)을 고르면 원고가 자동으로 만들어지고, 원고가 오면 음성도 미리 받아 두어
 * 듣기 버튼을 누르면 기다리지 않고 바로 재생한다.
 */
export function WeatherBriefing({
  region,
  capabilities,
  onLoaded,
}: {
  region: string;
  capabilities?: Capabilities;
  // 원고가 오면 화면의 명소·맛집 카드를 같은 순서·이유로 맞추기 위해 알려 준다.
  onLoaded?: (data: BriefingOutput) => void;
}) {
  const [lang, setLang] = useState<BriefingLanguage>('ko');
  const key = `${region}:${lang}`;
  const [text, setText] = useState<TextState>({ key });
  const [audio, setAudio] = useState<{ key: string; url: string } | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  // 시·군·언어별로 미리 받아 둔 원고(10분)·음성(받는 중이면 Promise)
  const cachedTexts = useRef(
    new Map<string, { at: number; data: BriefingOutput }>(),
  );
  const voices = useRef(new Map<string, Promise<string>>());
  const firstLoad = useRef(true);

  const englishOff = capabilities ? !capabilities.translate : false;
  const voiceOff = capabilities ? !capabilities.voice : false;
  const place = region === '전체' ? '경기도' : region;

  // 시·군·언어가 바뀌면 원고를 자동으로 불러온다(연속 전환 시 350ms 디바운스·이전 요청 취소).
  useEffect(() => {
    let active = true;
    const saved = cachedTexts.current.get(key);
    if (saved && Date.now() - saved.at < BRIEFING_CACHE_MS) {
      firstLoad.current = false;
      setText({ key, data: saved.data });
      setVoiceError('');
      onLoaded?.(saved.data);
      if (!voiceOff) prefetch(region, lang).catch(() => undefined);
      return;
    }
    setText({ key });
    setVoiceError('');
    const controller = new AbortController();
    const delay = firstLoad.current ? 0 : BRIEFING_DEBOUNCE_MS;
    firstLoad.current = false;
    const timer = setTimeout(() => {
      api(
        '/api/assistant',
        'POST',
        { action: 'briefing', region, lang },
        controller.signal,
      )
        .then((r) => {
          if (!active) return;
          const data = briefingOutput.parse(r);
          cachedTexts.current.set(key, { at: Date.now(), data });
          setText({ key, data });
          onLoaded?.(data);
          if (!voiceOff) prefetch(region, lang).catch(() => undefined);
        })
        .catch((e) => {
          if (!active || (e instanceof Error && e.name === 'AbortError'))
            return;
          setText({ key, error: (e as Error).message });
        });
    }, delay);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, region, lang]);

  // 화면을 떠날 때 받아 둔 음성 주소를 정리한다.
  useEffect(() => {
    const saved = voices.current;
    return () => {
      for (const url of saved.values())
        url.then(URL.revokeObjectURL).catch(() => undefined);
    };
  }, []);

  // 같은 시·군·언어의 음성은 한 번만 받는다(실패하면 다음에 다시 받는다).
  function prefetch(r: string, l: BriefingLanguage) {
    const k = `${r}:${l}`;
    const saved = voices.current.get(k);
    if (saved) return saved;
    const loading = request('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'briefingVoice', region: r, lang: l }),
    }).then(async (response) => URL.createObjectURL(await response.blob()));
    voices.current.set(k, loading);
    loading.catch(() => voices.current.delete(k));
    return loading;
  }

  async function play() {
    setVoiceBusy(true);
    setVoiceError('');
    try {
      setAudio({ key, url: await prefetch(region, lang) });
    } catch (e) {
      setVoiceError((e as Error).message);
    } finally {
      setVoiceBusy(false);
    }
  }

  const current = text.key === key ? text : { key };
  const loading = !current.data && !current.error;
  const currentAudio = audio?.key === key ? audio.url : '';

  return (
    <section
      className="weather-briefing"
      aria-labelledby="weather-briefing-title"
      aria-busy={loading}
    >
      <div className="weather-briefing-heading">
        <h2 id="weather-briefing-title">오늘의 안내</h2>
        <p className="fine">
          {place}의 날씨·옷차림·추천 명소·맛집을 1분 안내로 정리했어요.
        </p>
      </div>
      <div
        className="weather-briefing-actions"
        role="group"
        aria-label="안내 언어"
      >
        {(['ko', 'en'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={value === lang ? undefined : 'secondary'}
            aria-pressed={value === lang}
            disabled={value === 'en' && englishOff}
            onClick={() => setLang(value)}
          >
            {value === 'ko' ? '한국어' : 'English'}
          </button>
        ))}
        <button
          type="button"
          disabled={!current.data || voiceBusy || voiceOff}
          onClick={play}
        >
          {voiceBusy ? '음성 준비 중…' : '▶ 음성으로 듣기'}
        </button>
      </div>
      {englishOff && (
        <p className="fine">영어 안내는 Papago 키 설정 후 사용할 수 있어요.</p>
      )}
      {voiceOff && (
        <p className="fine">음성 키가 설정되지 않아 안내 원고만 보여드려요.</p>
      )}
      <ErrorText text={current.error ?? voiceError} />
      {currentAudio && (
        <audio
          controls
          autoPlay
          src={currentAudio}
          aria-label={`${place} 오늘의 안내 음성`}
        />
      )}
      {loading && (
        <p className="fine">
          안내 원고를 만들고 있어요… (처음 한 번은 10초 정도 걸려요)
        </p>
      )}
      {current.data && (
        <div className="weather-briefing-result">
          <p className="weather-briefing-script" lang={current.data.lang}>
            {current.data.script}
          </p>
          <p className="fine">
            {current.data.mode === 'clova'
              ? 'HyperCLOVA X가 날씨·옷차림 자료와 블로그 후기로 작성한 원고입니다. 장소 이름·메뉴는 자료 그대로입니다.'
              : '규칙 기반으로 작성한 원고입니다.'}
            {current.data.lang === 'en' && ' Papago로 번역했습니다.'}
            {current.data.weatherMode === 'demo' && ' 데모 기상 기준입니다.'}
          </p>
        </div>
      )}
    </section>
  );
}
