// Native stub — IndexedDB not available on React Native.
// Metro resolves lib/offline-cache.web.ts on web automatically.

export async function cachedQuery<T>(
  _key: string,
  queryFn: () => Promise<T | null>,
  _ttlMs: number
): Promise<T | null> {
  return queryFn();
}

export async function cacheSet<T>(_key: string, _data: T, _ttlMs: number): Promise<void> {}
export async function cacheInvalidate(_key: string): Promise<void> {}

// LRU search cache — no-ops on native
export async function searchCacheGet<T>(_ns: string, _queryHash: string): Promise<T | null> {
  return null;
}
export async function searchCacheSet<T>(
  _ns: string, _queryHash: string, _results: T
): Promise<void> {}
export async function searchCacheInvalidate(_ns: string): Promise<void> {}
