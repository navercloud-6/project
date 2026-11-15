import { z } from 'zod';
import { placeIds } from '@/lib/domain/catalog';
export const placeIdSchema = z
  .string()
  .refine((v) => placeIds.has(v), '등록되지 않은 장소입니다.');
export const journeyInput = z.object({
  name: z.string().trim().min(1).max(60),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) =>
        !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    ),
  event: z
    .object({
      location: z.string().trim().min(1).max(200),
      origin: z.literal('poster'),
    })
    .optional(),
  placeIds: z
    .array(placeIdSchema)
    .min(1)
    .max(8)
    .refine((v) => new Set(v).size === v.length),
});
export const recordInput = z.object({
  journeyId: z.string().uuid(),
  placeId: placeIdSchema,
  rating: z.number().int().min(1).max(5),
  note: z.string().trim().max(500),
});
export const recommendationInput = z.object({
  prompt: z.string().trim().min(2).max(500),
  region: z.string().max(40).default('전체'),
});
export const recommendationOutput = z
  .object({
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(500),
    stops: z
      .array(
        z.object({
          placeId: placeIdSchema,
          reason: z.string().min(1).max(250),
        }),
      )
      .min(1)
      .max(5),
  })
  .refine(
    (v) => new Set(v.stops.map((s) => s.placeId)).size === v.stops.length,
  );
export type Recommendation = z.infer<typeof recommendationOutput> & {
  mode: 'demo' | 'clova';
};
export type Journey = z.infer<typeof journeyInput> & {
  id: string;
  createdAt: string;
  revision?: string;
  records: Record<string, { rating: number; note: string }>;
};
