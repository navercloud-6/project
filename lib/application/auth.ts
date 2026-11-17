import { ApplicationError } from '@/lib/domain/errors';
import type {
  AuthRepository,
  IdentityPort,
  LoginPort,
  SessionRepository,
} from './ports';
import { createSession } from './session';

export function createAuth(
  repository: AuthRepository,
  sessions: SessionRepository,
  identity: IdentityPort,
  provider: LoginPort,
) {
  const resolve = createSession(sessions, identity);
  const hash = (token: string | undefined) =>
    token && /^[a-f0-9]{64}$/.test(token) ? identity.digest(token) : undefined;
  return {
    status(token: string | undefined) {
      const digest = hash(token);
      const owner = digest ? sessions.owner(digest, identity.now()) : undefined;
      return {
        enabled: provider.enabled(),
        authenticated: owner?.startsWith('naver:') ?? false,
      };
    },
    begin(token: string | undefined) {
      if (!provider.enabled())
        throw new ApplicationError(
          'UNAVAILABLE',
          '네이버 로그인 설정이 필요합니다.',
        );
      const state = identity.token();
      const url = provider.authorize(state);
      const current = resolve(token, true);
      const active = current.token ?? token!;
      repository.attempt(
        identity.digest(state),
        identity.digest(active),
        identity.now() + 600000,
      );
      return { url, state, token: active };
    },
    async complete(
      token: string | undefined,
      expected: string | undefined,
      state: string | null,
      code: string | null,
      denied: boolean,
    ) {
      const digest = hash(token);
      if (
        !digest ||
        !state ||
        !hash(state) ||
        !expected ||
        state !== expected ||
        !repository.consume(identity.digest(state), digest, identity.now())
      ) {
        throw new ApplicationError(
          'FORBIDDEN',
          '로그인 요청이 만료되었거나 일치하지 않습니다. 다시 시도해 주세요.',
        );
      }
      if (denied)
        throw new ApplicationError(
          'INVALID_INPUT',
          '네이버 로그인이 취소되었습니다.',
        );
      if (!sessions.owner(digest, identity.now()))
        throw new ApplicationError(
          'SESSION_REQUIRED',
          '로그인 세션이 만료되었습니다. 다시 시도해 주세요.',
        );
      if (!code || code.length > 2048)
        throw new ApplicationError(
          'INVALID_INPUT',
          '네이버 인증 코드가 올바르지 않습니다.',
        );
      const id = await provider.identify(code, state);
      const next = identity.token();
      repository.login(
        digest,
        identity.digest(next),
        'naver:' + identity.digest(id),
        identity.now(),
      );
      return next;
    },
    logout(token: string | undefined) {
      const digest = hash(token);
      if (digest) repository.revoke(digest);
      return resolve(undefined, true).token!;
    },
  };
}
