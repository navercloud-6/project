import { z } from 'zod';
import { placeById, places, type Place } from './catalog';
import type { WeatherResponse } from './weather';
import type { Restaurant } from './restaurants';
import { formatNum, joinKoreanList, josa, OUTFIT_VOCABULARY } from './outfit';

const squash = (text: string) => text.replace(/\s+/g, '');
const OUTFIT_VOCAB_ENTRIES = OUTFIT_VOCABULARY.map(
  (item) => [item, squash(item)] as const,
);

export const BRIEFING_ENDING = '즐거운 여행 되세요!';
// CLOVA Voice 1회 입력 상한(2,000자) 안에서 약 1분 분량을 목표로 한다.
export const BRIEFING_KO_LIMIT = 900;
export const BRIEFING_EN_LIMIT = 1900;
// 같은 시·군·언어의 원고와 음성을 다시 쓰는 시간
export const BRIEFING_CACHE_MS = 10 * 60 * 1000;

export const briefingLanguage = z.enum(['ko', 'en']);
export type BriefingLanguage = z.infer<typeof briefingLanguage>;

export const briefingOutput = z.object({
  region: z.string(),
  lang: briefingLanguage,
  mode: z.enum(['clova', 'rule']),
  weatherMode: z.enum(['live', 'demo']),
  script: z.string().min(1),
  // 원고에서 말한 순서 그대로의 명소·맛집(화면 카드도 이 순서·이유로 보여 준다)
  places: z.array(
    z.object({ id: z.string(), name: z.string(), reason: z.string() }),
  ),
  restaurants: z.array(z.object({ name: z.string() })),
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
    // 오늘 날짜(YYYY-MM-DD)와 체감 계절(장소 추천 이유의 계절 검사에 쓴다)
    date: string;
    season: Season;
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
  places: {
    id: string;
    name: string;
    description: string;
    tags: string[];
    // 오늘 추천하는 이유 한 문장(검증을 통과한 AI 문장 또는 규칙 문장)
    reason: string;
  }[];
  restaurants: {
    name: string;
    category: string;
    menus: string[];
    // 블로그 후기를 근거로 AI가 쓴 한 문장(검증 통과 시). 없으면 음식 종류·메뉴 규칙 문장
    line?: string;
  }[];
};

// 소개는 첫 문장 하나만 쓴다. 너무 길면 중간에 자르지 않고 소개를 생략한다.
const firstSentence = (text: string, max = 90) => {
  const sentence = text.split(/(?<=[.!?])\s/)[0]?.trim() ?? '';
  return sentence.length > max || !/[.!?]$/.test(sentence) ? '' : sentence;
};
/** 날씨 응답과 추천 장소에서 원고 재료만 고른다. 개인 정보는 들어가지 않는다. */
export function briefingFacts(
  weather: WeatherResponse,
  catalog: Pick<Place, 'id' | 'name' | 'description' | 'tags'>[],
  restaurants: Restaurant[] = [],
): BriefingFacts {
  const today = weather.daily[0];
  const lookup =
    catalog === places
      ? placeById
      : new Map(catalog.map((item) => [item.id, item]));
  return {
    region: weather.region === '전체' ? '경기도' : weather.region,
    weather: {
      condition: weather.current.condition,
      temperature: weather.current.temperature,
      tempMin: today.tempMin,
      tempMax: today.tempMax,
      precipitationProbability: today.precipitationProbability,
      date: today.date,
      season: seasonOf(today.date, today.tempMin, today.tempMax),
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
      .map((id) => lookup.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        name: p.name.trim(),
        description: firstSentence(p.description),
        tags: p.tags,
        reason: ruleReason(p.tags),
      })),
    restaurants: restaurants.slice(0, 3).map((r) => ({
      name: r.name,
      // '한식>육류,고기요리' → '육류,고기요리'
      category: r.category.split('>').pop()?.trim() ?? '',
      menus: r.menus,
    })),
  };
}

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
    `지금은 ${weather.condition}, 기온은 ${formatNum(weather.temperature)}도예요. 오늘 최저 ${formatNum(weather.tempMin)}도, 최고 ${formatNum(weather.tempMax)}도이고 비 올 확률은 ${weather.precipitationProbability}%입니다.`,
    `다음은 옷차림이에요. ${outfit.summary}`,
    ...outfit.notes,
  ].join(' ');
}

// 태그로 만드는 짧은 추천 이유(앞에 있는 태그가 우선).
const TAG_REASONS: [string, string][] = [
  ['문화시설', '실내 전시라 날씨와 상관없이 둘러보기 좋아요.'],
  ['역사·문화', '지역의 역사와 문화를 한눈에 볼 수 있어요.'],
  ['해양 체험', '바다를 가까이에서 즐길 수 있어요.'],
  ['경관 감상', '탁 트인 경치를 감상하기 좋아요.'],
  ['자연·생태', '자연을 가까이 느끼며 쉬어 가기 좋아요.'],
  ['산책', '천천히 걸으며 둘러보기 좋아요.'],
  ['체험', '직접 해 보는 체험 거리가 있어요.'],
  ['휴식', '잠시 쉬어 가기 좋은 곳이에요.'],
];
export function ruleReason(tags: string[]): string {
  return (
    TAG_REASONS.find(([tag]) => tags.includes(tag))?.[1] ??
    '오늘 둘러보기 알맞은 곳이에요.'
  );
}

