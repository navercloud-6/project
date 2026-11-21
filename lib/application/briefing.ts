import { places } from '@/lib/domain/catalog';
import { ApplicationError } from '@/lib/domain/errors';
import {
  BRIEFING_CACHE_MS,
  BRIEFING_EN_LIMIT,
  briefingFacts,
  briefingOutput,
  composeScript,
  foreignItems,
  headFacts,
  ruleScript,
  shorten,
  tidyHead,
  unknownNumbers,
  withReasons,
  withSafety,
  type BriefingLanguage,
  type BriefingOutput,
} from '@/lib/domain/briefing';
import type { RestaurantsResponse } from '@/lib/domain/restaurants';
import { alertsSpeech, type AlertsResponse } from '@/lib/domain/alerts';
import type { WeatherResponse } from '@/lib/domain/weather';
import type { AIPort } from './ports';

export type BriefingDeps = {
  ai: AIPort;
  now: () => number;
  weather: (region: string) => Promise<WeatherResponse>;
  restaurants?: (region: string) => Promise<RestaurantsResponse>;
  placeReviews?: (name: string, region: string) => Promise<string[]>;
  alerts?: (region: string) => Promise<AlertsResponse>;
};

type Entry<T> = { at: number; value: T };

/**
 * 시·군 통합 안내. 원고(텍스트)와 음성을 따로 만든다.
 * - 원고: 시·군을 고르면 화면이 자동으로 요청한다. 같은 시·군·언어는 10분간 모두가 같이 쓴다
 *   (날씨·장소 자료라 사람마다 다르지 않다).
 * - 음성: 원고가 만들어지면 바로 미리 만들어 두어 듣기를 누르면 곧바로 재생된다.
 *   같은 원고의 음성도 10분간 다시 쓴다.
 */
