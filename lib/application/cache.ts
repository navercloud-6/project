type Entry<T> = { at: number; value: T };

export type CacheOptions = {
  now: () => number;
  ttlMs: number;
  maxEntries: number;
};

/**
 * 프로세스 인메모리 TTL·LRU 캐시와 동시 요청 병합(singleflight).
 * 실패한 요청은 캐시하지 않고, 용량 초과 시 만료 항목을 먼저 정리한 뒤 가장 오래 안 쓴 항목을 비운다.
 */
export function createCache<T>({ now, ttlMs, maxEntries }: CacheOptions) {
  const entries = new Map<string, Entry<T>>();
  const pending = new Map<string, Promise<T>>();

  const fresh = (entry: Entry<T>, timestamp: number) =>
    timestamp - entry.at < ttlMs;

  function sweep(timestamp: number) {
    for (const [key, entry] of entries) {
      if (!fresh(entry, timestamp)) entries.delete(key);
    }
  }

  function get(key: string): T | undefined {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (!fresh(entry, now())) {
      entries.delete(key);
      return undefined;
    }
    entries.delete(key);
    entries.set(key, entry);
    return entry.value;
  }

  function has(key: string): boolean {
    const entry = entries.get(key);
    if (entry) {
      if (fresh(entry, now())) return true;
      entries.delete(key);
    }
    return pending.has(key);
  }

  function set(key: string, value: T): void {
    if (maxEntries <= 0) return;
    const timestamp = now();
    entries.delete(key);
    if (entries.size >= maxEntries) sweep(timestamp);
    while (entries.size >= maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
    entries.set(key, { at: timestamp, value });
  }

  function getOrLoad(
    key: string,
    load: () => Promise<T>,
    options?: { shouldCache?: (value: T) => boolean },
  ): Promise<T> {
    const cached = get(key);
    if (cached !== undefined) return Promise.resolve(cached);
    const running = pending.get(key);
    if (running) return running;
    const request = Promise.resolve()
      .then(load)
      .then((value) => {
        if (!options?.shouldCache || options.shouldCache(value)) {
          set(key, value);
        }
        return value;
      })
      .finally(() => {
        pending.delete(key);
      });
    pending.set(key, request);
    return request;
  }

  return {
    get,
    has,
    set,
    getOrLoad,
    delete: (key: string) => entries.delete(key),
    size: () => entries.size,
  };
}
