import { choice, TypeSafeClient, type Questions } from '@typesafe-ai/sdk';
import { sharedSnapshot, sharedStore } from './shared-cache.ts';
import { sampleTrades, type TradeSample } from './trade-samples.ts';

export const SYMBOLS = ['BTC', 'ETH', 'XRP'] as const;
export type Symbol = typeof SYMBOLS[number];
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type Coin = { symbol: Symbol; price: number; priceTime: number; candles: Candle[]; samples: TradeSample[]; sampleError: string | null; change: number; error: string | null };
export type Decision = { action: 'buy' | 'wait'; confidence: number; probabilities: Record<string, number>; reason: string };
export type Analysis = { at: number; model: string; elapsedMs: number; decisions: Partial<Record<Symbol, Decision>>; prices: Partial<Record<Symbol, number>>; inputs: Partial<Record<Symbol, TradeSample[]>>; tokens: number };
export type Snapshot = { at: number; coins: Coin[]; analysis: Analysis | null; analysisError: string | null; nextAnalysisAt: number; source: string };
const reasons = {
  upward_momentum: 'Recent closes show sustained upward momentum.',
  downward_momentum: 'Recent closes show downward momentum.',
  mixed_signals: 'The recent price direction is mixed or flat.',
  high_volatility: 'The recent price range is unusually volatile.',
  weak_evidence: 'There is not enough evidence for a clear entry.',
};
const historyCache = new Map<Symbol, { at: number; candles: Candle[] }>();
let cached: Snapshot | undefined;
let pending: Promise<Snapshot> | undefined;
let lastAnalysis: Analysis | null = null;
let lastAnalysisAttempt = 0;
let analysisError: string | null = null;

