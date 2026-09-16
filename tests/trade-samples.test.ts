import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleTrades } from '../lib/trade-samples.ts';

test('aggregates the past 60 seconds into five-second samples without inventing prices', () => {
  const now = Date.now();
  const trades = Array.from({ length: 61 }, (_, i) => ({ trade_id: i, time: new Date(now - i * 1000).toISOString(), price: String(100 + i), size: '2' }));
  const result = sampleTrades([...trades, trades[0]], now);
  assert.equal(result.length, 12);
  assert.equal(result[0]?.open, 160);
  assert.equal(result.at(-1)?.close, 100);
  assert.equal(result.reduce((n, s) => n + s.trades, 0), 61);
  assert.equal(result.reduce((n, s) => n + s.volume, 0), 122);
  assert.ok(result.every(s => s.time >= now - 60_000));
  assert.throws(() => sampleTrades(trades.slice(0, 20), now), /Incomplete/);
  assert.throws(() => sampleTrades(trades, now + 90_000), /stale/);
});
