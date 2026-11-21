import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  COMPANION_LABELS,
  SETTING_LABELS,
  STYLE_LABELS,
  THEME_LABELS,
  inferHeuristicLabels,
  placeLabelSchema,
  type CompanionLabel,
  type LabelablePlace,
  type PlaceLabel,
  type PlaceLabelMap,
  type SettingLabel,
  type StyleLabel,
  type ThemeLabel,
} from '../lib/domain/place-labels';

const ROOT = resolve(import.meta.dirname, '..');
const PLACES_PATH = resolve(ROOT, 'data/places.json');
const LABELS_PATH = resolve(ROOT, 'data/place-labels.json');
const OVERRIDES_PATH = resolve(ROOT, 'data/place-label-overrides.json');

const rawItemSchema = z.object({
  id: z.string().min(1),
  setting: z.string().default(''),
  themes: z.array(z.string()).default([]),
  companions: z.array(z.string()).default([]),
  styles: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
});

type RawLabelItem = z.infer<typeof rawItemSchema>;

function canonicalKey(value: string): string {
  return value.trim().replace(/[\s/·ㆍ•,\-_]+/g, '');
}

const SETTING_LOOKUP = new Map<string, SettingLabel>([
  ...SETTING_LABELS.map((v) => [canonicalKey(v), v] as const),
  ['실내외', '실내·야외'],
  ['야외실내', '실내·야외'],
  ['복합', '실내·야외'],
]);

const THEME_LOOKUP = new Map<string, ThemeLabel>([
  ...THEME_LABELS.map((v) => [canonicalKey(v), v] as const),
  ['저수지', '호수'],
  ['호반', '호수'],
  ['수변', '호수'],
  ['강변', '호수'],
  ['해변', '바다'],
  ['해양체험', '바다'],
  ['해양', '바다'],
  ['갯벌', '바다'],
  ['포구', '바다'],
  ['항구', '바다'],
  ['산', '산·계곡'],
  ['계곡', '산·계곡'],
  ['등산', '산·계곡'],
  ['자연생태', '공원·숲'],
  ['자연', '공원·숲'],
  ['생태', '공원·숲'],
  ['공원', '공원·숲'],
  ['숲', '공원·숲'],
  ['정원', '공원·숲'],
  ['수목원', '공원·숲'],
  ['박물관', '박물관·전시'],
  ['미술관', '박물관·전시'],
  ['전시', '박물관·전시'],
  ['문화시설', '박물관·전시'],
  ['역사문화', '역사·유적'],
  ['역사', '역사·유적'],
  ['유적', '역사·유적'],
  ['문화재', '역사·유적'],
  ['체험', '체험·테마'],
  ['테마', '체험·테마'],
  ['테마파크', '체험·테마'],
  ['경관감상', '전망·야경'],
  ['경관', '전망·야경'],
  ['전망', '전망·야경'],
  ['야경', '전망·야경'],
  ['일몰', '전망·야경'],
  ['낙조', '전망·야경'],
  ['사찰', '사찰·전통'],
  ['전통', '사찰·전통'],
  ['한옥', '사찰·전통'],
  ['시장', '시장·거리'],
  ['거리', '시장·거리'],
  ['예술', '예술·공연'],
  ['공연', '예술·공연'],
  ['캠핑', '캠핑·레저'],
  ['레저', '캠핑·레저'],
  ['수상레저', '캠핑·레저'],
  ['해양레저', '캠핑·레저'],
]);

const COMPANION_LOOKUP = new Map<string, CompanionLabel>([
  ...COMPANION_LABELS.map((v) => [canonicalKey(v), v] as const),
  ['아이', '아이동반'],
  ['어린이', '아이동반'],
  ['키즈', '아이동반'],
  ['아이와함께', '아이동반'],
  ['연인', '연인·데이트'],
  ['데이트', '연인·데이트'],
  ['커플', '연인·데이트'],
  ['친구', '연인·데이트'],
  ['혼자', '혼자·힐링'],
  ['혼행', '혼자·힐링'],
  ['힐링', '혼자·힐링'],
  ['부모', '부모님'],
  ['어르신', '부모님'],
  ['효도', '부모님'],
  ['전연령', '가족'],
  ['누구나', '가족'],
]);

