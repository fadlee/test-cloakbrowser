// BrowserManager: holds a single CloakBrowser instance for the lifetime
// of the server. Each search acquires a fresh browser context (incognito-like
// session) and releases it when done.

import { launch } from 'cloakbrowser';

export class BrowserManager {
  constructor(options = {}) {
    this._options = options;
    this._browser = null;
    this._launching = null;
  }

  async start() {
    if (this._browser) return this._browser;
    if (this._launching) return this._launching;

    this._launching = launch({
      headless: this._options.headless ?? true,
      humanize: true,
      ...this._options,
    }).then((browser) => {
      this._browser = browser;
      this._launching = null;
      return browser;
    }).catch((err) => {
      this._launching = null;
      throw err;
    });

    return this._launching;
  }

  /**
   * Create a fresh browser context with realistic defaults.
   * Caller is responsible for closing it via releaseContext().
   */
  async acquireContext() {
    const browser = await this.start();
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
    });
    return context;
  }

  async releaseContext(context) {
    if (!context) return;
    try {
      await context.close();
    } catch (err) {
      // Best-effort cleanup
      console.warn('[browser-manager] failed to close context:', err.message);
    }
  }

  async shutdown() {
    if (!this._browser) return;
    try {
      await this._browser.close();
    } catch (err) {
      console.warn('[browser-manager] shutdown error:', err.message);
    } finally {
      this._browser = null;
    }
  }
}
