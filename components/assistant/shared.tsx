'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/adapters/client-api';
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

export function useRegionQuery<T extends { region: string }>(
  path: string,
  region: string,
  schema: { parse: (value: unknown) => T },
  retryKey = 0,
) {
  const [state, setState] = useState<{
    region: string;
    data?: T;
    error?: string;
  }>({ region });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({ region });
    api(
      `${path}?region=${encodeURIComponent(region)}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then((raw) => {
        const data = schema.parse(raw);
        if (data.region !== region)
          throw new Error('선택한 지역의 정보를 확인하지 못했어요.');
        if (active) setState({ region, data });
      })
      .catch((error) => {
        if (!active || (error instanceof Error && error.name === 'AbortError'))
          return;
        setState({ region, error: (error as Error).message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, region, schema, retryKey]);

  return state.region === region ? state : { region };
}
