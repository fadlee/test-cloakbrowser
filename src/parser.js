// Parser: extract organic results, featured snippets, related searches,
// and "People Also Ask" from a Google SERP page.
//
// Notes:
// - Google's DOM changes frequently. We use multiple selector fallbacks.
// - All extraction runs inside page.evaluate() to keep DOM access in-browser.

/**
 * Parse the current page (assumed to be a Google SERP).
 * @param {import('playwright-core').Page} page
 * @returns {Promise<{
 *   organic: Array<{title: string, url: string, snippet: string, displayedUrl: string}>,
 *   featuredSnippet: {title: string, url: string, snippet: string} | null,
 *   peopleAlsoAsk: string[],
 *   relatedSearches: string[]
 * }>}
 */
export async function parseSerp(page) {
  return await page.evaluate(() => {
    const text = (el) => (el ? el.innerText.trim() : '');

    // ---- Organic results -------------------------------------------------
    // Google's current DOM structure:
    // - Top-level [data-hveid] with many children = result with sitelinks
    // - Nested [data-hveid] with class "wHYlTd ... tF2Cxc" = individual organic results
    // - Nested [data-hveid] with class "" = sitelink entries (skip these)
    //
    // Strategy: collect both the top-level result (if it has a snippet) AND
    // all nested results with class containing "tF2Cxc" (real organic results).
    const organic = [];
    const seen = new Set();

    const addResult = (root) => {
      const h3 = root.querySelector('h3');
      if (!h3) return;

      const link =
        h3.closest('a[href]') ||
        h3.parentElement?.querySelector('a[href]') ||
        h3.parentElement?.parentElement?.querySelector('a[href]');
      if (!link) return;

      const url = link.href;
      if (!url || url.startsWith('javascript:') || seen.has(url)) return;
      if (url.includes('google.com/search') || url.startsWith('https://www.google.com/url')) return;

      const title = text(h3);
      if (!title) return;

      let snippet = '';
      const snippetEl =
        root.querySelector('div.VwiC3b') ||
        root.querySelector('div.IsZvec') ||
        root.querySelector('div[data-sncf]') ||
        root.querySelector('.lEBKkf') ||
        root.querySelector('.lyLwlc');
      if (snippetEl) snippet = text(snippetEl);

      let displayedUrl = '';
      const cite = root.querySelector('cite');
      if (cite) displayedUrl = text(cite);

      seen.add(url);
      organic.push({ title, url, snippet, displayedUrl });
    };

    const allHveid = Array.from(
      document.querySelectorAll('#search [data-hveid], #rso [data-hveid]')
    );

    allHveid.forEach((el) => {
      const isNested = !!el.parentElement?.closest('[data-hveid]');
      const cls = el.className || '';

      if (!isNested) {
        // Top-level block: always try to add (covers standalone results AND
        // the main result of a sitelink group)
        addResult(el);
      } else {
        // Nested: add if it looks like a real organic result (has tF2Cxc class)
        // Skip sitelinks (class is empty or only Ww4FFb vt6azd)
        if (cls.includes('tF2Cxc')) addResult(el);
      }
    });

    // ---- Featured snippet ------------------------------------------------
    let featuredSnippet = null;
    const fsBlock =
      document.querySelector('.xpdopen .kp-blk') ||
      document.querySelector('div[data-attrid="wa:/description"]') ||
      document.querySelector('.ULSxyf .g');
    if (fsBlock) {
      const a = fsBlock.querySelector('a[href]');
      const h3 = fsBlock.querySelector('h3, [role="heading"]');
      const snippetEl = fsBlock.querySelector('span, div[data-md], .hgKElc');
      if (a || h3 || snippetEl) {
        featuredSnippet = {
          title: text(h3),
          url: a ? a.href : '',
          snippet: text(snippetEl),
        };
      }
    }

    // ---- People Also Ask -------------------------------------------------
    const peopleAlsoAsk = [];
    document
      .querySelectorAll('div[data-initq] [role="heading"], .related-question-pair [role="heading"], div.cbphWd')
      .forEach((el) => {
        const q = text(el);
        if (q && !peopleAlsoAsk.includes(q)) peopleAlsoAsk.push(q);
      });

    // ---- Related searches ------------------------------------------------
    const relatedSearches = [];
    document
      .querySelectorAll('a.k8XOCe, a.ngTNl, div[data-abe] a, .EIaa9b a, .y6Uyqe a')
      .forEach((a) => {
        const t = text(a);
        if (t && !relatedSearches.includes(t)) relatedSearches.push(t);
      });

    return { organic, featuredSnippet, peopleAlsoAsk, relatedSearches };
  });
}
