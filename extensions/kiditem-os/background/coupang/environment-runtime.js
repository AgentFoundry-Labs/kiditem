(function installKidItemCoupangEnvironmentRuntime(root) {
  'use strict';

  const TAB_BINDINGS_KEY = 'kiditem_coupang_environment_tab_bindings_v1';
  const SCHEDULED_ALARMS = Object.freeze([
    'auto-scrape',
    'keyword-rank-check',
    'wing-sales-rank-resume',
    'coupang-keyword-serp-rank',
    'kiditem-coupang-catalog-import-step',
  ]);

  function create({ chrome, environmentContext }) {
    if (!chrome?.storage?.local || !environmentContext) {
      throw new Error('Chrome storage and environment context are required');
    }
    let bindingMutationQueue = Promise.resolve();

    function stateKey(base, environmentId) {
      return environmentContext.storageKey(base, environmentId);
    }

    function alarmName(base, environmentId) {
      if (!SCHEDULED_ALARMS.includes(base)) {
        throw new Error('Unsupported scheduled alarm');
      }
      return environmentContext.alarmName(base, environmentId);
    }

    function parseAlarm(name) {
      for (const base of SCHEDULED_ALARMS) {
        const environmentId = environmentContext.parseAlarmName(base, name);
        if (environmentId) return { base, environmentId };
      }
      return null;
    }

    async function readBindings() {
      const stored = await chrome.storage.local.get(TAB_BINDINGS_KEY);
      const value = stored?.[TAB_BINDINGS_KEY];
      return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
    }

    function mutateBindings(operation) {
      const result = bindingMutationQueue
        .catch(() => undefined)
        .then(async () => {
          const bindings = await readBindings();
          const next = operation({ ...bindings });
          await chrome.storage.local.set({ [TAB_BINDINGS_KEY]: next });
          return next;
        });
      bindingMutationQueue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    }

    async function bindTab(tabId, environmentId) {
      if (!Number.isInteger(tabId) || tabId <= 0) {
        throw new Error('A valid marketplace tab ID is required');
      }
      environmentContext.requireEnvironment(environmentId);
      await mutateBindings((bindings) => ({
        ...bindings,
        [String(tabId)]: environmentId,
      }));
      return environmentId;
    }

    async function environmentForTab(tabId) {
      if (!Number.isInteger(tabId) || tabId <= 0) return null;
      const bindings = await readBindings();
      const environmentId = bindings[String(tabId)];
      try {
        environmentContext.requireEnvironment(environmentId);
        return environmentId;
      } catch {
        return null;
      }
    }

    async function clearTab(tabId) {
      if (!Number.isInteger(tabId) || tabId <= 0) return;
      await mutateBindings((bindings) => {
        delete bindings[String(tabId)];
        return bindings;
      });
    }

    return Object.freeze({
      alarmName,
      bindTab,
      clearTab,
      environmentForTab,
      parseAlarm,
      stateKey,
      tabBindingsKey: TAB_BINDINGS_KEY,
    });
  }

  root.KidItemCoupangEnvironmentRuntime = Object.freeze({ create });
})(globalThis);
