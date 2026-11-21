import { z } from 'zod';
import type { Place } from './catalog';
import type { WeatherResponse } from './weather';
import type { Restaurant } from './restaurants';
import { OUTFIT_VOCABULARY } from './outfit';

export const BRIEFING_ENDING = '즐거운 여행 되세요!';
// CLOVA Voice 1회 입력 상한(2,000자) 안에서 약 1분 분량을 목표로 한다.
export const BRIEFING_KO_LIMIT = 900;
export const BRIEFING_EN_LIMIT = 1900;

export const briefingLanguage = z.enum(['ko', 'en']);
export type BriefingLanguage = z.infer<typeof briefingLanguage>;

export const briefingOutput = z.object({
  region: z.string(),
  lang: briefingLanguage,
  mode: z.enum(['clova', 'rule']),
  weatherMode: z.enum(['live', 'demo']),
  script: z.string().min(1),
  audio: z.string().nullable(),
});
export type BriefingOutput = z.infer<typeof briefingOutput>;

export type BriefingFacts = {
  region: string;
  weather: {
    condition: string;
    temperature: number;
    tempMin: number;
    tempMax: number;
    precipitationProbability: number;
  };
  outfit: {
    summary: string;
    outer: string[];
    top: string[];
    bottom: string[];
    accessories: string[];
    extras: string[];
    notes: string[];
  };
  places: { name: string; description: string }[];
  restaurants: { name: string; category: string; menus: string[] }[];
};

// 소개는 첫 문장 하나만 쓴다. 너무 길면 중간에 자르지 않고 소개를 생략한다.
const firstSentence = (text: string, max = 90) => {
  const sentence = text.split(/(?<=[.!?])\s/)[0]?.trim() ?? '';
  return sentence.length > max || !/[.!?]$/.test(sentence) ? '' : sentence;
};
// 소개가 이미 이름으로 시작하면 이름을 반복하지 않는다.
const introduce = (name: string, description: string) =>
  description.replace(/\s+/g, '').startsWith(name.replace(/\s+/g, ''))
    ? description
    : `${name}, ${description}`;

