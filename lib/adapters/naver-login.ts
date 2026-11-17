import { z } from 'zod';
import type { LoginPort } from '@/lib/application/ports';
import { ApplicationError } from '@/lib/domain/errors';

function config() {
  const client = process.env.NAVER_LOGIN_CLIENT_ID;
  const secret = process.env.NAVER_LOGIN_CLIENT_SECRET;
  const origin = process.env.APP_ORIGIN;
  if (!client || !secret || !origin)
    throw new ApplicationError(
      'UNAVAILABLE',
      '네이버 로그인 설정이 필요합니다.',
    );
  const url = new URL(origin);
  if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol))
    throw new ApplicationError(
      'UNAVAILABLE',
      'APP_ORIGIN 설정을 확인해 주세요.',
    );
  return { client, secret, callback: `${origin}/api/auth/naver/callback` };
}
async function request(url: string, init: RequestInit) {
  try {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error('upstream');
    return await response.json();
  } catch {
    throw new ApplicationError(
      'UPSTREAM_INVALID',
      '네이버 로그인에 연결하지 못했습니다. 다시 시도해 주세요.',
    );
  }
}
export const naverLogin: LoginPort = {
  enabled() {
    try {
      config();
      return true;
    } catch {
      return false;
    }
  },
  authorize(state) {
    const { client, callback } = config();
    return (
      'https://nid.naver.com/oauth2.0/authorize?' +
      new URLSearchParams({
        response_type: 'code',
        client_id: client,
        redirect_uri: callback,
        state,
      })
    );
  },
  async identify(code, state) {
    const { client, secret } = config();
    const token = z
      .object({
        access_token: z.string().min(1),
        token_type: z.string().regex(/^bearer$/i),
      })
      .safeParse(
        await request('https://nid.naver.com/oauth2.0/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: client,
            client_secret: secret,
            code,
            state,
          }),
        }),
      );
    if (!token.success)
      throw new ApplicationError(
        'UPSTREAM_INVALID',
        '네이버 인증을 확인하지 못했습니다.',
      );
    const profile = z
      .object({
        resultcode: z.literal('00'),
        response: z.object({ id: z.string().min(1).max(512) }),
      })
      .safeParse(
        await request('https://openapi.naver.com/v1/nid/me', {
          headers: { Authorization: `Bearer ${token.data.access_token}` },
        }),
      );
    if (!profile.success)
      throw new ApplicationError(
        'UPSTREAM_INVALID',
        '네이버 계정을 확인하지 못했습니다.',
      );
    return profile.data.response.id;
  },
};
