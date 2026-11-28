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
  foodKind,
  type BriefingLanguage,
  type BriefingOutput,
} from '@/lib/domain/briefing';
import type { RestaurantsResponse } from '@/lib/domain/restaurants';
import { alertsSpeech, type AlertsResponse } from '@/lib/domain/alerts';
import type { WeatherResponse } from '@/lib/domain/weather';
import { createCache } from './cache';
import type { AIPort } from './ports';

const BRIEFING_CACHE_MAX = 64;

export type BriefingDeps = {
  ai: AIPort;
  now: () => number;
  weather: (region: string) => Promise<WeatherResponse>;
  restaurants?: (region: string) => Promise<RestaurantsResponse>;
  placeReviews?: (name: string, region: string) => Promise<string[]>;
  alerts?: (region: string) => Promise<AlertsResponse>;
};

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
  const texts = createCache<BriefingOutput>({
    now,
    ttlMs: BRIEFING_CACHE_MS,
    maxEntries: BRIEFING_CACHE_MAX,
  });
  const audios = createCache<Uint8Array>({
    now,
    ttlMs: BRIEFING_CACHE_MS,
    maxEntries: BRIEFING_CACHE_MAX,
  });
  const key = (region: string, lang: BriefingLanguage) => `${region}:${lang}`;

  async function korean(region: string): Promise<BriefingOutput> {
    const caps = ai.capabilities();
    // 날씨·맛집·안전 안내 조회는 서로 독립적이므로 병렬로 요청한다.
    // 맛집과 특보·지진은 부가 정보이므로 실패해도 안내는 계속한다.
    const [current, nearby, safety] = await Promise.all([
      weather(region),
      restaurants
        ? restaurants(region)
            .then((r) => r.items)
            .catch(() => [])
        : Promise.resolve([]),
      alerts
        ? alerts(region)
            .then((r) => alertsSpeech(r.alerts))
            .catch(() => '')
        : Promise.resolve(''),
    ]);
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
          await Promise.all([
            ...facts.places.map(async ({ name, description, tags }) => ({
              name,
              description,
              tags,
              reviews: placeReviews ? await placeReviews(name, region) : [],
              kind: 'place' as const,
            })),
            // 맛집도 같은 요청에서 블로그 표현을 근거로 한 문장씩 쓴다.
            ...facts.restaurants.map(async ({ name, category, menus }) => ({
              name,
              description: foodKind(category),
              tags: [category],
              reviews: placeReviews ? await placeReviews(name, region) : [],
              kind: 'restaurant' as const,
              menus,
            })),
          ]),
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
    return texts.has(key(region, lang));
  }
  function hasAudio(region: string, lang: BriefingLanguage) {
    return audios.has(key(region, lang));
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
    const value = await texts.getOrLoad(k, async () =>
      // 영어는 같은 한국어 원고를 번역한다(한국어 원고도 함께 저장된다).
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
          ),
    );
    // 듣기를 누르기 전에 음성을 미리 만들어 둔다(실패해도 원고는 그대로 보여 준다).
    if (ai.capabilities().voice && !audios.has(k))
      audio(region, lang).catch(() => undefined);
    return value;
  }

  async function audio(region: string, lang: BriefingLanguage) {
    const k = key(region, lang);
    return audios.getOrLoad(k, async () => {
      const { script } = await text(region, lang);
      return ai.voice(script, lang === 'en' ? 'clara' : 'nara');
    });
  }

  return { text, audio, hasText, hasAudio };
}

export type BriefingService = ReturnType<typeof createBriefing>;
