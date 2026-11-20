'use client';
export type { Capabilities } from '@/lib/application/ports';
export type { History } from '@/lib/domain/assistant';
export function ErrorText({ text }: { text: string }) {
  return text ? (
    <p role="alert" className="tool-error">
      {text}
    </p>
  ) : null;
}
