import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  COMPANION_LABELS,
  SETTING_LABELS,
  STYLE_LABELS,
  THEME_LABELS,
  clovaPlaceLabelSchema,
  inferHeuristicLabels,
  placeLabelSchema,
  type LabelablePlace,
  type PlaceLabel,
  type PlaceLabelMap,
} from '../lib/domain/place-labels';

const ROOT = resolve(import.meta.dirname, '..');
const PLACES_PATH = resolve(ROOT, 'data/places.json');
const LABELS_PATH = resolve(ROOT, 'data/place-labels.json');

const batchResponseSchema = z.object({
  items: z.array(
    clovaPlaceLabelSchema.extend({
      id: z.string().min(1),
    }),
  ),
});

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
    '반드시 아래 허용된 라벨 목록만 사용하고, JSON 외의 텍스트나 코드블록을 출력하지 마라.',
    `setting (1개): ${SETTING_LABELS.join(', ')}`,
    `themes (1~4개): ${THEME_LABELS.join(', ')}`,
    `companions (1~4개): ${COMPANION_LABELS.join(', ')}`,
    `styles (1~4개): ${STYLE_LABELS.join(', ')}`,
    'keywords: 장소 이름·특징에서 추출한 핵심 한국어 검색어 2~6개 (각 20자 이내).',
    '박물관·미술관·전시관·과학관·도서관·기념관·실내 체험관은 setting을 "실내" 또는 "실내·야외"로, styles에 "비오는날"을 포함하라.',
    '호수·저수지·강변·수변 공원은 themes에 "호수"를 포함하라.',
    '출력 형식: {"items":[{"id":"장소ID","setting":"실내","themes":["박물관·전시"],"companions":["아이동반","가족"],"styles":["비오는날","교육·학습"],"keywords":["박물관","전시"]}]}',
  ].join('\n');
}

export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('JSON 객체를 찾지 못했습니다.');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export function parseBatchLabels(
  rawContent: string,
  expectedIds: Set<string>,
): Record<string, PlaceLabel> {
  const parsed = batchResponseSchema.parse(extractJson(rawContent));
  const result: Record<string, PlaceLabel> = {};
  for (const item of parsed.items) {
    if (!expectedIds.has(item.id)) continue;
    const { id, ...rest } = item;
    result[id] = placeLabelSchema.parse({
      ...rest,
      source: 'clova',
    });
  }
  return result;
}

async function callClovaLabelBatch(
  batch: LabelablePlace[],
  apiKey: string,
  model: string,
): Promise<Record<string, PlaceLabel>> {
  const url = `https://clovastudio.stream.ntruss.com/v3/chat-completions/${encodeURIComponent(model)}`;
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
          maxTokens: 2048,
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

function loadExistingLabels(): PlaceLabelMap {
  if (!existsSync(LABELS_PATH)) return {};
  const raw = JSON.parse(readFileSync(LABELS_PATH, 'utf8')) as Record<
    string,
    unknown
  >;
  const map: PlaceLabelMap = {};
  for (const [id, value] of Object.entries(raw)) {
    const parsed = placeLabelSchema.safeParse(value);
    if (parsed.success) map[id] = parsed.data;
  }
  return map;
}

function saveLabels(places: LabelablePlace[], map: PlaceLabelMap) {
  const ordered: PlaceLabelMap = {};
  for (const place of places) {
    ordered[place.id] = map[place.id] ?? inferHeuristicLabels(place);
  }
  writeFileSync(LABELS_PATH, JSON.stringify(ordered, null, 2) + '\n', 'utf8');
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
  const force = args.includes('--force');
  const batchSize = parseArgNumber(args, '--batch=', 10);
  const limit = parseArgNumber(args, '--limit=', Infinity);
  const delayMs = parseArgNumber(args, '--delay=', 400);

  const places = JSON.parse(
    readFileSync(PLACES_PATH, 'utf8'),
  ) as LabelablePlace[];
  const map = loadExistingLabels();

  if (bootstrap) {
    let created = 0;
    for (const place of places) {
      if (force || !map[place.id]) {
        map[place.id] = inferHeuristicLabels(place);
        created++;
      }
    }
    saveLabels(places, map);
    const clovaCount = Object.values(map).filter(
      (v) => v.source === 'clova',
    ).length;
    console.log(
      `규칙 기반 초기 라벨 저장 완료: 총 ${places.length}곳 (신규/갱신 ${created}곳, CLOVA 유지 ${clovaCount}곳)`,
    );
    return;
  }

  const apiKey = process.env.CLOVA_STUDIO_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      '오류: CLOVA_STUDIO_API_KEY 환경 변수가 필요합니다. 초기 규칙 라벨만 생성하려면 --bootstrap 옵션을 사용하세요.',
    );
    process.exit(1);
  }
  const model =
    process.env.CLOVA_LABEL_MODEL?.trim() ||
    process.env.CLOVA_FUNCTION_MODEL?.trim() ||
    process.env.CLOVA_STUDIO_MODEL?.trim() ||
    'HCX-DASH-002';

  const targets = places
    .filter((p) => force || map[p.id]?.source !== 'clova')
    .slice(0, limit);

  if (!targets.length) {
    console.log(
      `모든 관광지(${places.length}곳)가 이미 CLOVA 라벨링 완료 상태입니다. 재실행하려면 --force를 사용하세요.`,
    );
    return;
  }

  console.log(
    `CLOVA Studio(${model}) 라벨링 시작: 대상 ${targets.length}곳 (배치 ${batchSize}곳)`,
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
          // 누락된 단건 재시도
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
      saveLabels(places, map);
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
      saveLabels(places, map);
    }
    if (i + batchSize < targets.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  const totalClova = Object.values(map).filter(
    (v) => v.source === 'clova',
  ).length;
  console.log(
    `라벨링 종료: 이번 성공 ${labeled}곳, 실패 ${failed}곳 | 전체 CLOVA 라벨 ${totalClova}/${places.length}곳`,
  );
}

const isEntry =
  process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename);
if (isEntry) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
