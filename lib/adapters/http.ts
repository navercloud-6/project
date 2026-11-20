import { cookies } from 'next/headers';
import { ZodError } from 'zod';
import { resolveSession } from '@/lib/server';
import { ApplicationError } from '@/lib/domain/errors';

export const sessionCookie = 'tourpass-session';
export const oauthStateCookie = 'tourpass-oauth-state';
export const cookieOptions = (maxAge = 30 * 86400) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.COOKIE_SECURE === 'true',
  path: '/',
  maxAge,
});
export const redirect303 = (location: string) =>
  new Response(null, {
    status: 303,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });

export async function session(create = false) {
  const jar = await cookies();
  const { owner, token } = await resolveSession(
    jar.get(sessionCookie)?.value,
    create,
  );
  if (token) jar.set(sessionCookie, token, cookieOptions());
  return owner;
}
export function checkOrigin(request: Request) {
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (request.headers.get('origin') !== expected)
    throw new ApplicationError(
      'FORBIDDEN',
      '요청 출처를 확인할 수 없습니다. APP_ORIGIN 설정을 확인해 주세요.',
    );
}
export async function readBody(
  request: Request,
  maximum: number,
  messages: { missing: string; tooLarge: string },
): Promise<Buffer> {
  const reader = request.body?.getReader();
  if (!reader) throw new ApplicationError('INVALID_INPUT', messages.missing);
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximum) {
      await reader.cancel();
      throw new ApplicationError('PAYLOAD_TOO_LARGE', messages.tooLarge);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function jsonBody(request: Request, maximum = 8192) {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new ApplicationError('UNSUPPORTED_MEDIA', 'JSON 요청이 필요합니다.');
  const body = await readBody(request, maximum, {
    missing: '입력이 필요합니다.',
    tooLarge: '입력 내용이 너무 깁니다.',
  });
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new ApplicationError('INVALID_INPUT', '올바른 JSON이 아닙니다.');
  }
}
const statuses = {
  INVALID_INPUT: 400,
  SESSION_REQUIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  RATE_LIMIT: 429,
  UPSTREAM_INVALID: 502,
  UNAVAILABLE: 503,
  UPSTREAM_TIMEOUT: 504,
} as const;
export function failure(error: unknown) {
  if (error instanceof ApplicationError)
    return Response.json(
      { error: error.message },
      { status: statuses[error.code] },
    );
  if (error instanceof ZodError)
    return Response.json(
      { error: '입력 항목과 길이를 확인해 주세요.' },
      { status: 400 },
    );
  return Response.json(
    { error: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
    { status: 500 },
  );
}