/** 날씨 응답과 추천 장소에서 원고 재료만 고른다. 개인 정보는 들어가지 않는다. */
export function briefingFacts(
  weather: WeatherResponse,
  catalog: Pick<Place, 'id' | 'name' | 'description'>[],
  restaurants: Restaurant[] = [],
): BriefingFacts {
  const today = weather.daily[0];
  return {
    region: weather.region === '전체' ? '경기도' : weather.region,
    weather: {
      condition: weather.current.condition,
      temperature: weather.current.temperature,
      tempMin: today.tempMin,
      tempMax: today.tempMax,
      precipitationProbability: today.precipitationProbability,
    },
    outfit: {
      summary: weather.outfit.summary,
      outer: weather.outfit.outer,
      top: weather.outfit.top,
      bottom: weather.outfit.bottom,
      accessories: weather.outfit.accessories,
      extras: weather.outfit.extras,
      notes: weather.outfit.notes,
    },
    places: weather.recommendedPlaceIds
      .map((id) => catalog.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .slice(0, 3)
      .map((p) => ({
        name: p.name.trim(),
        description: firstSentence(p.description),
      })),
    restaurants: restaurants.slice(0, 3).map((r) => ({
      name: r.name,
      // '한식>육류,고기요리' → '육류,고기요리'
      category: r.category.split('>').pop()?.trim() ?? '',
      menus: r.menus,
    })),
  };
}

const num = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

/** 음성으로 읽기 좋게 기호·음수·단위를 말로 바꾼다. */
export function spokenKorean(text: string): string {
  return text
    .replace(/-(\d+(?:\.\d+)?)\s*(도|°C)/g, '영하 $1도')
    .replace(/(\d+(?:\.\d+)?)\s*°C/g, '$1도')
    .replace(/(\d+(?:\.\d+)?)\s*%/g, '$1퍼센트')
    .replace(/(\d+(?:\.\d+)?)\s*m\/s/g, '초속 $1미터')
    .replace(/초속\s*(\d+(?:\.\d+)?)\s*m(?=[로은는이가,\s.]|$)/g, '초속 $1미터')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\p{Script=Han}+/gu, ' ')
    .replace(/[*#"'“”‘’…]/g, '')
    .replace(/[()[\]·]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ([,.!?])/g, '$1')
    .trim();
}

// 지울 문장: 방송 진행 멘트만 좁게 지정한다('방송국', '여기까지 걸어서' 같은 정상 문장은 보존).
const BAD_SENTENCE =
  /안내\s*방송|방송입니다|방송을\s*마|방송이었|(다음|또|내일)[^.!?]*만나요|마치겠습니다|마칩니다|여기까지\s*(입니다|였습니다|안내|방송)/;
// 문장 끝의 마무리 인사만 지운다.
const CLOSING = /\s*(즐거운|행복한|좋은)\s*(여행|하루|시간)[^.!?]*[.!?]*\s*$/;
// 문장 경계: 마침표 뒤에 공백이 없어도 한글·영문이 오면 경계로 본다('3.5도'는 나누지 않음).
const SPLIT = /(?<=[.!?])(?:\s+|(?=[가-힣A-Za-z]))/;

/**
 * 진행 멘트·끝인사를 정리하고 마지막을 '즐거운 여행 되세요!'로 통일한다.
 * 끝인사는 문장 끝부분만 잘라 내므로 마침표가 빠져도 본문을 지우지 않는다.
 * 본문이 비면 빈 문자열을 돌려준다(호출한 쪽에서 실패 처리).
 */
export function fixEnding(text: string): string {
  const sentences = (text ?? '')
    .trim()
    .split(SPLIT)
    .map((s) => s.trim())
    .filter((s) => s && !BAD_SENTENCE.test(s));
  let body = sentences.join(' ');
  let previous: string | undefined;
  while (body !== previous) {
    previous = body;
    body = body.replace(CLOSING, '').trimEnd();
  }
  if (!body) return '';
  if (!/[.!?]$/.test(body)) body += '.';
  return `${body} ${BRIEFING_ENDING}`;
}

/** 음성 MP3를 JSON 응답에 담기 위해 base64로 바꾼다(런타임 전용 API 없이). */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** 문장 단위로 잘라 상한을 넘지 않게 한다. */
export function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('? '),
  );
  return end > 0 ? cut.slice(0, end + 1) : cut;
}

// HCX가 쓰는 앞부분(인사·날씨·옷차림·준비물)의 상한. 명소·맛집은 코드가 붙인다.
export const BRIEFING_HEAD_LIMIT = 420;

/** HCX에 넘기는 재료: 이름이 틀릴 수 있는 명소·맛집은 넣지 않는다. */
export type BriefingHeadFacts = Pick<
  BriefingFacts,
  'region' | 'weather' | 'outfit'
>;
export const headFacts = ({
  region,
  weather,
  outfit,
}: BriefingFacts): BriefingHeadFacts => ({ region, weather, outfit });

/** 규칙 기반 앞부분(인사·날씨·옷차림·준비물). */
export function ruleHead(facts: BriefingHeadFacts): string {
  const { region, weather, outfit } = facts;
  return [
    `안녕하세요! 오늘 ${region} 날씨부터 알려드릴게요.`,
    `지금은 ${weather.condition}, 기온은 ${num(weather.temperature)}도예요. 오늘 최저 ${num(weather.tempMin)}도, 최고 ${num(weather.tempMax)}도이고 비 올 확률은 ${weather.precipitationProbability}%입니다.`,
    `다음은 옷차림이에요. ${outfit.summary}`,
    ...outfit.notes,
  ].join(' ');
}

/** 코드가 붙이는 뒷부분: 명소·맛집 이름·소개·메뉴를 자료 그대로 말한다. */
export function placesTail(facts: BriefingFacts): string {
  const parts: string[] = [];
  if (facts.places.length > 0)
    parts.push(
      `이어서 추천 명소는 ${facts.places.map((p) => p.name).join(', ')}입니다.`,
      ...facts.places
        .filter((p) => p.description)
        .map((p) => introduce(p.name, p.description)),
    );
  if (facts.restaurants.length > 0)
    parts.push(
      `마지막으로 맛집은 ${facts.restaurants.map((r) => r.name).join(', ')}입니다.`,
      ...facts.restaurants
        .filter((r) => r.menus.length > 0)
        .map(
          (r) =>
            `${r.name}, 후기에 자주 나온 메뉴는 ${r.menus.join(', ')}입니다.`,
        ),
    );
  return parts.join(' ');
}

