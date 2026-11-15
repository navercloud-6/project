'use client';
import { request } from '@/lib/adapters/client-api';
export type { Capabilities } from '@/lib/application/ports';
export type { History } from '@/lib/domain/assistant';
export function assistant(body: unknown) {
  return request('/api/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
export function ErrorText({ text }: { text: string }) {
  return text ? (
    <p role="alert" className="tool-error">
      {text}
    </p>
  ) : null;
}
