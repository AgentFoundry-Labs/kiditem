(function initializeCollectionRuns(root) {
  "use strict";

  function create(options) {
    const chromeApi = options.chrome;
    const sessions = options.sessions;

    function getTab(tabId) {
      return new Promise((resolve) => {
        chromeApi.tabs.get(tabId, (tab) => {
          if (chromeApi.runtime.lastError || !tab?.id) {
            resolve(null);
            return;
          }
          resolve(tab);
        });
      });
    }

    async function attachTab(runId, tabOrId) {
      const tab =
        typeof tabOrId === "number" ? await getTab(tabOrId) : tabOrId;
      if (!tab?.id || !Number.isInteger(tab.windowId)) return null;
      await sessions.attachTab(runId, {
        tabId: tab.id,
        windowId: tab.windowId,
      });
      return tab;
    }

    async function requireAttention(runId, tabId, reason, message) {
      const session = await sessions.requireAttention(runId, { reason, message });
      if (!session) {
        return { success: false, cancelled: true, runId, tabId };
      }
      return {
        success: false,
        attentionRequired: true,
        runId,
        tabId,
        error: message,
      };
    }

    return Object.freeze({
      attachTab,
      requireAttention,
    });
  }

  root.KidItemCollectionRuns = Object.freeze({ create });
})(globalThis);
