'use strict';

// Stands in for Playwright so the probe runs end to end over the synthetic page
// without a browser. Page functions receive the synthetic scope as globalThis.
const { createSyntheticPageScope } = require('./synthetic-page.cjs');

exports.chromium = {
  async connectOverCDP() {
    const scope = createSyntheticPageScope();
    const page = {
      async setViewportSize() {},
      async goto(url) {
        if (new URL(url).pathname === '/unavailable') {
          throw new Error(
            `page.goto: net::ERR_CONNECTION_REFUSED at ${url}\nCall log:\n  - navigating to "${url}", waiting until "domcontentloaded"`,
          );
        }
        scope.location.href = url;
      },
      async waitForLoadState() {},
      async waitForTimeout() {},
      async evaluate(pageFunction, arg) {
        const result = await pageFunction(arg, scope);
        return result === undefined ? undefined : JSON.parse(JSON.stringify(result));
      },
    };
    const context = { pages: () => [page], newPage: async () => page };
    return { contexts: () => [context], newContext: async () => context, close: async () => {} };
  },
};
