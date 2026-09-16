# Probably

Live BTC, ETH, and XRP prices with a shared TypeSafe buy/wait demonstration. No trades are placed. Not financial advice.

## Run locally

Requires Node.js 22.6+ (24+ recommended).

```sh
npm install
# Set TYPESAFE_API_KEY in .env.
npm start
```

Open http://localhost:3000. All API credentials remain server-side.

## Real-time input

Prices refresh approximately every 15 seconds. Each coin's last 60 seconds of actual Coinbase trades are aggregated into up to 12 five-second OHLC/volume samples. The AI considers a hypothetical entry for the next 60 seconds. It does not predict returns.

The trades endpoint supplies the latest 1,000 trades. If that page does not cover the window, is stale, or contains too few populated buckets, the app withholds that coin's AI signal. It does not fabricate samples. Longer chart ranges use historical one-minute candles.

One inference request covers all available coins, at most once per 60 seconds for each shared cache namespace/model. This is polled near-real-time data, not a streaming execution system.

Each card's JSON toggle shows already-fetched results, exact analysis samples, timestamps, confidence, and the total token count for the shared request. Toggling does not make network requests or use extra tokens.

## Shared server cache on Vercel

Connect an Upstash Redis database to the Vercel project and configure these server-only variables:

- TYPESAFE_API_KEY
- UPSTASH_REDIS_REST_URL
- UPSTASH_REDIS_REST_TOKEN
- CACHE_NAMESPACE (optional; use separate values for preview and production)

KV_REST_API_URL and KV_REST_API_TOKEN are also supported.

All instances must use the same Redis database and namespace to share results. Redis stores the snapshot for 10 minutes with a 12-second freshness window. One worker holds a refresh lease; other visitors receive the saved snapshot. A separate atomic 60-second inference cooldown is reserved before calling TypeSafe, including when inference fails. A worker can publish only while it owns the lease.

If Redis is unavailable, the server does not fall back to independent paid AI calls. Vercel refuses inference without Redis configuration. Local development without Redis uses the original single-process shared memory cache; that is not a distributed cache.

Requests trigger refreshes; there is no paid background loop with no visitors. Pause stops only this browser's polling, not other visitors. Viewing JSON is free of extra inference. Shared caching reduces duplicate usage but does not impose a total token or spending budget.

Redis credentials have not yet been configured or live-verified. Distributed behavior is covered by mocked concurrency and failure tests.

## Deploy

The project has a static frontend in public/, a function at api/market.ts, and vercel.json. Import into Vercel using the Other framework preset, connect Redis, set the server variables, and deploy. No deployment has been performed.

## Checks

```sh
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

Automated tests mock providers and do not consume TypeSafe tokens.

## Sources

- [TypeSafe SDK](https://github.com/typesafe-ai/typesafe-sdk-js)
- [Coinbase trades](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-trades)
- [Upstash REST API](https://upstash.com/docs/redis/features/restapi)
- Coin logos: [cryptocurrency-icons](https://github.com/spothq/cryptocurrency-icons), CC0.
- Family Medium from family.co and Inter from Google Fonts. Confirm licensing for the Family brand font before publishing.

The original ticket example remains in triage.ts but is not exposed by this app.
