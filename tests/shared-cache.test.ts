import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedSnapshot, sharedStore, type SharedStore } from '../lib/shared-cache.ts';

class MemoryRedis implements SharedStore {
  values = new Map<string, unknown>();
  leases = new Map<string, string>();
  async get<T>(key: string) { return (this.values.get(key) as T) ?? null; }
  async set(key: string, value: unknown) { this.values.set(key, value); }
  async claim(key: string, owner: string) {
    if (this.leases.has(key)) return false;
    this.leases.set(key, owner); return true;
  }
  async publish(key: string, owner: string, value: unknown) {
    if (this.leases.get(key + ':lock') !== owner) return false;
    this.values.set(key, value); this.leases.delete(key + ':lock'); return true;
  }
  async release(key: string, owner: string) {
    if (this.leases.get(key + ':lock') === owner) this.leases.delete(key + ':lock');
  }
}

test('independent workers share one refresh and serve the same saved result', async () => {
  const store = new MemoryRedis();
  const previous = { at: Date.now() - 20_000, decision: 'wait' };
  store.values.set('market', previous);
  let finish!: () => void;
  const ready = new Promise<void>(r => { finish = r; });
  let calls = 0;
  const work = async (_old: unknown, reserve: () => Promise<boolean>) => {
    calls++; assert.equal(await reserve(), true);
    await ready; return { at: Date.now(), decision: 'buy' };
  };
  const first = sharedSnapshot(store, 'market', work);
  await new Promise(r => setImmediate(r));
  const second = await sharedSnapshot(store, 'market', work);
  assert.deepEqual(second, previous);
  assert.equal(calls, 1);
  finish(); const result = await first;
  assert.deepEqual(await sharedSnapshot(store, 'market', work), result);
  assert.equal(calls, 1);
});

test('AI cooldown survives a crashed refresh, avoiding another paid request', async () => {
  const store = new MemoryRedis();
  await assert.rejects(sharedSnapshot(store, 'market', async (_old, reserve) => {
    assert.equal(await reserve(), true);
    throw new Error('worker failed after inference');
  }));
  await sharedSnapshot(store, 'market', async (_old, reserve) => {
    assert.equal(await reserve(), false);
    return { at: Date.now() };
  });
});

test('cache failure fails closed without calling the refresh function', async () => {
  const store = new MemoryRedis();
  store.get = async () => { throw new Error('Redis offline'); };
  let calls = 0;
  await assert.rejects(sharedSnapshot(store, 'market', async () => { calls++; return { at: Date.now() }; }));
  assert.equal(calls, 0);
});

test('an expired lease cannot publish over another worker', async () => {
  const store = new MemoryRedis();
  await assert.rejects(sharedSnapshot(store, 'market', async () => {
    store.leases.set('market:lock', 'new-owner');
    return { at: Date.now() };
  }), /lease expired/);
  assert.equal(store.leases.get('market:lock'), 'new-owner');
  assert.equal(store.values.has('market'), false);
});

test('Vercel requires shared cache configuration', () => {
  const names = ['VERCEL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN'];
  const original = names.map(name => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    process.env.VERCEL = '1';
    assert.throws(() => sharedStore(), /Redis must be configured/);
  } finally {
    names.forEach((name, i) => { if (original[i] === undefined) delete process.env[name]; else process.env[name] = original[i]; });
  }
});
