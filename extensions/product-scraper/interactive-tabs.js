(function initializeInteractiveTabs(root) {
  "use strict";

  const reasons = Object.freeze({
    MANUAL_PRODUCT_COLLECTION: "manual_product_collection",
  });
  const allowedReasons = new Set(Object.values(reasons));

  function requireReason(reason) {
    if (!allowedReasons.has(reason)) {
      throw new Error("A valid interactive reason is required");
    }
  }

  function create(options) {
    const chromeApi = options.chrome;

    async function createTab(input) {
      requireReason(input?.reason);
      return new Promise((resolve, reject) => {
        chromeApi.tabs.create({ url: input.url, active: true }, (tab) => {
          if (chromeApi.runtime.lastError || !tab?.id) {
            reject(
              new Error(
                chromeApi.runtime.lastError?.message ||
                  "Interactive tab creation failed",
              ),
            );
            return;
          }
          resolve(tab);
        });
      });
    }

    async function focusTab(tabId, reason) {
      requireReason(reason);
      const tab = await new Promise((resolve, reject) => {
        chromeApi.tabs.update(tabId, { active: true }, (updated) => {
          if (chromeApi.runtime.lastError || !updated?.id) {
            reject(
              new Error(
                chromeApi.runtime.lastError?.message ||
                  "Interactive tab activation failed",
              ),
            );
            return;
          }
          resolve(updated);
        });
      });
      if (!Number.isInteger(tab.windowId)) return tab;
      await new Promise((resolve) => {
        chromeApi.windows.update(tab.windowId, { focused: true }, resolve);
      });
      return tab;
    }

    return Object.freeze({ createTab, focusTab });
  }

  root.KidItemInteractiveTabs = Object.freeze({ create, reasons });
})(globalThis);
