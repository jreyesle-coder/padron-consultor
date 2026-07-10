import { createStore, get, set, del } from 'idb-keyval';

// ── General cache store ───────────────────────────────────────────────────────
// Keys are caller-scoped; callers should include the user namespace:
//   `${ns}_recintos:all`  or  `${ns}_lideres:all`
const generalStore = createStore('prm-offline-cache', 'cache');
type CacheEntry<T> = { data: T; ts: number; ttlMs: number };

/**
 * Execute queryFn and cache the result for ttlMs.
 * Within TTL → returns cached value immediately.
 * On network failure → returns stale value as fallback (stale-while-error).
 */
export async function cachedQuery<T>(
  key: string,
  queryFn: () => Promise<T | null>,
  ttlMs: number
): Promise<T | null> {
  let cached: CacheEntry<T> | undefined;
  try { cached = await get<CacheEntry<T>>(key, generalStore); } catch {}

  if (cached && Date.now() - cached.ts < cached.ttlMs) return cached.data;

  try {
    const fresh = await queryFn();
    if (fresh !== null && fresh !== undefined) {
      await set(key, { data: fresh, ts: Date.now(), ttlMs }, generalStore).catch(() => {});
    }
    return fresh;
  } catch {
    // Offline or server error → serve stale data
    return cached?.data ?? null;
  }
}

export async function cacheSet<T>(key: string, data: T, ttlMs: number): Promise<void> {
  await set(key, { data, ts: Date.now(), ttlMs }, generalStore).catch(() => {});
}

export async function cacheInvalidate(key: string): Promise<void> {
  await del(key, generalStore).catch(() => {});
}

// ── LRU search cache ──────────────────────────────────────────────────────────
// Stores the last MAX_ENTRIES distinct searches per user+org namespace.
// Keyed by: `searches|${ns}` → SearchEntry[]  (most-recent-first order)
const MAX_SEARCH_ENTRIES = 50;
const SEARCH_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const searchStore = createStore('prm-search-cache', 'searches');

type SearchEntry<T> = { queryHash: string; results: T; ts: number };

function searchKey(ns: string): string {
  return `searches|${ns}`;
}

async function loadEntries<T>(ns: string): Promise<SearchEntry<T>[]> {
  return (await get<SearchEntry<T>[]>(searchKey(ns), searchStore)) ?? [];
}

/**
 * Look up a cached search by its hash (deterministic JSON of query params).
 * Side-effect: promotes the hit to the front of the LRU list.
 * Returns null on miss or when the entry is older than 24 h.
 */
export async function searchCacheGet<T>(ns: string, queryHash: string): Promise<T | null> {
  try {
    const entries = await loadEntries<T>(ns);
    const idx = entries.findIndex(e => e.queryHash === queryHash);
    if (idx === -1) return null;
    const entry = entries[idx];
    if (Date.now() - entry.ts > SEARCH_TTL_MS) return null;
    // Promote to front (LRU touch)
    const reordered = [entry, ...entries.filter((_, i) => i !== idx)];
    await set(searchKey(ns), reordered, searchStore).catch(() => {});
    return entry.results;
  } catch { return null; }
}

/**
 * Cache a search result.
 * Evicts: entries older than TTL + oldest entries beyond MAX_SEARCH_ENTRIES.
 */
export async function searchCacheSet<T>(
  ns: string,
  queryHash: string,
  results: T
): Promise<void> {
  try {
    const entries = await loadEntries<T>(ns);
    const now = Date.now();
    // Remove same hash + expired entries
    const filtered = entries.filter(
      e => e.queryHash !== queryHash && now - e.ts <= SEARCH_TTL_MS
    );
    const updated: SearchEntry<T>[] = [
      { queryHash, results, ts: now },
      ...filtered,
    ].slice(0, MAX_SEARCH_ENTRIES);
    await set(searchKey(ns), updated, searchStore).catch(() => {});
  } catch {}
}

/** Wipe all cached searches for a given user+org (force-refresh button). */
export async function searchCacheInvalidate(ns: string): Promise<void> {
  await del(searchKey(ns), searchStore).catch(() => {});
}
