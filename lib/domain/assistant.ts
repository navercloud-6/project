import { z } from 'zod';
import { places } from './catalog';
import { journeyInput, placeIdSchema, type Journey } from './contracts';
import { ApplicationError } from './errors';
import { weatherQuerySchema } from './weather';
import { briefingLanguage } from './briefing';
export const historySchema = z
  .array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().max(1200),
    }),
  )
  .max(6)
  .default([]);
export type History = z.infer<typeof historySchema>;

export const editOutput = z.object({
  name: journeyInput.shape.name,
  date: journeyInput.shape.date,
  placeIds: journeyInput.shape.placeIds,
  explanation: z.string().min(1).max(500),
});
export const posterOutput = z.object({
  title: z.string().max(60),
  date: z.union([journeyInput.shape.date, z.literal('')]),
  location: z.string().max(200),
});
export function demoEdit(journey: Journey, prompt: string) {
  let ids = [...journey.placeIds];
  const ordinal = prompt.match(
    /([1-8])\s*번째\s*(?:장소[를는]?\s*)?(?:빼|제외|삭제)/,
  );
  if (ordinal) {
    const index = Number(ordinal[1]) - 1;
    if (index >= ids.length)
      throw new ApplicationError('INVALID_INPUT', '그 순서의 장소가 없습니다.');
    ids.splice(index, 1);
  } else if (prompt.trim() === '순서 반대로') ids.reverse();
  else if (prompt.includes('추가')) {
    const place = places.find((p) => prompt.includes(p.name));
    if (!place)
      throw new ApplicationError(
        'INVALID_INPUT',
        '추가할 장소의 정확한 이름을 입력해 주세요.',
      );
    if (!ids.includes(place.id)) ids.push(place.id);
  } else
    throw new ApplicationError(
      'INVALID_INPUT',
      '데모에서는 “2번째 빼기”, “순서 반대로”, “오이도 빨강등대 추가”를 사용할 수 있습니다.',
    );
  return editOutput.parse({
    name: journey.name,
    date: journey.date,
    placeIds: ids,
    explanation: '규칙 기반 데모 변경안입니다. 적용 전 장소를 확인해 주세요.',
  });
}

export const assistantInput = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('guide'),
    question: z.string().trim().min(2).max(500),
    placeId: placeIdSchema.optional(),
    history: historySchema,
  }),
  z.object({
    action: z.literal('edit'),
    journeyId: z.string().uuid(),
    prompt: z.string().trim().min(2).max(500),
    history: historySchema,
  }),
  z.object({
    action: z.literal('apply'),
    journeyId: z.string().uuid(),
    revision: z.string().max(80),
    proposal: editOutput,
  }),
  z
    .object({
      action: z.literal('translate'),
      placeId: placeIdSchema.optional(),
      journeyId: z.string().uuid().optional(),
      target: z.enum(['en', 'ja', 'zh-CN']),
    })
    .refine((v) => Boolean(v.placeId) !== Boolean(v.journeyId)),
  z.object({ action: z.literal('voice'), placeId: placeIdSchema }),
  z.object({
    action: z.literal('briefing'),
    region: weatherQuerySchema.shape.region,
    lang: briefingLanguage,
  }),
  z.object({
    action: z.literal('briefingVoice'),
    region: weatherQuerySchema.shape.region,
    lang: briefingLanguage,
  }),
  z.object({
    action: z.literal('diary'),
    journeyId: z.string().uuid(),
    placeId: placeIdSchema,
  }),
]);