const STYLE_LOOKUP = new Map<string, StyleLabel>([
  ...STYLE_LABELS.map((v) => [canonicalKey(v), v] as const),
  ['우천', '비오는날'],
  ['실내관람', '비오는날'],
  ['사진', '사진명소'],
  ['포토', '사진명소'],
  ['경관감상', '사진명소'],
  ['풍경감상', '사진명소'],
  ['일몰감상', '사진명소'],
  ['노을감상', '사진명소'],
  ['일몰', '사진명소'],
  ['낙조', '사진명소'],
  ['야경감상', '사진명소'],
  ['전망', '사진명소'],
  ['교육', '교육·학습'],
  ['학습', '교육·학습'],
  ['역사탐방', '교육·학습'],
  ['힐링', '휴식'],
  ['여유', '휴식'],
  ['체험', '액티비티'],
  ['레저', '액티비티'],
  ['수상레저', '액티비티'],
  ['해양레저', '액티비티'],
  ['활동', '액티비티'],
  ['트레킹', '산책'],
  ['걷기', '산책'],
  ['둘레길', '산책'],
]);

const THEME_PATTERNS: readonly [RegExp, ThemeLabel][] = [
  [/호수|저수지|호반|수변|강변/, '호수'],
  [/바다|해변|갯벌|포구|항구|해양|등대|섬/, '바다'],
  [/계곡|등산|폭포|산성/, '산·계곡'],
  [/공원|숲|자연|생태|정원|수목원|습지/, '공원·숲'],
  [/박물관|미술관|전시|과학관|도서관|기념관/, '박물관·전시'],
  [/역사|유적|문화재|성곽|왕릉|행궁/, '역사·유적'],
  [/체험|테마|동물|목장|농장|놀이/, '체험·테마'],
  [/전망|야경|경관|일몰|낙조|노을/, '전망·야경'],
  [/사찰|전통|한옥|서원|향교/, '사찰·전통'],
  [/시장|거리|골목|상가|맛집|음식|먹거리|카페|특구/, '시장·거리'],
  [/예술|공연|음악|미술|도예/, '예술·공연'],
  [/캠핑|레저|자전거|서핑|카약|낚시/, '캠핑·레저'],
];

const COMPANION_PATTERNS: readonly [RegExp, CompanionLabel][] = [
  [/아이|어린이|키즈|유아|초등/, '아이동반'],
  [/가족|전연령|누구나|단체/, '가족'],
  [/연인|데이트|커플|친구/, '연인·데이트'],
  [/혼자|혼행|힐링|사색|조용/, '혼자·힐링'],
  [/부모|효도|어르신|시니어/, '부모님'],
];

const STYLE_PATTERNS: readonly [RegExp, StyleLabel][] = [
  [/비오는|비\s*오는|우천|실내/, '비오는날'],
  [/산책|걷기|둘레길|트레킹/, '산책'],
  [/사진|포토|경관|풍경|전망|일몰|낙조|노을|야경|출사/, '사진명소'],
  [/드라이브|근교/, '드라이브'],
  [/교육|학습|역사|관람|전시/, '교육·학습'],
  [/휴식|힐링|여유|치유/, '휴식'],
  [/액티비티|체험|레저|놀이|스포츠|낚시|서핑/, '액티비티'],
];

function mapValues<T extends string>(
  raw: string[],
  lookup: Map<string, T>,
  patterns: readonly [RegExp, T][],
  limit: number,
): T[] {
  const out: T[] = [];
  for (const item of raw) {
    const key = canonicalKey(item);
    let matched = lookup.get(key);
    if (!matched) {
      for (const [re, target] of patterns) {
        if (re.test(item)) {
          matched = target;
          break;
        }
      }
    }
    if (matched && !out.includes(matched)) out.push(matched);
    if (out.length >= limit) break;
  }
  return out;
}

export function buildLabelPrompt(batch: LabelablePlace[]): string {
  const payload = batch.map((p) => ({
    id: p.id,
    name: p.name,
    region: p.region,
    tags: p.tags,
    description: p.description.slice(0, 220),
  }));
  return JSON.stringify(payload);
}