/** HCX 앞부분을 음성용으로 정리한다(진행 멘트·끝인사 제거). 본문이 없으면 빈 문자열. */
export function tidyHead(text: string): string {
  const fixed = fixEnding(spokenKorean(text));
  const body = fixed
    .slice(0, Math.max(0, fixed.length - BRIEFING_ENDING.length))
    .trim()
    .split(SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
  // 뒤에 명소가 붙으므로 '그럼 따뜻하게 입고 오셔서.' 같은 맺음말 조각은 뺀다.
  while (
    body.length > 1 &&
    /^(그럼|그러면|자,|이제)/.test(body[body.length - 1])
  )
    body.pop();
  return shorten(body.join(' '), BRIEFING_HEAD_LIMIT);
}

/**
 * AI 앞부분에 오늘 옷차림에 없는 옷·준비물이 있으면 돌려준다(예: 추운 날의 '얇은 겉옷').
 * 오늘 항목을 먼저 지운 뒤 남은 글에서 찾으므로 '두꺼운 코트' 속 '코트'는 걸리지 않는다.
 */
export function foreignItems(head: string, facts: BriefingHeadFacts): string[] {
  const { outer, top, bottom, accessories, extras } = facts.outfit;
  const today = [...outer, ...top, ...bottom, ...accessories, ...extras];
  const squash = (text: string) => text.replace(/\s+/g, '');
  let rest = squash(head);
  for (const item of [...today].sort((a, b) => b.length - a.length))
    rest = rest.split(squash(item)).join('|');
  return OUTFIT_VOCABULARY.filter(
    (item) => !today.includes(item) && rest.includes(squash(item)),
  );
}

/** 앞부분과 명소·맛집 뒷부분을 합쳐 '즐거운 여행 되세요!'로 끝나는 원고를 만든다. */
export function composeScript(head: string, facts: BriefingFacts): string {
  const script = spokenKorean(`${head} ${placesTail(facts)}`);
  return fixEnding(shorten(script, BRIEFING_KO_LIMIT - 20));
}

/** CLOVA Studio 키가 없거나 AI 원고가 검증을 통과하지 못할 때 쓰는 규칙 기반 원고. */
export function ruleScript(facts: BriefingFacts): string {
  return composeScript(ruleHead(facts), facts);
}

const NUMBER = /(영하\s*)?(\d+(?:\.\d+)?)/g;
const numbersIn = (text: string) =>
  [...spokenKorean(text).matchAll(NUMBER)].map((m) =>
    Number(m[1] ? -Number(m[2]) : Number(m[2])),
  );

/**
 * AI 앞부분에 자료에 없는 숫자가 있으면 돌려준다(예: 1.6도를 '영하 1.6도'로 쓴 경우).
 * 날씨 수치와 옷차림 문장에 나온 숫자만 허용한다.
 */
export function unknownNumbers(
  head: string,
  facts: BriefingHeadFacts,
): number[] {
  const { weather, outfit } = facts;
  const allowed = new Set<number>([
    weather.temperature,
    weather.tempMin,
    weather.tempMax,
    weather.precipitationProbability,
    ...numbersIn([outfit.summary, ...outfit.notes].join(' ')),
  ]);
  return numbersIn(head).filter((n) => !allowed.has(n));
}

/**
 * 원고에 빠졌거나 틀리게 적힌 명소·맛집 이름을 돌려준다(띄어쓰기·기호 차이는 무시).
 * 관광객이 이름으로 찾아가므로 한 글자라도 다르면 틀린 것으로 본다.
 */
export function missingNames(script: string, facts: BriefingFacts): string[] {
  const squash = (text: string) => spokenKorean(text).replace(/\s+/g, '');
  const body = squash(script);
  return [...facts.places, ...facts.restaurants]
    .map((item) => item.name)
    .filter((name) => !body.includes(squash(name)));
}
