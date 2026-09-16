import { test, expect } from '@playwright/test';

function fixture() {
  const at = Date.now();
  return {
    at, nextAnalysisAt: at + 60_000, analysisError: null, source: 'Coinbase Exchange · USD',
    coins: ['BTC', 'ETH', 'XRP'].map((symbol, index) => ({
      symbol, price: [75000, 2300, 1.27][index], priceTime: at, change: 0.34, error: null,
      sampleError: null,
      samples: Array.from({ length: 12 }, (_, i) => ({ time: at - (12 - i) * 5000, close: [75000, 2300, 1.27][index]! * (1 + Math.sin(i) * 0.001), open: 1, low: 1, high: 2, volume: 10, trades: 3 })),
      candles: Array.from({ length: 60 }, (_, i) => ({ time: at - (60 - i) * 60_000, close: [75000, 2300, 1.27][index]! * (1 + Math.sin(i) * 0.001), open: 1, low: 1, high: 2, volume: 10 })),
    })),
    analysis: { at, model: 'test-model', elapsedMs: 220, prices: { BTC: 75000, ETH: 2300, XRP: 1.27 }, tokens: 500,
      decisions: Object.fromEntries(['BTC', 'ETH', 'XRP'].map((symbol, i) => [symbol, { action: i ? 'wait' : 'buy', confidence: .82, probabilities: { buy: .82, wait: .18 }, reason: 'Recent closes show sustained upward momentum.' }])) },
  };
}
test('live cards, diary, controls, notes, and mobile layout', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/market', route => route.fulfill({ json: fixture() }));
  await page.goto('/');
  await expect(page.locator('#coin-BTC .price')).toHaveText('$75,000.00');
  await expect(page.locator('.diary-row')).toHaveCount(3);
  await expect(page.locator('#coin-BTC .decision-badge')).toHaveText('↗ Buy (demo)');
  await page.getByRole('button', { name: '1h', exact: true }).click();
  await expect(page.getByRole('button', { name: '1h', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.locator('#feed-state')).toContainText('Paused');
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('#feed-state')).toContainText('Live prices');
  await page.locator('#coin-BTC .inspect').click();
  await expect(page.getByRole('dialog')).toContainText('test-model');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Read the experiment notes' }).click();
  await expect(page.getByRole('dialog')).toContainText('not a calibrated probability');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.coin-card')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('stale AI and failed prices never present an active buy signal', async ({ page }) => {
  const data = fixture(); data.analysis.at = Date.now() - 150_000;
  await page.route('**/api/market', route => route.fulfill({ json: data }));
  await page.goto('/');
  await expect(page.locator('#coin-BTC .decision-badge')).toHaveText('Unavailable');
  await expect(page.locator('#coin-BTC .confidence-row strong')).toHaveText('—');
  await expect(page.locator('.diary-row')).toHaveCount(0);
});

test('network failures show an honest error and retry notice', async ({ page }) => {
  await page.route('**/api/market', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.goto('/');
  await expect(page.locator('#notice')).toContainText('Retrying in 15 seconds');
  await expect(page.locator('#feed-state')).toContainText('Reconnecting');
  await expect(page.locator('#coin-BTC .decision-badge')).toHaveText('Unavailable');
});

test('each JSON toggle uses existing data without extra API requests', async ({ page }) => {
  await page.clock.install();
  let requests = 0;
  await page.route('**/api/market', route => { requests++; return route.fulfill({ json: fixture() }); });
  await page.goto('/');
  await expect(page.locator('#coin-BTC .price')).toHaveText('$75,000.00');
  await page.getByRole('button', { name: 'Pause' }).click();
  for (const symbol of ['BTC', 'ETH', 'XRP']) {
    const card = page.locator('#coin-' + symbol);
    await card.locator('summary').click();
    await expect(card.locator('.json-code')).toBeVisible();
    const json = JSON.parse(await card.locator('.json-code').innerText());
    expect(json.symbol).toBe(symbol);
    expect(json.model).toBe('test-model');
    expect(json.request.totalTokens).toBe(500);
    expect(json).not.toHaveProperty('apiKey');
    await card.locator('summary').click();
    await expect(card.locator('.json-code')).toBeHidden();
  }
  expect(requests).toBe(1);
  await page.locator('#coin-BTC summary').click();
  await page.clock.fastForward(110_000);
  const stale = JSON.parse(await page.locator('#coin-BTC .json-code').innerText());
  expect(stale.available).toBe(false);
  expect(requests).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('polling refreshes prices, deduplicates the diary, and stops while paused', async ({ page }) => {
  await page.clock.install();
  let requests = 0;
  const data = fixture();
  await page.route('**/api/market', route => { requests++; return route.fulfill({ json: data }); });
  await page.goto('/');
  await expect(page.locator('.diary-row')).toHaveCount(3);
  await page.clock.fastForward(16_000);
  await expect.poll(() => requests).toBe(2);
  await expect(page.locator('.diary-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.clock.fastForward(65_000);
  expect(requests).toBe(2);
  data.at = Date.now(); data.analysis.at = data.at + 1000;
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect.poll(() => requests).toBe(3);
  await expect(page.locator('.diary-row')).toHaveCount(6);
});