export function buildLabelSystemPrompt(): string {
  return [
    '경기도 관광지 데이터에 여행 검색용 구조화 라벨을 부여하는 분류기다.',
    '입력 배열의 모든 장소를 반드시 하나의 단일 JSON 객체 {"items":[...]} 안에 담아 출력하라. 여러 JSON 객체로 나누거나 설명 문장·코드블록을 붙이지 마라.',
    '입력의 기존 tags("관광명소", "자연·생태", "경관 감상" 등)를 그대로 복사하지 말고 아래 허용 목록의 정확한 문자열만 선택하라.',
    `setting (정확히 1개): ${SETTING_LABELS.join(', ')}`,
    `themes (1~4개): ${THEME_LABELS.join(', ')}`,
    `companions (1~4개): ${COMPANION_LABELS.join(', ')}`,
    `styles (1~4개): ${STYLE_LABELS.join(', ')}`,
    'keywords: 장소 이름·설명에서 추출한 핵심 한국어 검색어 2~6개 (각 20자 이내).',
    '주의: 박물관·미술관·전시관·과학관·도서관·기념관·실내 체험관은 setting을 "실내" 또는 "실내·야외"로, styles에 "비오는날"을 포함하라. 단, 야외 공원·호수·해수욕장·시비 설명에 인근 박물관이나 문학관이 언급된 것만으로는 "실내" 또는 "실내·야외"로 분류하지 말고 "야외"로 분류하라.',
    '주의: 바다·해수욕장·갯벌·포구·항구·서해 섬·해안 산책로는 themes에 반드시 "바다"를 포함하고 "호수"로 분류하지 마라.',
    '주의: 내륙 호수·저수지·강변·수변 공원은 themes에 "호수"를 포함하고, 공원·수목원·정원·생태공원은 "공원·숲"도 함께 부여하라.',
    '출력 형식: {"items":[{"id":"장소ID","setting":"실내","themes":["박물관·전시"],"companions":["아이동반","가족"],"styles":["비오는날","교육·학습"],"keywords":["박물관","전시"]}]}',
  ].join('\n');
}

function collectRawItems(value: unknown, out: RawLabelItem[]) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const entry of value) collectRawItems(entry, out);
    return;
  }
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.items)) {
    for (const entry of record.items) collectRawItems(entry, out);
    return;
  }
  const parsed = rawItemSchema.safeParse(record);
  if (parsed.success) out.push(parsed.data);
}

export function extractJsonBlocks(raw: string): unknown[] {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  try {
    return [JSON.parse(cleaned)];
  } catch {
    // 모델이 여러 JSON 객체를 줄바꿈으로 이어서 출력한 경우 균형 괄호 단위로 분리해 파싱한다.
  }

  const blocks: unknown[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' || ch === ']') {
      if (depth > 0) depth--;
      if (depth === 0 && start !== -1) {
        const slice = cleaned.slice(start, i + 1);
        try {
          blocks.push(JSON.parse(slice));
        } catch {
          // 깨진 조각은 건너뛰고 다음 JSON 블록을 계속 탐색한다.
        }
        start = -1;
      }
    }
  }

  if (!blocks.length) {
    throw new Error('JSON 객체를 찾지 못했습니다.');
  }
  return blocks;
}

export function parseBatchLabels(
  rawContent: string,
  expectedIds: Set<string>,
  fallbacks?: Map<string, PlaceLabel>,
): Record<string, PlaceLabel> {
  const rawItems: RawLabelItem[] = [];
  for (const block of extractJsonBlocks(rawContent)) {
    collectRawItems(block, rawItems);
  }
  const result: Record<string, PlaceLabel> = {};
  for (const item of rawItems) {
    if (!expectedIds.has(item.id)) continue;
    const fb = fallbacks?.get(item.id);
    const trimmedSetting = item.setting.trim();
    const setting =
      trimmedSetting === ''
        ? fb?.setting
        : SETTING_LOOKUP.get(canonicalKey(trimmedSetting));
    let themes = mapValues(item.themes, THEME_LOOKUP, THEME_PATTERNS, 4);
    if (!themes.length && fb) themes = fb.themes;
    let companions = mapValues(
      item.companions,
      COMPANION_LOOKUP,
      COMPANION_PATTERNS,
      4,
    );
    let styles = mapValues(item.styles, STYLE_LOOKUP, STYLE_PATTERNS, 4);
    const keywords = [
      ...new Set(
        item.keywords
          .map((k) => k.trim().slice(0, 20))
          .filter((k) => k.length > 0),
      ),
    ].slice(0, 6);

    if (!setting || !themes.length) {
      continue;
    }
    if (!companions.length && fb) companions = fb.companions;
    if (!styles.length && fb) styles = fb.styles;
    if (!companions.length || !styles.length) {
      continue;
    }

    result[item.id] = placeLabelSchema.parse({
      setting,
      themes,
      companions,
      styles,
      keywords,
      source: 'clova',
    });
  }
  if (!Object.keys(result).length) {
    throw new Error('유효한 라벨 항목을 파싱하지 못했습니다.');
  }
  return result;
}

