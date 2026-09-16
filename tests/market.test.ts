import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCandles, getSnapshot } from '../lib/market.ts';

const now = Date.now();
const minute = Math.floor(now / 60_000) * 60;
const candles = Array.from({ length: 60 }, (_, i) => [minute - (i + 1) * 60, 99, 102, 100, 101, 10]);

test('history excludes incomplete candles, sorts timestamps, and rejects stale or insufficient data', () => {
  const result = parseCandles([[minute, 99, 102, 100, 101, 10], ...candles, candles[0]], now);
  assert.equal(result.length, 60);
  assert.equal(result[0]?.time, (minute - 3600) * 1000);
  assert.equal(result.at(-1)?.time, (minute - 60) * 1000);
  assert.throws(() => parseCandles(candles.slice(0, 3), now));
  assert.throws(() => parseCandles(candles, now + 10 * 60_000));
  assert.throws(() => parseCandles({ error: 'unavailable' }, now));
});

test('concurrent visitors share one request; a failed coin is excluded from AI input', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = 'test-key-not-real';
  let inferenceCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('api.exchange.coinbase.com')) {
      if (url.includes('XRP')) return new Response('{}', { status: 503 });
      if (url.includes('/trades')) return Response.json(Array.from({ length: 31 }, (_, i) => ({ trade_id: i, price: '101', size: '0.1', time: new Date(Date.now() - i * 2000).toISOString() })));
      return Response.json(url.includes('candles') ? candles : { price: '101.50', time: new Date().toISOString() });
    }
    inferenceCalls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.state.assets.length, 2);
    assert.equal(body.questions.XRP, undefined);
    assert.equal(body.state.lookback_seconds, 60);
    assert.equal(body.state.sample_interval_seconds, 5);
    assert.ok(body.state.assets[0].samples.length >= 8);
    assert.equal(body.state.assets[0].candles, undefined);
    const answers = Object.fromEntries(['BTC', 'ETH'].flatMap(symbol => [
      [symbol, { type: 'choice', choice: 'wait', confidence: 0.8, probabilities: { buy: 0.2, wait: 0.8 } }],
      [symbol + '_reason', { type: 'choice', choice: 'mixed_signals', confidence: 0.8, probabilities: { mixed_signals: 0.8 } }],
    ]));
    return Response.json({ model: 'test-model', answers, usage: { input_tokens: 100, output_tokens: 50 } });
  };
  try {
    const [a, b] = await Promise.all([getSnapshot(), getSnapshot()]);
    assert.equal(a, b);
    assert.equal(inferenceCalls, 1);
    assert.equal(a.coins.find(c => c.symbol === 'XRP')?.error?.includes('unavailable'), true);
    assert.equal(a.analysis?.decisions.BTC?.action, 'wait');
    assert.equal(a.analysis?.decisions.XRP, undefined);
    await getSnapshot();
    assert.equal(inferenceCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = originalKey;
  }
});
