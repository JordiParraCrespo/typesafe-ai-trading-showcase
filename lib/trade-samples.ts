export type TradeSample = { time: number; open: number; high: number; low: number; close: number; volume: number; trades: number };
export function sampleTrades(raw: unknown, now = Date.now()): TradeSample[] {
  if (!Array.isArray(raw)) throw new Error('Invalid trades');
  const start = now - 60_000;
  const trades = [...new Map(raw.filter(t => t && Number.isFinite(t.trade_id)).map(t => [t.trade_id, {
    time: Date.parse(t.time), price: Number(t.price), size: Number(t.size),
  }])).values()].filter(t => Number.isFinite(t.time) && t.time <= now && Number.isFinite(t.price) && t.price > 0 && Number.isFinite(t.size) && t.size >= 0).sort((a, b) => a.time - b.time);
  // A single recent page may cover less than a minute in very busy markets.
  // Do not present that truncated page as a complete 60-second input.
  if (!trades.length || trades[0]!.time > start + 5000 || now - trades.at(-1)!.time > 15_000) throw new Error('Incomplete or stale trade window');
  const buckets = new Map<number, TradeSample>();
  for (const trade of trades.filter(t => t.time >= start)) {
    const time = start + Math.min(11, Math.floor((trade.time - start) / 5000)) * 5000;
    const bucket = buckets.get(time);
    if (bucket) { bucket.high = Math.max(bucket.high, trade.price); bucket.low = Math.min(bucket.low, trade.price); bucket.close = trade.price; bucket.volume += trade.size; bucket.trades++; }
    else buckets.set(time, { time, open: trade.price, high: trade.price, low: trade.price, close: trade.price, volume: trade.size, trades: 1 });
  }
  if (buckets.size < 8) throw new Error('Too few recent trade samples');
  return [...buckets.values()];
}