export const REASON_MAX = 70;

export type Season = '봄' | '여름' | '가을' | '겨울';
/**
 * 달로 계절을 정하되 실제 기온을 우선한다.
 * 최고 5°C 이하면 겨울, 최저 20°C 이상이면 여름으로 본다(예: 영하권의 11월 말은 겨울).
 */
export function seasonOf(
  date: string,
  tempMin: number,
  tempMax: number,
): Season {
  if (tempMax <= 5) return '겨울';
  if (tempMin >= 20) return '여름';
  const month = Number(date.slice(5, 7));
  if (month >= 3 && month <= 5) return '봄';
  if (month >= 6 && month <= 8) return '여름';
  if (month >= 9 && month <= 11) return '가을';
  return '겨울';
}

// 특정 계절에만 맞는 풍경·활동 표현과 그 표현이 어울리는 계절.
const SEASON_WORDS: [string, Season[]][] = [
  ['벚꽃', ['봄']],
  ['진달래', ['봄']],
  ['개나리', ['봄']],
  ['유채', ['봄']],
  ['튤립', ['봄']],
  ['봄꽃', ['봄']],
  ['꽃', ['봄', '여름', '가을']],
  ['신록', ['봄', '여름']],
  ['물놀이', ['여름']],
  ['해수욕', ['여름']],
  ['수국', ['여름']],
  ['연꽃', ['여름']],
  ['단풍', ['가을']],
  ['억새', ['가을']],
  ['은행나무', ['가을']],
  ['코스모스', ['가을']],
  ['피크닉', ['봄', '여름', '가을']],
  ['돗자리', ['봄', '여름', '가을']],
  ['눈꽃', ['겨울']],
  ['설경', ['겨울']],
  ['썰매', ['겨울']],
  ['얼음', ['겨울']],
  ['스케이트', ['겨울']],
  ['봄', ['봄']],
  ['여름', ['여름']],
  ['가을', ['가을']],
  ['겨울', ['겨울']],
];
/** 지금 계절과 맞지 않는 표현을 돌려준다(예: 겨울의 '꽃', '단풍'). */
export function offSeasonWords(text: string, season: Season): string[] {
  return SEASON_WORDS.filter(
    ([word, seasons]) => !seasons.includes(season) && text.includes(word),
  ).map(([word]) => word);
}

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** '화성행궁, 화성행궁은 …'처럼 이유 앞에 다시 나온 장소 이름(+조사)을 지운다. 띄어쓰기 차이는 무시. */
export function withoutOwnName(reason: string, name: string): string {
  const pattern = [...name.replace(/\s+/g, '')].map(escapeRegExp).join('\\s*');
  return reason
    .replace(
      new RegExp(
        `^${pattern}(?:에서는|에서|에는|에|은|는|이|가|의|을|를)?\\s*,?\\s*`,
      ),
      '',
    )
    .trim();
}

// 자주 나오는 '~습니다' 끝맺음을 친근한 해요체로 바꾼다.
const POLITE_ENDINGS: [RegExp, string][] = [
  [/있습니다([.!?]*)$/, '있어요$1'],
  [/없습니다([.!?]*)$/, '없어요$1'],
  [/좋습니다([.!?]*)$/, '좋아요$1'],
  [/됩니다([.!?]*)$/, '돼요$1'],
  [/합니다([.!?]*)$/, '해요$1'],
];
export function politeEnding(text: string): string {
  return POLITE_ENDINGS.reduce((t, [from, to]) => t.replace(from, to), text);
}

/**
 * AI가 쓴 장소별 추천 이유를 검사해 붙인다. 너무 짧거나 길거나, 숫자가 있거나,
 * 다른 명소·맛집 이름이 섞인 문장은 버리고 태그 기반 규칙 문장을 쓴다.
 */
export function withReasons(
  facts: BriefingFacts,
  // 명소 순서대로, 이어서 맛집 순서대로의 AI 문장
  reasons: (string | undefined)[],
): BriefingFacts {
  const names = [...facts.places, ...facts.restaurants].map((p) =>
    squash(p.name),
  );
  // 같은 검사(길이·숫자·계절·다른 이름)를 통과한 문장만 쓰고, 아니면 빈 문자열
  const checked = (raw: string | undefined, name: string) => {
    const text = politeEnding(
      withoutOwnName(spokenKorean(raw ?? ''), name),
    ).replace(/[.!?]*$/, '.');
    if (text.length < 8 || text.length > REASON_MAX || /\d/.test(text))
      return '';
    if (offSeasonWords(text, facts.weather.season).length > 0) return '';
    const own = squash(name);
    const squashedText = squash(text);
    return names.some((n) => n !== own && squashedText.includes(n)) ? '' : text;
  };
  return {
    ...facts,
    places: facts.places.map((place, i) => ({
      ...place,
      reason: checked(reasons[i], place.name) || ruleReason(place.tags),
    })),
    restaurants: facts.restaurants.map((r, j) => {
      const line = checked(reasons[facts.places.length + j], r.name);
      if (!line) return { ...r, line: undefined };
      // 후기로 확인된 메뉴가 있는 맛집은 그 메뉴를 하나 이상 꼭 말해야 한다.
      const squashedLine = squash(line);
      const hasMenu =
        r.menus.length === 0 ||
        r.menus.some((m) => squashedLine.includes(squash(m)));
      return { ...r, line: hasMenu ? line : undefined };
    }),
  };
}