async function coinbase(path: string): Promise<unknown> {
  const response = await fetch(`https://api.exchange.coinbase.com/products/${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Probably-Demo/1.0' }, signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error('Price source unavailable');
  return response.json();
}
export function parseCandles(raw: unknown, now = Date.now()): Candle[] {
  if (!Array.isArray(raw)) throw new Error('Invalid candle data');
  const minute = Math.floor(now / 60_000) * 60;
  const candles = raw.filter((r): r is number[] => Array.isArray(r) && r.length >= 6 && r.slice(0, 6).every(Number.isFinite))
    .filter(r => r[0]! < minute && r[0]! >= minute - 60 * 60 && r.slice(1, 5).every(v => v > 0) && r[5]! >= 0)
    .map(r => ({ time: r[0]! * 1000, low: r[1]!, high: r[2]!, open: r[3]!, close: r[4]!, volume: r[5]! }))
    .sort((a, b) => a.time - b.time);
  const unique = [...new Map(candles.map(c => [c.time, c])).values()];
  if (unique.length < 10 || now - unique.at(-1)!.time > 5 * 60_000) throw new Error('Insufficient recent candles');
  return unique;
}
async function getCoin(symbol: Symbol): Promise<Coin> {
  try {
    const old = historyCache.get(symbol);
    const end = Math.floor(Date.now() / 60_000) * 60_000;
    const window = new URLSearchParams({ granularity: '60', start: new Date(end - 60 * 60_000).toISOString(), end: new Date(end).toISOString() });
    const [rawTicker, candles, tradeWindow] = await Promise.all([
      coinbase(`${symbol}-USD/ticker`),
      old && Date.now() - old.at < 60_000 ? old.candles : coinbase(`${symbol}-USD/candles?${window}`).then(raw => {
        const candles = parseCandles(raw); historyCache.set(symbol, { at: Date.now(), candles }); return candles;
      }),
      coinbase(`${symbol}-USD/trades?limit=1000`).then(raw => ({ samples: sampleTrades(raw), sampleError: null })).catch(() => ({ samples: [], sampleError: 'A full, fresh minute of trades is not available yet.' })),
    ]);
    const ticker = rawTicker as { price?: string; time?: string };
    const price = Number(ticker.price); const priceTime = Date.parse(ticker.time || '');
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(priceTime) || Date.now() - priceTime > 120_000 || priceTime > Date.now() + 60_000) throw new Error('Stale ticker');
    const base = candles.filter(c => c.time >= Date.now() - 15 * 60_000)[0];
    if (!base) throw new Error('Missing history');
    return { symbol, price, priceTime, candles, ...tradeWindow, change: (price / base.close - 1) * 100, error: null };
  } catch {
    return { symbol, price: 0, priceTime: 0, candles: [], samples: [], sampleError: 'Trade data unavailable.', change: 0, error: 'Live data unavailable. Retrying shortly.' };
  }
}
async function analyze(coins: Coin[]): Promise<Analysis> {
  const valid = coins.filter(c => !c.error && !c.sampleError);
  if (!valid.length) throw new Error('No fresh market data');
  const questions: Questions = {};
  for (const coin of valid) {
    questions[coin.symbol] = choice(`For ${coin.symbol} only, choose a hypothetical action for the next 60 seconds using only the last 60 seconds of trades aggregated into five-second samples. This is an unvalidated educational simulation. Buy only if there is sustained upward momentum with relatively contained volatility; otherwise wait. Consider missing samples. Do not infer news, future returns, or fundamentals.`, {
      buy: 'A speculative paper entry is supported by sustained recent upward momentum.',
      wait: 'No paper entry: mixed, negative, volatile, or insufficient evidence.',
    });
    questions[`${coin.symbol}_reason`] = choice(`Which single observation best explains your hypothetical decision for ${coin.symbol}? Use only its supplied price history.`, reasons);
  }
  const start = performance.now();
  const client = new TypeSafeClient({ timeout: 18_000, retry: { maxRetries: 0 }, logLevel: 'off' });
  const result = await client.systemOne({ state: { purpose: 'Educational paper signals, no real orders.', quote_currency: 'USD', lookback_seconds: 60, sample_interval_seconds: 5, observed_at: new Date().toISOString(), assets: valid.map(c => ({ symbol: c.symbol, price: c.price, price_time: c.priceTime, samples: c.samples })) }, questions });
  const decisions: Analysis['decisions'] = {};
  for (const coin of valid) {
    const a = result.answers[coin.symbol]; const reason = result.answers[`${coin.symbol}_reason`];
    if (a?.type !== 'choice' || !['buy', 'wait'].includes(a.choice) || !Number.isFinite(a.confidence) || a.confidence < 0 || a.confidence > 1 || reason?.type !== 'choice' || !(reason.choice in reasons)) throw new Error('Invalid model response');
    if (!a.probabilities || !['buy', 'wait'].every(k => Number.isFinite(a.probabilities[k]) && a.probabilities[k]! >= 0 && a.probabilities[k]! <= 1)) throw new Error('Invalid probabilities');
    decisions[coin.symbol] = { action: a.choice as 'buy' | 'wait', confidence: a.confidence, probabilities: a.probabilities, reason: reasons[reason.choice as keyof typeof reasons] };
  }
  return { at: Date.now(), model: result.model, elapsedMs: Math.round(performance.now() - start), decisions, prices: Object.fromEntries(valid.map(c => [c.symbol, c.price])), inputs: Object.fromEntries(valid.map(c => [c.symbol, c.samples])), tokens: result.usage.input_tokens + result.usage.output_tokens };
}
async function refresh(previous?: Snapshot | null, reserveAnalysis = async () => true): Promise<Snapshot> {
  if (previous !== undefined) {
    lastAnalysis = previous?.analysis ?? null;
    lastAnalysisAttempt = previous ? previous.nextAnalysisAt - 60_000 : 0;
    analysisError = previous?.analysisError ?? null;
  }
  const coins = await Promise.all(SYMBOLS.map(getCoin));
  if (Date.now() - lastAnalysisAttempt >= 60_000) {
    lastAnalysisAttempt = Date.now();
    // Reserve the global cooldown before spending tokens. Cache failures never
    // fall back to independent paid inference on each server.
    if (await reserveAnalysis()) {
      try { lastAnalysis = await analyze(coins); analysisError = null; }
      catch { analysisError = process.env.TYPESAFE_API_KEY ? 'The AI is taking a breather. We’ll retry next minute.' : 'Add TYPESAFE_API_KEY to enable AI decisions.'; }
    } else if (!lastAnalysis) analysisError = 'The shared AI result is refreshing. Please wait.';
  }
  cached = { at: Date.now(), coins, analysis: lastAnalysis, analysisError, nextAnalysisAt: lastAnalysisAttempt + 60_000, source: 'Coinbase Exchange · USD' };
  return cached;
}
export function getSnapshot(): Promise<Snapshot> {
  const store = sharedStore();
  if (store) {
    const key = (process.env.CACHE_NAMESPACE || 'probably') + ':60s-v2:' + (process.env.TYPESAFE_DEFAULT_MODEL || 'jev-latest');
    if (!pending) pending = sharedSnapshot<Snapshot>(store, key, refresh).finally(() => { pending = undefined; });
    return pending;
  }
  if (cached && Date.now() - cached.at < 12_000) return Promise.resolve(cached);
  if (!pending) pending = refresh().finally(() => { pending = undefined; });
  return pending;
}
