// SearchService: orchestrates the Google search flow.
// - Serial queue ensures one search at a time
// - Per-search fresh browser context
// - Type & click flow with humanize=true
// - CAPTCHA / consent / error detection

import { SerialQueue } from './queue.js';
import { parseSerp } from './parser.js';

const SEARCH_TIMEOUT_MS = 30000;

export class SearchService {
  /**
   * @param {import('./browser-manager').BrowserManager} browserManager
   */
  constructor(browserManager) {
    this._mgr = browserManager;
    this._queue = new SerialQueue();
  }

  /**
   * Run a Google search and return aggregated results across pages.
   *
   * @param {string} query
   * @param {number} pages   Number of result pages to fetch (1-3)
   * @returns {Promise<{
   *   query: string,
   *   pagesFetched: number,
   *   results: ReturnType<typeof aggregate>
   * }>}
   */
  async search(query, pages = 1) {
    const trimmed = String(query || '').trim();
    if (!trimmed) {
      throw Object.assign(new Error('Query is empty'), { code: 'EMPTY_QUERY' });
    }
    const pageCount = Math.min(Math.max(parseInt(pages, 10) || 1, 1), 3);

    return this._queue.run(() => this._runSearch(trimmed, pageCount));
  }

  async _runSearch(query, pageCount) {
    const context = await this._mgr.acquireContext();
    const page = await context.newPage();

    const aggregated = {
      organic: [],
      featuredSnippet: null,
      peopleAlsoAsk: [],
      relatedSearches: [],
    };

    let pagesFetched = 0;

    try {
      // Step 1: open Google home and (potentially) accept consent
      await page.goto('https://www.google.com/', {
        waitUntil: 'domcontentloaded',
        timeout: SEARCH_TIMEOUT_MS,
      });
      await this._handleConsentIfPresent(page);

      // Step 2: type query and submit (humanize handles natural typing)
      const searchBox = await this._findSearchBox(page);
      if (!searchBox) {
        throw Object.assign(new Error('Search box not found on Google home page'), {
          code: 'NO_SEARCH_BOX',
        });
      }
      await searchBox.click();
      await page.keyboard.type(query, { delay: 30 });
      await page.keyboard.press('Enter');

      // Step 3: wait for the results page to settle.
      // Google sometimes redirects through several URLs; we wait until
      // the URL matches /search or /sorry, then for results to appear.
      await this._waitForSerpUrl(page);
      await this._assertNotBlocked(page);
      await this._waitForResults(page);

      // Step 4: parse first page
      const first = await parseSerp(page);
      mergeResults(aggregated, first);
      pagesFetched++;

      // Step 5: paginate if requested
      for (let i = 1; i < pageCount; i++) {
        const ok = await this._goToNextPage(page);
        if (!ok) break;
        await this._waitForSerpUrl(page);
        await this._assertNotBlocked(page);
        await this._waitForResults(page);
        const next = await parseSerp(page);
        mergeResults(aggregated, next);
        pagesFetched++;
      }

      return {
        query,
        pagesFetched,
        results: aggregated,
      };
    } finally {
      try { await page.close(); } catch (_) {}
      await this._mgr.releaseContext(context);
    }
  }

  async _findSearchBox(page) {
    const selectors = [
      'textarea[name="q"]',
      'input[name="q"]',
      'textarea[aria-label="Search"]',
    ];
    for (const sel of selectors) {
      const el = await page.$(sel);
      if (el) return el;
    }
    return null;
  }

  async _handleConsentIfPresent(page) {
    // Google's EU consent dialog — try to dismiss if present.
    const buttonTexts = ['Accept all', 'I agree', 'Reject all', 'Tolak semua', 'Setuju', 'Accept'];
    for (const t of buttonTexts) {
      try {
        const btn = await page.$(`button:has-text("${t}")`);
        if (btn) {
          await btn.click();
          await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
          return;
        }
      } catch (_) {
        // ignore
      }
    }
  }

  async _assertNotBlocked(page) {
    const url = page.url();
    if (url.includes('/sorry/') || url.includes('captcha')) {
      throw Object.assign(new Error('Google blocked this request (CAPTCHA / sorry page)'), {
        code: 'BLOCKED',
      });
    }
    // Sometimes Google returns a recaptcha iframe
    const captchaFrame = await page.$('iframe[src*="recaptcha"], #captcha-form');
    if (captchaFrame) {
      throw Object.assign(new Error('Google CAPTCHA challenge detected'), { code: 'CAPTCHA' });
    }
  }

  async _waitForResults(page) {
    // Wait for either organic results container or block-page indicators.
    await page.waitForSelector(
      'div#search, #rso, #res, div.MjjYud, form#captcha-form, body[onload*="captcha"]',
      { timeout: SEARCH_TIMEOUT_MS }
    ).catch(() => {});
  }

  async _waitForSerpUrl(page) {
    // Wait until URL contains /search or /sorry (block) or is otherwise stable.
    try {
      await page.waitForURL(
        (url) => {
          const s = url.toString();
          return s.includes('/search') || s.includes('/sorry/') || s.includes('captcha');
        },
        { timeout: SEARCH_TIMEOUT_MS, waitUntil: 'domcontentloaded' }
      );
    } catch (_) {
      // Fall back: just ensure DOMContentLoaded happened
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
    }
  }

  async _goToNextPage(page) {
    const next =
      (await page.$('a#pnnext')) ||
      (await page.$('a[aria-label="Next page"]')) ||
      (await page.$('a[aria-label="Next"]'));
    if (!next) return false;
    await Promise.all([
      page.waitForLoadState('domcontentloaded', { timeout: SEARCH_TIMEOUT_MS }).catch(() => {}),
      next.click(),
    ]);
    return true;
  }
}

function mergeResults(target, page) {
  // Deduplicate organic by URL
  const seen = new Set(target.organic.map((r) => r.url));
  for (const r of page.organic) {
    if (!seen.has(r.url)) {
      target.organic.push(r);
      seen.add(r.url);
    }
  }
  if (!target.featuredSnippet && page.featuredSnippet) {
    target.featuredSnippet = page.featuredSnippet;
  }
  for (const q of page.peopleAlsoAsk) {
    if (!target.peopleAlsoAsk.includes(q)) target.peopleAlsoAsk.push(q);
  }
  for (const r of page.relatedSearches) {
    if (!target.relatedSearches.includes(r)) target.relatedSearches.push(r);
  }
}
