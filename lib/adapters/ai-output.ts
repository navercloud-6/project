import { z } from 'zod';
import { ApplicationError } from '@/lib/domain/errors';
export function parseAI<T>(schema: z.ZodType<T>, text: unknown): T {
  try {
    if (typeof text !== 'string' || text.length > 20000) throw Error();
    return schema.parse(
      JSON.parse(text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')),
    );
  } catch {
    throw new ApplicationError(
      'UPSTREAM_INVALID',
      'AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.',
    );
  }
}
