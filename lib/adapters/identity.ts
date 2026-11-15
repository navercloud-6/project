import { randomUUID, randomBytes, createHash } from 'node:crypto';
import type { IdentityPort } from '@/lib/application/ports';
export const identity: IdentityPort = {
  id: randomUUID,
  now: Date.now,
  token: () => randomBytes(32).toString('hex'),
  digest: (token) => createHash('sha256').update(token).digest('hex'),
};
