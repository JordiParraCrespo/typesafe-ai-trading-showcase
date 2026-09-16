import { randomUUID } from 'node:crypto';

export interface SharedStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  claim(key: string, owner: string, ttlSeconds: number): Promise<boolean>;
  publish(key: string, owner: string, value: unknown): Promise<boolean>;
  release(key: string, owner: string): Promise<void>;
}

// All operations go to the same Redis database, across visitors and Vercel instances.
export class RedisStore implements SharedStore {
  private url: string;
  private token: string;
  constructor(url: string, token: string) {
    if (new URL(url).protocol !== 'https:') throw new Error('Redis requires HTTPS');
    this.url = url; this.token = token;
  }
  private async command(args: (string | number)[]): Promise<unknown> {
    const response = await fetch(this.url, {
      method: 'POST', headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(args), signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error('Shared cache unavailable');
    const data = await response.json() as { result?: unknown; error?: string };
    if (data.error) throw new Error('Shared cache command failed');
    return data.result;
  }
  async get<T>(key: string): Promise<T | null> {
    const value = await this.command(['GET', key]);
    return value === null ? null : JSON.parse(String(value)) as T;
  }
  async set(key: string, value: unknown, ttl: number): Promise<void> {
    await this.command(['SET', key, JSON.stringify(value), 'EX', ttl]);
  }
  async claim(key: string, owner: string, ttl: number): Promise<boolean> {
    return await this.command(['SET', key, owner, 'NX', 'EX', ttl]) === 'OK';
  }
  async publish(key: string, owner: string, value: unknown): Promise<boolean> {
    // Publish only while owning the lease: a late worker cannot overwrite newer data.
    return await this.command(['EVAL', "if redis.call('GET',KEYS[1]) == ARGV[1] then redis.call('SET',KEYS[2],ARGV[2],'EX',600); redis.call('DEL',KEYS[1]); return 1 else return 0 end", 2, key + ':lock', key, owner, JSON.stringify(value)]) === 1;
  }
  async release(key: string, owner: string): Promise<void> {
    await this.command(['EVAL', "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", 1, key + ':lock', owner]);
  }
}

export function sharedStore(): SharedStore | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) return new RedisStore(url, token);
  if (url || token) throw new Error('Both Redis URL and token must be configured');
  return null; // Default: per-instance memory, including on Vercel.
}

export async function sharedSnapshot<T extends { at: number }>(
  store: SharedStore,
  key: string,
  refresh: (previous: T | null, reserveAnalysis: () => Promise<boolean>) => Promise<T>,
): Promise<T> {
  const previous = await store.get<T>(key);
  if (previous && Date.now() - previous.at < 12_000) return previous;
  const owner = randomUUID();
  if (!await store.claim(key + ':lock', owner, 40)) {
    if (previous) return previous;
    throw new Error('Shared snapshot is warming up');
  }
  try {
    // Another worker may have published between our first read and lock acquisition.
    const latest = await store.get<T>(key);
    if (latest && Date.now() - latest.at < 12_000) return latest;
    const result = await refresh(latest, () => store.claim(key + ':ai-cooldown', randomUUID(), 60));
    if (!await store.publish(key, owner, result)) throw new Error('Shared cache lease expired');
    return result;
  } finally {
    await store.release(key, owner);
  }
}
