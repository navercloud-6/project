'use client';
import type { Place } from '@/lib/domain/catalog';
export type { Capabilities } from '@/lib/application/ports';
export type { History } from '@/lib/domain/assistant';
export function ErrorText({ text }: { text: string }) {
  return text ? (
    <p role="alert" className="tool-error">
      {text}
    </p>
  ) : null;
}
export function groupPlacesByRegion(places: readonly Place[]) {
  const map = new Map<string, Place[]>();
  for (const place of places) {
    const list = map.get(place.region) ?? [];
    list.push(place);
    map.set(place.region, list);
  }
  return [...map.entries()];
}
