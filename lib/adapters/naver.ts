import type { AIPort, Capabilities } from '@/lib/application/ports';
import { z } from 'zod';
import { ApplicationError } from '@/lib/domain/errors';

export const capabilities = (): Capabilities => ({
  clova: Boolean(process.env.CLOVA_STUDIO_API_KEY),
  voice: Boolean(
    process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET,
  ),
  translate: Boolean(
    process.env.PAPAGO_CLIENT_ID && process.env.PAPAGO_CLIENT_SECRET,
  ),
  ocr: Boolean(process.env.CLOVA_OCR_URL && process.env.CLOVA_OCR_SECRET),
});

export async function upstream(url: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(30000),
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    throw new ApplicationError(
      'UPSTREAM_TIMEOUT',
      'NAVER Cloud 연결이 지연되었습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
  if (!response.ok)
    throw new ApplicationError(
      'UPSTREAM_INVALID',
      'NAVER Cloud 호출이 실패했습니다. API 설정과 사용 한도를 확인해 주세요.',
    );
  return response;
}
const chatResponse = z.object({
  status: z.object({ code: z.literal('20000') }),
  result: z.object({
    finishReason: z.string().optional(),
    aiFilter: z.array(z.object({ score: z.string() })).optional(),
    message: z
      .object({
        content: z.unknown().optional(),
        toolCalls: z.unknown().optional(),
      })
      .passthrough(),
  }),
});

export async function chat(
  messages: unknown[],
  extra: Record<string, unknown> = {},
  model = process.env.CLOVA_STUDIO_MODEL || 'HCX-005',
) {
  if (!capabilities().clova)
    throw new ApplicationError(
      'UNAVAILABLE',
      'CLOVA Studio API 키 설정이 필요합니다.',
    );
  const response = await upstream(
    `https://clovastudio.stream.ntruss.com/v3/chat-completions/${encodeURIComponent(model)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${process.env.CLOVA_STUDIO_API_KEY}`,
        'X-NCP-CLOVASTUDIO-REQUEST-ID': crypto.randomUUID(),
      },
      body: JSON.stringify({
        messages,
        maxTokens: 1600,
        temperature: 0.2,
        includeAiFilters: true,
        ...extra,
      }),
    },
  );
  const parsed = chatResponse.safeParse(
    await response.json().catch(() => null),
  );
  if (
    !parsed.success ||
    parsed.data.result.finishReason === 'length' ||
    parsed.data.result.aiFilter?.some((filter) => filter.score === '0')
  )
    throw new ApplicationError(
      'UPSTREAM_INVALID',
      'AI 응답을 사용할 수 없습니다. 다시 시도해 주세요.',
    );
  return parsed.data.result.message;
}
export async function translate(text: string, target: string) {
  if (!capabilities().translate)
    throw new ApplicationError(
      'UNAVAILABLE',
      'Papago API 키 설정이 필요합니다.',
    );
  const response = await upstream(
    'https://papago.apigw.ntruss.com/nmt/v1/translation',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-NCP-APIGW-API-KEY-ID': process.env.PAPAGO_CLIENT_ID!,
        'X-NCP-APIGW-API-KEY': process.env.PAPAGO_CLIENT_SECRET!,
      },
      body: JSON.stringify({ source: 'ko', target, text }),
    },
  );
  const result = z
    .string()
    .min(1)
    .max(12000)
    .safeParse((await response.json()).message?.result?.translatedText);
  if (!result.success)
    throw new ApplicationError(
      'UPSTREAM_INVALID',
      '번역 결과를 확인할 수 없습니다.',
    );
  return result.data;
}
export async function voice(text: string) {
  if (!capabilities().voice)
    throw new ApplicationError(
      'UNAVAILABLE',
      'CLOVA Voice API 키 설정이 필요합니다.',
    );
  const response = await upstream(
    'https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID!,
        'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET!,
      },
      body: new URLSearchParams({
        speaker: 'nara',
        volume: '0',
        speed: '0',
        pitch: '0',
        format: 'mp3',
        text,
      }),
    },
  );
  if (!response.headers.get('content-type')?.includes('audio/'))
    throw new ApplicationError(
      'UPSTREAM_INVALID',
      '음성 응답이 올바르지 않습니다.',
    );
  return new Uint8Array(await response.arrayBuffer());
}
export async function ocr(image: Uint8Array) {
  if (!capabilities().ocr)
    throw new ApplicationError(
      'UNAVAILABLE',
      'CLOVA OCR 도메인 URL과 Secret 설정이 필요합니다.',
    );
  const url = new URL(process.env.CLOVA_OCR_URL!);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.apigw.ntruss.com'))
    throw new ApplicationError(
      'UNAVAILABLE',
      'OCR URL은 NAVER Cloud API Gateway HTTPS 주소여야 합니다.',
    );
  const response = await upstream(url.href, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-OCR-SECRET': process.env.CLOVA_OCR_SECRET!,
    },
    body: JSON.stringify({
      version: 'V2',
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      lang: 'ko',
      images: [
        {
          format: 'jpg',
          name: 'poster',
          data: Buffer.from(image).toString('base64'),
        },
      ],
    }),
  });
  const imageResult = (await response.json()).images?.[0];
  if (imageResult?.inferResult !== 'SUCCESS')
    throw new ApplicationError(
      'UPSTREAM_INVALID',
      '포스터에서 글자를 읽지 못했습니다. 직접 입력하거나 다른 사진을 사용해 주세요.',
    );
  const fields = z
    .array(
      z.object({ inferText: z.string(), lineBreak: z.boolean().optional() }),
    )
    .max(3000)
    .safeParse(imageResult.fields);
  if (!fields.success)
    throw new ApplicationError(
      'UPSTREAM_INVALID',
      'OCR 응답이 올바르지 않습니다.',
    );
  return fields.data
    .map((f) => f.inferText + (f.lineBreak ? '\n' : ' '))
    .join('')
    .slice(0, 6000);
}

export const naver: AIPort = {
  imageData: (image: Uint8Array) => Buffer.from(image).toString('base64'),
  capabilities,
  chat,
  translate,
  voice,
  ocr,
};