async function callClovaLabelBatch(
  batch: LabelablePlace[],
  apiKey: string,
  model: string,
): Promise<Record<string, PlaceLabel>> {
  const url = `https://clovastudio.stream.ntruss.com/v3/chat-completions/${encodeURIComponent(model)}`;
  const fallbacks = new Map(
    batch.map((p) => [p.id, inferHeuristicLabels(p)] as const),
  );
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'X-NCP-CLOVASTUDIO-REQUEST-ID': crypto.randomUUID(),
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: buildLabelSystemPrompt() },
            { role: 'user', content: buildLabelPrompt(batch) },
          ],
          maxTokens: 2400,
          temperature: 0.1,
          topP: 0.8,
          includeAiFilters: false,
        }),
        signal: AbortSignal.timeout(45000),
      });
      if (response.status === 429 || response.status >= 500) {
        const waitMs = attempt * 2000;
        console.warn(
          `  CLOVA HTTP ${response.status} — ${waitMs}ms 후 재시도 (${attempt}/3)`,
        );
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`CLOVA HTTP ${response.status}: ${text.slice(0, 200)}`);
      }
      const json = (await response.json()) as {
        status?: { code?: string; message?: string };
        result?: { message?: { content?: string } };
      };
      if (json.status?.code !== '20000' || !json.result?.message?.content) {
        throw new Error(
          `CLOVA 응답 오류: ${json.status?.code ?? 'unknown'} ${json.status?.message ?? ''}`,
        );
      }
      return parseBatchLabels(
        json.result.message.content,
        new Set(batch.map((p) => p.id)),
        fallbacks,
      );
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 1500));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('CLOVA 라벨링 호출에 실패했습니다.');
}

function loadLabelFile(path: string): PlaceLabelMap {
  if (!existsSync(path)) return {};
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const map: PlaceLabelMap = {};
  for (const [id, value] of Object.entries(raw)) {
    const parsed = placeLabelSchema.safeParse(value);
    if (parsed.success) map[id] = parsed.data;
  }
  return map;
}

function loadExistingLabels(): PlaceLabelMap {
  return loadLabelFile(LABELS_PATH);
}

export function loadOverrides(path = OVERRIDES_PATH): PlaceLabelMap {
  const loaded = loadLabelFile(path);
  const overrides: PlaceLabelMap = {};
  for (const [id, label] of Object.entries(loaded)) {
    overrides[id] = { ...label, source: 'manual' };
  }
  return overrides;
}

export function applyOverrides(
  places: readonly LabelablePlace[],
  map: PlaceLabelMap,
  overrides: PlaceLabelMap,
): PlaceLabelMap {
  const ordered: PlaceLabelMap = {};
  for (const place of places) {
    ordered[place.id] =
      overrides[place.id] ?? map[place.id] ?? inferHeuristicLabels(place);
  }
  return ordered;
}

function saveLabels(
  places: LabelablePlace[],
  map: PlaceLabelMap,
  overrides: PlaceLabelMap,
) {
  const ordered = applyOverrides(places, map, overrides);
  writeFileSync(LABELS_PATH, JSON.stringify(ordered, null, 2) + '\n', 'utf8');
  return ordered;
}

