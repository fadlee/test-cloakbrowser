// Express server: serves the static UI and exposes a /search endpoint.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { BrowserManager } from './src/browser-manager.js';
import { SearchService } from './src/search-service.js';
import { SerialQueue } from './src/queue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const HEADLESS = process.env.HEADLESS !== 'false';

async function main() {
  const browserManager = new BrowserManager({ headless: HEADLESS });
  const searchService = new SearchService(browserManager);
  const screenshotQueue = new SerialQueue();

  // Pre-warm browser so first request is fast
  console.log('[server] launching CloakBrowser...');
  await browserManager.start();
  console.log('[server] CloakBrowser ready');

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/search', async (req, res) => {
    const { query, pages } = req.body || {};
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "query"' });
    }
    try {
      const result = await searchService.search(query, pages);
      res.json(result);
    } catch (err) {
      const code = err.code || 'INTERNAL_ERROR';
      const status = code === 'EMPTY_QUERY' ? 400
        : code === 'BLOCKED' || code === 'CAPTCHA' ? 429
        : 500;
      console.error('[server] search error:', code, err.message);
      res.status(status).json({ error: err.message, code });
    }
  });

  app.post('/screenshot', async (req, res) => {
    const { url } = req.body || {};
    if (url !== undefined && typeof url !== 'string') {
      return res.status(400).json({ error: '"url" must be a string' });
    }
    try {
      const buffer = await screenshotQueue.run(() => browserManager.screenshot(url));
      res.set('Content-Type', 'image/png');
      res.send(buffer);
    } catch (err) {
      const code = err.code || 'INTERNAL_ERROR';
      const status = code === 'BROWSER_NOT_READY' ? 503 : 500;
      console.error('[server] screenshot error:', code, err.message);
      res.status(status).json({ error: err.message, code });
    }
  });

  const server = app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
  });

  const shutdown = async (signal) => {
    console.log(`[server] received ${signal}, shutting down...`);
    server.close(() => {});
    await browserManager.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[server] fatal:', err);
  process.exit(1);
});
