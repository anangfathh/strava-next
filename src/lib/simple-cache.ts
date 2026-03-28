type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const globalCache = globalThis as unknown as {
  stravaCache?: Map<string, CacheEntry<unknown>>;
};

const cache = globalCache.stravaCache ?? new Map<string, CacheEntry<unknown>>();
globalCache.stravaCache = cache;

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getCacheTtlMs(): number {
  return readIntEnv("STRAVA_CACHE_TTL_SECONDS", 180) * 1000;
}

export function getCached<T>(key: string): T | null {
  const row = cache.get(key);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return row.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs = getCacheTtlMs()): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}