function parseArgNumber(args: string[], prefix: string, fallback: number) {
  const found = args.find((a) => a.startsWith(prefix));
  if (!found) return fallback;
  const n = Number(found.slice(prefix.length));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

async function main() {
  const args = process.argv.slice(2);
  const bootstrap = args.includes('--bootstrap');
  const applyOnly = args.includes('--apply-overrides');
  const force = args.includes('--force');
  const batchSize = parseArgNumber(args, '--batch=', 10);
  const limit = parseArgNumber(args, '--limit=', Infinity);
  const delayMs = parseArgNumber(args, '--delay=', 400);

  const places = JSON.parse(
    readFileSync(PLACES_PATH, 'utf8'),
  ) as LabelablePlace[];
  const map = loadExistingLabels();
  const overrides = loadOverrides();
  const overrideCount = Object.keys(overrides).length;

  if (applyOnly) {
    const saved = saveLabels(places, map, overrides);
    const clovaCount = Object.values(saved).filter(
      (v) => v.source === 'clova',
    ).length;
    const manualCount = Object.values(saved).filter(
      (v) => v.source === 'manual',
    ).length;
    console.log(
      `수동 보정 반영 완료: 총 ${places.length}곳 (CLOVA ${clovaCount}곳, 수동 보정 ${manualCount}곳)`,
    );
    return;
  }

  if (bootstrap) {
    let created = 0;
    for (const place of places) {
      if (overrides[place.id]) continue;
      if (force || !map[place.id]) {
        map[place.id] = inferHeuristicLabels(place);
        created++;
      }
    }
    const saved = saveLabels(places, map, overrides);
    const clovaCount = Object.values(saved).filter(
      (v) => v.source === 'clova',
    ).length;
    console.log(
      `규칙 기반 초기 라벨 저장 완료: 총 ${places.length}곳 (신규/갱신 ${created}곳, CLOVA 유지 ${clovaCount}곳, 수동 보정 유지 ${overrideCount}곳)`,
    );
    return;
  }

  const apiKey = process.env.CLOVA_STUDIO_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      '오류: CLOVA_STUDIO_API_KEY 환경 변수가 필요합니다. 초기 규칙 라벨은 --bootstrap, 수동 보정 반영은 --apply-overrides 옵션을 사용하세요.',
    );
    process.exit(1);
  }
  const model =
    process.env.CLOVA_LABEL_MODEL?.trim() ||
    process.env.CLOVA_STUDIO_MODEL?.trim() ||
    'HCX-005';

  const targets = places
    .filter((p) => !overrides[p.id] && (force || map[p.id]?.source !== 'clova'))
    .slice(0, limit);

  if (!targets.length) {
    saveLabels(places, map, overrides);
    console.log(
      `모든 관광지(${places.length}곳, 수동 보정 ${overrideCount}곳 포함)가 이미 라벨링 완료 상태입니다. 수동 보정 외 항목을 재실행하려면 --force를 사용하세요.`,
    );
    return;
  }

  console.log(
    `CLOVA Studio(${model}) 라벨링 시작: 대상 ${targets.length}곳 (배치 ${batchSize}곳, 수동 보정 보호 ${overrideCount}곳)`,
  );

  let labeled = 0;
  let failed = 0;
  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(targets.length / batchSize);
    try {
      const result = await callClovaLabelBatch(batch, apiKey, model);
      for (const place of batch) {
        if (result[place.id]) {
          map[place.id] = result[place.id];
          labeled++;
        } else {
          try {
            const single = await callClovaLabelBatch([place], apiKey, model);
            if (single[place.id]) {
              map[place.id] = single[place.id];
              labeled++;
            } else {
              failed++;
            }
          } catch {
            failed++;
          }
        }
      }
      saveLabels(places, map, overrides);
      console.log(
        `[${batchIndex}/${totalBatches}] 완료 — 누적 CLOVA ${labeled}곳 / 실패 ${failed}곳`,
      );
    } catch (error) {
      console.warn(
        `[${batchIndex}/${totalBatches}] 배치 실패(${(error as Error).message}), 단건으로 분할 재시도합니다.`,
      );
      for (const place of batch) {
        try {
          const single = await callClovaLabelBatch([place], apiKey, model);
          if (single[place.id]) {
            map[place.id] = single[place.id];
            labeled++;
          } else {
            failed++;
          }
        } catch (singleError) {
          console.warn(
            `  단건 실패(${place.id} ${place.name}): ${(singleError as Error).message}`,
          );
          failed++;
        }
        await new Promise((r) => setTimeout(r, delayMs));
      }
      saveLabels(places, map, overrides);
    }
    if (i + batchSize < targets.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  const saved = saveLabels(places, map, overrides);
  const totalClova = Object.values(saved).filter(
    (v) => v.source === 'clova',
  ).length;
  const totalManual = Object.values(saved).filter(
    (v) => v.source === 'manual',
  ).length;
  console.log(
    `라벨링 종료: 이번 성공 ${labeled}곳, 실패 ${failed}곳 | 전체 CLOVA ${totalClova}곳 · 수동 보정 ${totalManual}곳 / ${places.length}곳`,
  );
}

const isEntry =
  process.argv[1] &&
  resolve(process.argv[1]).toLowerCase() ===
    resolve(import.meta.filename).toLowerCase();
if (isEntry) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
