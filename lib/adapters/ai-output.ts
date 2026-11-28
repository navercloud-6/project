import { z } from 'zod';
import { ApplicationError } from '@/lib/domain/errors';

const AI_OUTPUT_MAX = 20000;

function scanJsonBlocks(source: string): unknown[] {
  const blocks: unknown[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"' && depth > 0) {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' || ch === ']') {
      if (depth > 0) depth--;
      if (depth === 0 && start !== -1) {
        try {
          blocks.push(JSON.parse(source.slice(start, i + 1)));
        } catch {
          // 깨진 조각은 건너뛰고 다음 JSON 블록을 계속 탐색한다.
        }
        start = -1;
      }
    }
  }
  return blocks;
}

export function extractJsonValues(text: unknown): unknown[] {
  if (typeof text !== 'string' || text.length > AI_OUTPUT_MAX) return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  try {
    return [JSON.parse(trimmed)];
  } catch {
    // 코드 펜스나 설명 문구가 함께 온 응답은 아래에서 JSON 블록을 추출한다.
  }

  const fencedBlocks = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
    .map((m) => m[1]?.trim() ?? '')
    .filter(Boolean);

  if (fencedBlocks.length > 0) {
    const out: unknown[] = [];
    for (const block of fencedBlocks) {
      try {
        out.push(JSON.parse(block));
      } catch {
        out.push(...scanJsonBlocks(block));
      }
    }
    if (out.length > 0) return out;
  }

  return scanJsonBlocks(trimmed);
}

export function parseAI<T>(schema: z.ZodType<T>, text: unknown): T {
  for (const value of extractJsonValues(text)) {
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
  }
  throw new ApplicationError(
    'UPSTREAM_INVALID',
    'AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.',
  );
}
