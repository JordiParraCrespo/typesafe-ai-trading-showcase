import type { IncomingMessage, ServerResponse } from 'node:http';
import { getSnapshot } from '../lib/market.ts';
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); res.writeHead(405); res.end(JSON.stringify({ error: 'Method not allowed' })); return; }
  try {
    const snapshot = await getSnapshot();
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=12');
    res.end(JSON.stringify(snapshot));
  } catch {
    res.writeHead(503); res.end(JSON.stringify({ error: 'Market feed unavailable. Please try again.' }));
  }
}
