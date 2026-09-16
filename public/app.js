const $ = id => document.getElementById(id);
// Coin logo artwork: spothq/cryptocurrency-icons (CC0).
const logos = {"BTC":"<svg aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><g fill=\"none\" fill-rule=\"evenodd\"><circle cx=\"16\" cy=\"16\" r=\"16\" fill=\"#F7931A\"/><path fill=\"#FFF\" fill-rule=\"nonzero\" d=\"M23.189 14.02c.314-2.096-1.283-3.223-3.465-3.975l.708-2.84-1.728-.43-.69 2.765c-.454-.114-.92-.22-1.385-.326l.695-2.783L15.596 6l-.708 2.839c-.376-.086-.746-.17-1.104-.26l.002-.009-2.384-.595-.46 1.846s1.283.294 1.256.312c.7.175.826.638.805 1.006l-.806 3.235c.048.012.11.03.18.057l-.183-.045-1.13 4.532c-.086.212-.303.531-.793.41.018.025-1.256-.313-1.256-.313l-.858 1.978 2.25.561c.418.105.828.215 1.231.318l-.715 2.872 1.727.43.708-2.84c.472.127.93.245 1.378.357l-.706 2.828 1.728.43.715-2.866c2.948.558 5.164.333 6.097-2.333.752-2.146-.037-3.385-1.588-4.192 1.13-.26 1.98-1.003 2.207-2.538zm-3.95 5.538c-.533 2.147-4.148.986-5.32.695l.95-3.805c1.172.293 4.929.872 4.37 3.11zm.535-5.569c-.487 1.953-3.495.96-4.47.717l.86-3.45c.975.243 4.118.696 3.61 2.733z\"/></g></svg>","ETH":"<svg aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><g fill=\"none\" fill-rule=\"evenodd\"><circle cx=\"16\" cy=\"16\" r=\"16\" fill=\"#627EEA\"/><g fill=\"#FFF\" fill-rule=\"nonzero\"><path fill-opacity=\".602\" d=\"M16.498 4v8.87l7.497 3.35z\"/><path d=\"M16.498 4L9 16.22l7.498-3.35z\"/><path fill-opacity=\".602\" d=\"M16.498 21.968v6.027L24 17.616z\"/><path d=\"M16.498 27.995v-6.028L9 17.616z\"/><path fill-opacity=\".2\" d=\"M16.498 20.573l7.497-4.353-7.497-3.348z\"/><path fill-opacity=\".602\" d=\"M9 16.22l7.498 4.353v-7.701z\"/></g></g></svg>","XRP":"<svg aria-hidden=\"true\" width=\"32\" height=\"32\" viewBox=\"0 0 32 32\" xmlns=\"http://www.w3.org/2000/svg\"><g fill=\"none\"><circle cx=\"16\" cy=\"16\" r=\"16\" fill=\"#23292F\"/><path d=\"M23.07 8h2.89l-6.015 5.957a5.621 5.621 0 01-7.89 0L6.035 8H8.93l4.57 4.523a3.556 3.556 0 004.996 0L23.07 8zM8.895 24.563H6l6.055-5.993a5.621 5.621 0 017.89 0L26 24.562h-2.895L18.5 20a3.556 3.556 0 00-4.996 0l-4.61 4.563z\" fill=\"#FFF\"/></g></svg>"};
const meta = { BTC: { name: 'Bitcoin', color: '#dda032' }, ETH: { name: 'Ethereum', color: '#9b83dc' }, XRP: { name: 'XRP', color: '#49a4d4' } };
let snapshot = null, paused = false, inflight = false, range = 1, pollTimer, lastDiaryAt = 0, failed = false;
const diary = [];
const usd = (value, symbol) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: symbol === 'XRP' ? 4 : 2, maximumFractionDigits: symbol === 'XRP' ? 4 : 2 }).format(value);
const time = stamp => new Date(stamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const age = stamp => Math.max(0, Math.floor((Date.now() - stamp) / 1000));
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
for (const [symbol, info] of Object.entries(meta)) {
  const card = el('article', 'coin-card ' + symbol); card.id = 'coin-' + symbol;
  // Only static app-controlled values are interpolated into the card scaffold.
  card.innerHTML = `<div class="coin-top"><div class="coin-identity"><span class="coin-icon">${logos[symbol]}</span><div><div class="coin-name">${info.name}</div><div class="coin-ticker">${symbol} / USD</div></div></div></div><div class="price">— <small>USD</small></div><div class="price-change">Loading the latest price…</div><div class="chart-wrap"><svg class="chart" viewBox="0 0 320 110" preserveAspectRatio="none" role="img" aria-label="${info.name} recent prices"></svg><span class="chart-empty">Waiting for live prices</span></div><div class="chart-labels"><span>15 minutes ago</span><span>Now</span></div><div class="decision"><div class="decision-top"><span class="ai-label">AI SAYS</span><span class="decision-badge">Thinking…</span></div><div class="confidence-row"><span>AI confidence</span><strong>—</strong></div><div class="confidence-track"><div class="confidence-fill"></div></div><p class="decision-reason">AI is checking recent prices.</p></div><div class="card-footer"><span class="thought-age">Waiting for AI</span><button class="inspect">Why? ↗</button></div>`;
  card.querySelector('.inspect').addEventListener('click', () => showDetails(symbol));
  const samplesPanel = el('section', 'samples-panel');
  samplesPanel.setAttribute('aria-label', info.name + ' five-second samples');
  samplesPanel.append(el('div', 'samples-heading', 'LAST MINUTE · 5-SECOND SAMPLES'), el('div', 'sample-readout', 'Waiting for trades…'), el('div', 'sample-grid'));
  card.querySelector('.chart-labels').after(samplesPanel);
  const details = el('details', 'card-json');
  const summary = el('summary', '', 'View JSON');
  summary.setAttribute('aria-label', 'View ' + info.name + ' JSON');
  const note = el('p', 'json-note', 'Already-loaded data. Opening this uses no extra AI tokens.');
  const code = el('pre', 'json-code');
  details.append(summary, note, code);
  summary.addEventListener('click', () => updateCardJson(symbol));
  details.addEventListener('toggle', () => {
    summary.textContent = details.open ? 'Hide JSON' : 'View JSON';
    summary.setAttribute('aria-label', (details.open ? 'Hide ' : 'View ') + info.name + ' JSON');
    if (details.open) updateCardJson(symbol);
  });
  card.append(details);
  $('coins').append(card);
}
function updateCardJson(symbol) {
  const coin = snapshot?.coins.find(c => c.symbol === symbol);
  const analysis = snapshot?.analysis;
  const decision = analysis?.decisions[symbol];
  // Explicit response fields only. Credentials never reach the browser.
  const data = {
    symbol,
    available: Boolean(decision && !staleSignal(symbol)),
    price: coin && !coin.error ? coin.price : null,
    currency: 'USD',
    priceAt: coin?.priceTime ? new Date(coin.priceTime).toISOString() : null,
    analyzedAt: analysis ? new Date(analysis.at).toISOString() : null,
    model: analysis?.model ?? null,
    priceAtAnalysis: analysis?.prices[symbol] ?? null,
    decision: decision ?? null,
    input: { lookbackSeconds: 60, sampleIntervalSeconds: 5, samples: analysis?.inputs?.[symbol] ?? [] },
    request: analysis ? { elapsedMs: analysis.elapsedMs, totalTokens: analysis.tokens, tokenScope: 'Shared request for all analyzed coins' } : null,
    error: coin?.error || coin?.sampleError || snapshot?.analysisError || (failed ? 'Feed unavailable' : null),
  };
  $('coin-' + symbol).querySelector('.json-code').textContent = JSON.stringify(data, null, 2);
}
function svgNode(tag, attrs) { const node = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value)); return node; }
function drawChart(card, coin) {
  const svg = card.querySelector('.chart'); svg.replaceChildren();
  // Match the viewBox to CSS pixels so circles and text never stretch.
  const width = Math.max(240, svg.getBoundingClientRect().width), height = 220;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'group');
  const panel = card.querySelector('.samples-panel'); panel.hidden = range !== 1;
  const grid = panel.querySelector('.sample-grid'); grid.replaceChildren();
  const readout = panel.querySelector('.sample-readout');
  const samples = coin.samples || [];
  panel.querySelector('.samples-heading').textContent = `5-SECOND SAMPLES · ${samples.length} OF 12 AVAILABLE`;
  readout.textContent = 'Waiting for a fresh sample window.';
  const observedAt = snapshot?.at || Date.now();
  const series = range === 1 ? samples : coin.candles;
  const points = series.filter(c => range === 1 || c.time >= observedAt - range * 60_000).map(c => ({ time: c.time, price: c.close, sample: c }));
  if (!coin.error && range !== 1) points.push({ time: coin.priceTime, price: coin.price, sample: null });
  points.sort((a, b) => a.time - b.time);
  if (points.length < 2) { card.querySelector('.chart-empty').hidden = false; return; }
  card.querySelector('.chart-empty').hidden = true;
  const color = meta[coin.symbol].color;
  const low = Math.min(...points.map(p => p.price)), high = Math.max(...points.map(p => p.price));
  const spread = high - low || high * 0.0001;
  const min = low - spread * .15, max = high + spread * .15;
  const left = 6, right = width - 66, top = 15, bottom = 153;
  const start = range === 1 ? points[0].time : observedAt - range * 60_000, end = range === 1 ? start + 60_000 : observedAt;
  const xy = points.map(p => [left + Math.max(0, Math.min(1, (p.time - start) / (end - start))) * (right - left), bottom - (p.price - min) / (max - min) * (bottom - top)]);
  const priceLabel = value => value.toLocaleString('en-US', { minimumFractionDigits: coin.symbol === 'XRP' ? 4 : 2, maximumFractionDigits: coin.symbol === 'XRP' ? 4 : 2 });
  for (const fraction of [0, .5, 1]) {
    const y = top + fraction * (bottom - top);
    svg.append(svgNode('line', { x1: left, x2: right, y1: y, y2: y, stroke: '#eae7e2', 'stroke-dasharray': '3 5' }));
    const label = svgNode('text', { x: width - 1, y: y + 3, 'text-anchor': 'end', fill: '#7e7e7d', 'font-size': 9, 'font-family': 'Inter, sans-serif' });
    label.textContent = priceLabel(max - fraction * (max - min)); svg.append(label);
  }
  const path = xy.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(2) + ',' + y.toFixed(2)).join(' ');
  svg.append(svgNode('path', { d: path + ` L${xy.at(-1)[0]},${bottom} L${xy[0][0]},${bottom} Z`, fill: color, opacity: '.045' }));
  svg.append(svgNode('path', { d: path, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  const exactTime = stamp => new Date(stamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const volumes = points.map(p => p.sample?.volume || 0), peak = Math.max(...volumes, .000001);
  if (range === 1) {
    xy.forEach(([x], i) => svg.append(svgNode('rect', { x: x - 3, y: 188 - volumes[i] / peak * 20, width: 6, height: volumes[i] / peak * 20, rx: 1.5, fill: color, opacity: '.24' })));
  }
  for (const fraction of [0, .5, 1]) {
    const label = svgNode('text', { x: left + fraction * (right - left), y: 211, 'text-anchor': fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle', fill: '#7e7e7d', 'font-size': 9, 'font-family': 'Inter, sans-serif' });
    label.textContent = range === 1 ? exactTime(start + fraction * 60_000) : time(start + fraction * (end - start)); svg.append(label);
  }
  if (range === 1) {
    const guide = svgNode('line', { x1: 0, x2: 0, y1: top, y2: 190, stroke: color, 'stroke-dasharray': '2 4', opacity: '.5' }); svg.append(guide);
    const halo = svgNode('circle', { cx: 0, cy: 0, r: 9, fill: color, opacity: '.13' }); svg.append(halo);
    const dots = xy.map(([x, y]) => {
      const dot = svgNode('circle', { cx: x, cy: y, r: 3, fill: color, stroke: 'white', 'stroke-width': 1.5 }); svg.append(dot); return dot;
    });
    const select = i => {
      card.dataset.selectedSample = String(i);
      grid.querySelectorAll('button').forEach((button, n) => button.setAttribute('aria-pressed', String(n === i)));
      dots.forEach((dot, n) => dot.setAttribute('r', n === i ? '4.5' : '3'));
      const [x, y] = xy[i]; guide.setAttribute('x1', x); guide.setAttribute('x2', x); halo.setAttribute('cx', x); halo.setAttribute('cy', y);
      const point = points[i];
      readout.replaceChildren();
      const price = el('strong', 'selected-sample-price', usd(point.price, coin.symbol));
      const detail = el('span', 'selected-sample-detail', `${exactTime(point.time)}–${exactTime(point.time + 5000)} · ${point.sample.trades} trades`);
      readout.append(price, detail);
      panel.querySelector('.samples-heading').textContent = `SAMPLE ${String(i + 1).padStart(2, '0')} / ${points.length} · 5 SECONDS`;
    };
    points.forEach((point, i) => {
      const label = `${meta[coin.symbol].name} sample at ${exactTime(point.time)}, closing price ${usd(point.price, coin.symbol)}`;
      const button = el('button', 'sample-cell'); button.type = 'button'; button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', 'false');
      button.append(el('span', 'sample-time', exactTime(point.time)), el('strong', 'sample-price', usd(point.price, coin.symbol)));
      for (const event of ['click', 'focus', 'mouseenter']) button.addEventListener(event, () => select(i));
      grid.append(button);
      // Larger invisible hit areas make tiny plotted points easy to tap.
      const hit = svgNode('rect', { x: xy[i][0] - 10, y: top - 5, width: 20, height: 180, fill: 'transparent', tabindex: 0, role: 'button', 'aria-label': label, class: 'sample-hit' });
      for (const event of ['click', 'focus', 'mouseenter']) hit.addEventListener(event, () => select(i));
      hit.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(i); }
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          const index = Math.max(0, Math.min(points.length - 1, i + (event.key === 'ArrowRight' ? 1 : -1)));
          svg.querySelectorAll('.sample-hit')[index].focus();
        }
      });
      svg.append(hit);
    });
    select(Math.min(Number(card.dataset.selectedSample ?? points.length - 1), points.length - 1));
  }
  const labels = card.querySelector('.chart-labels');
  labels.firstElementChild.textContent = range === 1 ? 'Bars show traded volume' : 'Price in USD';
  labels.lastElementChild.textContent = range === 1 ? 'Hover or tap a dot' : 'Historical prices';
}
function staleSignal(symbol) {
  return failed || !snapshot?.analysis || Boolean(snapshot.analysisError) || age(snapshot.analysis.at) > 100 || snapshot.coins.find(c => c.symbol === symbol)?.error || snapshot.coins.find(c => c.symbol === symbol)?.sampleError || !snapshot.analysis.decisions[symbol];
}
function render() {
  if (!snapshot) return;
  for (const coin of snapshot.coins) {
    const card = $('coin-' + coin.symbol);
    card.querySelector('.price').textContent = coin.error ? '—' : usd(coin.price, coin.symbol);
    const change = card.querySelector('.price-change'); change.replaceChildren();
    if (coin.error) change.textContent = coin.error;
    else { change.append(el('span', coin.change >= 0 ? 'up' : 'down', (coin.change >= 0 ? '↗ +' : '↘ ') + coin.change.toFixed(2) + '%'), el('span', 'period', 'past 15m')); }
    drawChart(card, coin);
    const d = snapshot.analysis?.decisions[coin.symbol], invalid = staleSignal(coin.symbol);
    const decision = card.querySelector('.decision'); decision.className = 'decision' + (!invalid && d?.action === 'buy' ? ' buy' : '');
    const badge = card.querySelector('.decision-badge'); badge.className = 'decision-badge' + (!invalid ? ' ' + d.action : '');
    badge.textContent = invalid ? 'Unavailable' : d.action === 'buy' ? '↗ Buy (demo)' : 'Ⅱ Wait';
    card.querySelector('.confidence-row strong').textContent = invalid ? '—' : Math.round(d.confidence * 100) + '%';
    card.querySelector('.confidence-fill').style.width = invalid ? '0%' : Math.round(d.confidence * 100) + '%';
    card.querySelector('.decision-reason').textContent = invalid ? 'No current answer. Waiting for fresh data.' : d.reason;
  }
  updateClocks();
}
function appendDiary(analysis) {
  if (!analysis || analysis.at === lastDiaryAt || snapshot.analysisError || age(analysis.at) > 100) return;
  lastDiaryAt = analysis.at;
  for (const [symbol, d] of Object.entries(analysis.decisions)) diary.unshift({ symbol, ...d, at: analysis.at });
  diary.splice(12);
  $('diary').replaceChildren();
  for (const item of diary) {
    const row = el('div', 'diary-row');
    const when = el('time', '', time(item.at)); when.dateTime = new Date(item.at).toISOString();
    const who = el('span', 'diary-who ' + item.symbol); const icon = el('span', 'tiny-coin'); icon.innerHTML = logos[item.symbol]; who.append(icon, document.createTextNode(item.symbol));
    const thought = el('span', 'diary-thought'); thought.append(el('span', 'decision-badge ' + item.action, item.action === 'buy' ? '↗ Buy (demo)' : 'Ⅱ Wait'), el('span', 'reason', item.reason));
    row.append(when, who, thought, el('span', 'diary-confidence', Math.round(item.confidence * 100) + '%'));
    $('diary').append(row);
  }
}
function updateClocks() {
  const state = $('feed-state');
  const stale = snapshot && age(snapshot.at) > 45;
  const hasError = snapshot?.coins.some(c => c.error);
  state.dataset.state = paused ? 'paused' : failed || stale || hasError ? 'error' : snapshot ? 'live' : 'connecting';
  state.lastChild.textContent = paused ? ' Paused' : failed || stale ? ' Reconnecting' : hasError ? ' Partial feed' : snapshot ? ' Live prices' : ' Connecting';
  $('next-thought').textContent = paused ? 'Updates paused. Press Resume to continue.' : snapshot ? 'AI checks again in ~' + Math.max(0, Math.ceil((snapshot.nextAnalysisAt - Date.now()) / 1000)) + 's' : 'Getting the first AI decisions…';
  for (const symbol of Object.keys(meta)) {
    const card = $('coin-' + symbol);
    if (card.querySelector('.card-json').open) updateCardJson(symbol);
    card.querySelector('.thought-age').textContent = snapshot?.analysis ? 'AI checked ' + age(snapshot.analysis.at) + 's ago' : 'Waiting for AI';
    if (failed || (snapshot && staleSignal(symbol))) {
      card.querySelector('.decision-badge').textContent = 'Unavailable'; card.querySelector('.decision-badge').className = 'decision-badge';
      card.querySelector('.confidence-row strong').textContent = '—'; card.querySelector('.confidence-fill').style.width = '0%';
      card.querySelector('.decision-reason').textContent = 'No current answer. Waiting for fresh data.';
    }
  }
}
async function poll() {
  clearTimeout(pollTimer);
  if (paused || document.hidden || inflight) return;
  inflight = true;
  try {
    const response = await fetch('/api/market', { signal: AbortSignal.timeout(29_000) });
    if (!response.ok) throw new Error('The live feed is unavailable. Retrying in 15 seconds.');
    const data = await response.json();
    if (!Array.isArray(data.coins) || !Number.isFinite(data.at)) throw new Error('Unexpected market response. Retrying shortly.');
    snapshot = data; failed = false;
    $('notice').hidden = !data.analysisError; $('notice').textContent = data.analysisError || ''; $('notice').className = 'notice';
    render(); appendDiary(data.analysis);
  } catch {
    failed = true; $('notice').hidden = false; $('notice').className = 'notice error';
    $('notice').textContent = 'The live feed is unavailable. Displayed prices may be old; AI signals are unavailable. Retrying in 15 seconds.';
    render(); updateClocks();
  } finally { inflight = false; if (!paused && !document.hidden) pollTimer = setTimeout(poll, 15_000); }
}
$('pause').addEventListener('click', () => {
  paused = !paused; $('pause').setAttribute('aria-pressed', String(paused)); $('pause').textContent = paused ? '▶ Resume' : 'Ⅱ Pause';
  clearTimeout(pollTimer); updateClocks(); if (!paused) poll();
});
document.addEventListener('visibilitychange', () => { clearTimeout(pollTimer); if (!document.hidden && !paused) poll(); });
document.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => {
  range = Number(button.dataset.range);
  document.querySelectorAll('[data-range]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  render();
}));
const originalNotes = Array.from($('method').children).slice(1).map(n => n.cloneNode(true));
function restoreNotes() { Array.from($('method').children).slice(1).forEach(n => n.remove()); originalNotes.forEach(n => $('method').append(n.cloneNode(true))); }
function showDetails(symbol) {
  restoreNotes(); Array.from($('method').children).slice(1).forEach(n => n.remove());
  $('method').append(el('div', 'eyebrow', symbol + ' · UNDER THE HOOD'), el('h2', '', 'Why this answer?'));
  const d = snapshot?.analysis?.decisions[symbol];
  $('method').append(el('p', '', 'The model selects a decision and a reason from fixed choices. Confidence is not a probability of profit. Not financial advice.'));
  $('method').append(el('pre', 'detail-json', JSON.stringify(d ? { available: !staleSignal(symbol), analyzedAt: new Date(snapshot.analysis.at).toISOString(), model: snapshot.analysis.model, priceAtAnalysis: snapshot.analysis.prices[symbol], ...d, requestMs: snapshot.analysis.elapsedMs } : { status: 'Awaiting the first successful AI analysis.' }, null, 2)));
  $('method').showModal();
}
$('show-method').addEventListener('click', () => { restoreNotes(); $('method').showModal(); });
$('close-method').addEventListener('click', () => $('method').close());
$('method').addEventListener('click', event => { if (event.target === $('method')) { const r = $('method').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('method').close(); } });
let toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500); }
$('share').addEventListener('click', async () => {
  const data = { title: 'Probably — tiny brains, big market energy.', text: 'Three coins. One curious AI. A live TypeSafe experiment. Not financial advice.', url: location.href.split('#')[0] };
  try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(data.text + ' ' + data.url); toast('Link copied. Spread a little curiosity.'); } }
  catch (error) { if (error.name !== 'AbortError') toast('You can share this experiment by copying the address above.'); }
});
setInterval(updateClocks, 1000);
poll();
