(function initializeInteractiveTabs(root) {
  "use strict";

  const reasons = Object.freeze({
    ORDER_FILE_UPLOAD: "order_file_upload",
    SHIPMENT_PAGE: "shipment_page",
    SHIPMENT_DOWNLOAD: "shipment_download",
    TRACKING_MUTATION: "tracking_mutation",
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
      return chromeApi.tabs.create({ url: input.url, active: true });
    }

    async function focusTab(tabId, reason) {
      requireReason(reason);
      const tab = await chromeApi.tabs.update(tabId, { active: true });
      if (Number.isInteger(tab?.windowId)) {
        await chromeApi.windows.update(tab.windowId, { focused: true });
      }
      return tab;
    }

    return Object.freeze({ createTab, focusTab });
  }

  root.KidItemInteractiveTabs = Object.freeze({ create, reasons });
})(globalThis);
