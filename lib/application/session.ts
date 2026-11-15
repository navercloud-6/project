import { ApplicationError } from '@/lib/domain/errors';
import type { IdentityPort, SessionRepository } from './ports';

export function createSession(
  repository: SessionRepository,
  identity: IdentityPort,
) {
  return (token: string | undefined, create = false) => {
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const owner = identity.digest(token);
      if (repository.valid(owner, identity.now())) return { owner };
    }
    if (!create)
      throw new ApplicationError(
        'SESSION_REQUIRED',
        '세션이 만료되었습니다. 페이지를 새로고침해 주세요.',
      );
    const next = identity.token();
    const owner = identity.digest(next);
    repository.insert(owner, identity.now() + 30 * 86400000);
    return { owner, token: next };
  };
}