export function createBriefing({
  ai,
  now,
  weather,
  restaurants,
  placeReviews,
  alerts,
}: BriefingDeps) {
  const texts = new Map<string, Entry<BriefingOutput>>();
  const audios = new Map<string, Entry<Uint8Array>>();
  const pending = new Map<string, Promise<BriefingOutput>>();
  const audioPending = new Map<string, Promise<Uint8Array>>();
  const key = (region: string, lang: BriefingLanguage) => `${region}:${lang}`;
  const fresh = <T>(entry: Entry<T> | undefined) =>
    entry && now() - entry.at < BRIEFING_CACHE_MS ? entry.value : undefined;

  async function korean(region: string): Promise<BriefingOutput> {
    const caps = ai.capabilities();
    const current = await weather(region);
    // 맛집은 부가 정보: 검색 키가 없거나 실패해도 안내는 계속한다.
    const nearby = restaurants
      ? await restaurants(region)
          .then((r) => r.items)
          .catch(() => [])
      : [];
    // 특보·지진도 부가 정보: 조회 실패 시 안전 안내 없이 계속한다.
    const safety = alerts
      ? await alerts(region)
          .then((r) => alertsSpeech(r.alerts))
          .catch(() => '')
      : '';
    const facts = briefingFacts(current, places, nearby);
    let script = '';
    let mode: 'clova' | 'rule' = caps.clova ? 'clova' : 'rule';
    let reasonedFacts = facts;
    if (caps.clova) {
      // HCX는 인사·날씨·옷차림·준비물만 쓰고, 명소·맛집 이름은 코드가 자료 그대로 붙인다.
      // 자료에 없는 숫자나 오늘 옷차림에 없는 옷·준비물을 쓴 앞부분은 1번 다시 요청하고,
      // 그래도 틀리면 규칙 원고를 쓴다.
      const head = headFacts(facts);
      // 블로그 후기 검색 → 장소별 추천 이유 작성을 앞부분 작성과 동시에 진행한다.
      const reasons = (async () =>
        ai.placeReasons(
          await Promise.all(
            facts.places.map(async ({ name, description, tags }) => ({
              name,
              description,
              tags,
              reviews: placeReviews ? await placeReviews(name, region) : [],
            })),
          ),
          head.weather,
        ))().catch(() => [] as string[]);
      let accepted = '';
      for (let attempt = 0; attempt < 2 && !accepted; attempt++) {
        const draft = tidyHead(await ai.briefing(head));
        if (
          draft &&
          unknownNumbers(draft, head).length === 0 &&
          foreignItems(draft, head).length === 0
        )
          accepted = draft;
      }
      const reasoned = withReasons(facts, await reasons);
      reasonedFacts = reasoned;
      if (accepted) script = composeScript(accepted, reasoned);
      else {
        script = ruleScript(reasoned);
        mode = 'rule';
      }
    } else script = ruleScript(facts);
    // 안전 안내는 AI를 거치지 않고 첫 인사 바로 뒤에 자료 그대로 넣는다.
    script = withSafety(script, safety);
    if (!script)
      throw new ApplicationError(
        'UPSTREAM_INVALID',
        'AI가 유효한 안내 원고를 반환하지 않았습니다. 다시 시도해 주세요.',
      );
    // 원고에 쓴 추천 이유(AI 또는 규칙)를 화면에도 같은 순서로 보여 준다.
    const shown = reasonedFacts;
    return briefingOutput.parse({
      region: current.region,
      lang: 'ko',
      mode,
      weatherMode: current.mode,
      script,
      places: shown.places.map(({ id, name, reason }) => ({
        id,
        name,
        reason,
      })),
      restaurants: shown.restaurants.map(({ name }) => ({ name })),
    });
  }

  /** 이미 만들어 두었거나 만드는 중인 원고·음성인지(그렇다면 새 외부 호출이 없다). */
  function hasText(region: string, lang: BriefingLanguage) {
    const k = key(region, lang);
    return Boolean(fresh(texts.get(k)) || pending.has(k));
  }
  function hasAudio(region: string, lang: BriefingLanguage) {
    const k = key(region, lang);
    return Boolean(fresh(audios.get(k)) || audioPending.has(k));
  }

  async function text(
    region: string,
    lang: BriefingLanguage,
  ): Promise<BriefingOutput> {
    if (lang === 'en' && !ai.capabilities().translate)
      throw new ApplicationError(
        'UNAVAILABLE',
        'Papago API 키 설정이 필요합니다.',
      );
    const k = key(region, lang);
    const cached = fresh(texts.get(k));
    if (cached) return cached;
    const running = pending.get(k);
    if (running) return running;
    const request = (async () => {
      // 영어는 같은 한국어 원고를 번역한다(한국어 원고도 함께 저장된다).
      const value =
        lang === 'ko'
          ? await korean(region)
          : await text(region, 'ko').then(async (ko) =>
              briefingOutput.parse({
                ...ko,
                lang: 'en',
                script: shorten(
                  await ai.translate(ko.script, 'en'),
                  BRIEFING_EN_LIMIT,
                ),
              }),
            );
      texts.set(k, { at: now(), value });
      // 듣기를 누르기 전에 음성을 미리 만들어 둔다(실패해도 원고는 그대로 보여 준다).
      if (ai.capabilities().voice) audio(region, lang).catch(() => undefined);
      return value;
    })().finally(() => pending.delete(k));
    pending.set(k, request);
    return request;
  }

  async function audio(region: string, lang: BriefingLanguage) {
    const k = key(region, lang);
    const cached = fresh(audios.get(k));
    if (cached) return cached;
    const running = audioPending.get(k);
    if (running) return running;
    const request = (async () => {
      const { script } = await text(region, lang);
      const value = await ai.voice(script, lang === 'en' ? 'clara' : 'nara');
      audios.set(k, { at: now(), value });
      return value;
    })().finally(() => audioPending.delete(k));
    audioPending.set(k, request);
    return request;
  }

  return { text, audio, hasText, hasAudio };
}

export type BriefingService = ReturnType<typeof createBriefing>;