/** 네이버 분류 끝부분을 말하기 좋은 음식 종류로('곱창,막창,양' → '곱창 맛집', '양식' → '양식 맛집'). */
export function foodKind(category: string): string {
  const kind = (category.split('>').pop() ?? '').split(',')[0].trim();
  if (!kind) return '';
  return /(당|점|집|카페|베이커리|제과|주점|레스토랑|뷔페)$/.test(kind)
    ? kind
    : `${kind} 맛집`;
}

// 맛집 문장: 음식 종류와 후기로 검증된 메뉴를 넣고, 맛집마다 표현을 바꿔 자연스럽게 말한다.
const MENU_PHRASES = [
  (name: string, kind: string, menu: string) =>
    kind
      ? `${josa(name, '은', '는')} ${kind}인데 ${josa(menu, '이', '가')} 유명해요.`
      : `${josa(name, '은', '는')} ${josa(menu, '이', '가')} 유명해요.`,
  (name: string, kind: string, menu: string) =>
    kind
      ? `${kind}인 ${name}에서는 ${josa(menu, '이', '가')} 인기 메뉴예요.`
      : `${name}에서는 ${josa(menu, '이', '가')} 인기 메뉴예요.`,
  (name: string, kind: string, menu: string) =>
    kind
      ? `${josa(name, '은', '는')} ${josa(kind, '으로', '로')}, ${josa(menu, '을', '를')} 많이 찾아요.`
      : `${josa(name, '은', '는')} ${josa(menu, '을', '를')} 많이 찾아요.`,
];
/** 메뉴가 없는 맛집: '셰프스위트는 양식 맛집이에요.' */
export function kindSentence(name: string, category: string): string {
  const kind = foodKind(category);
  return kind
    ? `${josa(name, '은', '는')} ${josa(kind, '이에요', '예요')}.`
    : `${name}.`;
}

export function menuSentence(
  name: string,
  menus: string[],
  index: number,
  category = '',
): string {
  return MENU_PHRASES[index % MENU_PHRASES.length](
    name,
    foodKind(category),
    joinKoreanList(menus),
  );
}

export function placesTail(facts: BriefingFacts): string {
  const parts: string[] = [];
  // 화면 카드와 같은 순서로 말한다.
  if (facts.places.length > 0)
    parts.push(
      '이어서 오늘의 추천 명소예요.',
      ...facts.places.map((p) => `${p.name}, ${p.reason}`),
    );
  if (facts.restaurants.length > 0)
    parts.push(
      '마지막으로 근처 맛집이에요.',
      ...facts.restaurants.map((r, i) =>
        r.line
          ? `${r.name}, ${r.line}`
          : r.menus.length > 0
            ? menuSentence(r.name, r.menus, i, r.category)
            : kindSentence(r.name, r.category),
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
  const todaySet = new Set(today);
  let rest = squash(head);
  for (const item of [...today].sort((a, b) => b.length - a.length))
    rest = rest.split(squash(item)).join('|');
  const out: string[] = [];
  for (const [item, squashed] of OUTFIT_VOCAB_ENTRIES) {
    if (!todaySet.has(item) && rest.includes(squashed)) out.push(item);
  }
  return out;
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
    // 오늘 날짜(월·일)를 말하는 것은 허용한다.
    Number(weather.date.slice(5, 7)),
    Number(weather.date.slice(8, 10)),
    ...numbersIn([outfit.summary, ...outfit.notes].join(' ')),
  ]);
  return numbersIn(head).filter((n) => !allowed.has(n));
}

/**
 * 원고에 빠졌거나 틀리게 적힌 명소·맛집 이름을 돌려준다(띄어쓰기·기호 차이는 무시).
 * 관광객이 이름으로 찾아가므로 한 글자라도 다르면 틀린 것으로 본다.
 */
export function missingNames(script: string, facts: BriefingFacts): string[] {
  const body = squash(spokenKorean(script));
  return [...facts.places, ...facts.restaurants]
    .map((item) => item.name)
    .filter((name) => !body.includes(squash(spokenKorean(name))));
}

/** 첫 인사 문장 바로 뒤에 안전 안내(특보·지진)를 넣는다. 안내가 없으면 그대로. */
export function withSafety(script: string, safety: string): string {
  if (!safety || !script) return script;
  const text = spokenKorean(safety);
  const end = script.search(/[.!?]\s/);
  return end < 0
    ? `${text} ${script}`
    : `${script.slice(0, end + 1)} ${text}${script.slice(end + 1)}`;
}
