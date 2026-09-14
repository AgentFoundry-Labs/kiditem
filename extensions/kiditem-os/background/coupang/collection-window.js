(function initializeCollectionWindow(root) {
  "use strict";

  // This module owns only the browser resource. Provider URLs, messages,
  // progress, cancellation and owner terminality belong to source collectors.
  const CONTENT_SCRIPT_TIMEOUT_MS = 30 * 60 * 1000;
  const CONTENT_SCRIPT_READY_MAX_ATTEMPTS = 20;
  const CONTENT_SCRIPT_READY_RETRY_MS = 500;
  const OWNED_RESOURCE_REMOVAL_MAX_ATTEMPTS = 20;
  const OWNED_RESOURCE_REMOVAL_RETRY_MS = 100;
  const RESOURCE_RECOVERY_MAX_ATTEMPTS = 1;
  const WINDOW_IN_USE_MESSAGE =
    "수집이 이 창을 사용하고 있습니다. 끝난 뒤 다시 시도해 주세요.";
  const INACTIVE_COLLECTION_RUN_MESSAGE =
    "이미 중단되거나 종료된 데이터 수집 작업입니다.";

  function collectionWindowError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    error.retryable = details.retryable === true;
    if (typeof details.runId === "string") error.runId = details.runId;
    if (typeof details.stage === "string") error.stage = details.stage;
    return error;
  }

  function errorMessage(error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : String(error || "").trim();
    return (message || "Collection infrastructure failed").slice(0, 500);
  }

  function create(options = {}) {
    const chromeApi = options.chrome || root.chrome;
    const storageKey = options.storageKey;
    if (!chromeApi || typeof storageKey !== "string" || !storageKey) {
      throw new Error("Collection window chrome and storage key are required");
    }
    const sessions = options.sessions || null;
    const bindTab = options.bindTab || (() => Promise.resolve());
    const wait = options.delay || ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
    const requestedContentScriptTimeoutMs = Number(options.contentScriptTimeoutMs);
    const contentScriptTimeoutMs =
      Number.isFinite(requestedContentScriptTimeoutMs) && requestedContentScriptTimeoutMs > 0
        ? requestedContentScriptTimeoutMs
        : CONTENT_SCRIPT_TIMEOUT_MS;
    let executionQueue = Promise.resolve();

    function runExclusive(operation) {
      const result = executionQueue.catch(() => undefined).then(operation);
      executionQueue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    }

    async function readRecord() {
      const stored = await chromeApi.storage.local.get(storageKey);
      return stored?.[storageKey] || null;
    }

    async function clearRecord() {
      await chromeApi.storage.local.remove(storageKey);
    }

    function getWindow(windowId) {
      return new Promise((resolve) => {
        chromeApi.windows.get(windowId, { populate: true }, (window) => {
          if (chromeApi.runtime.lastError || !window?.id) {
            resolve(null);
            return;
          }
          resolve(window);
        });
      });
    }

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

    async function validate(record) {
      if (
        !record ||
        typeof record.runId !== "string" ||
        !Number.isInteger(record.windowId) ||
        !Number.isInteger(record.tabId)
      ) {
        return null;
      }
      const [window, tab] = await Promise.all([
        getWindow(record.windowId),
        getTab(record.tabId),
      ]);
      if (
        !window?.id ||
        window.type !== "normal" ||
        !tab?.id ||
        tab.windowId !== record.windowId
      ) {
        return null;
      }
      return {
        runId: record.runId,
        windowId: record.windowId,
        tabId: record.tabId,
      };
    }

    function createOwnedWindow(url) {
      // Keep the managed window unfocused so automated collection never steals
      // the operator's current browser focus. The active tab in this separate
      // window remains visible to provider renderers.
      return new Promise((resolve, reject) => {
        chromeApi.windows.create(
          { url, focused: false, type: "normal" },
          (win) => {
            if (chromeApi.runtime.lastError || !win?.id) {
              reject(
                new Error(
                  chromeApi.runtime.lastError?.message ||
                    "Collection window creation failed",
                ),
              );
              return;
            }
            resolve(win);
          },
        );
      });
    }

    function ownedWindowTab(win) {
      return Array.isArray(win?.tabs)
        ? win.tabs.find((tab) => tab?.id)
        : null;
    }

    function removeWindow(windowId) {
      return new Promise((resolve) => {
        try {
          chromeApi.windows.remove(windowId, () => {
            resolve(!chromeApi.runtime.lastError);
          });
        } catch {
          resolve(false);
        }
      });
    }

    function removeTab(tabId) {
      return new Promise((resolve) => {
        try {
          chromeApi.tabs.remove(tabId, () => {
            resolve(!chromeApi.runtime.lastError);
          });
        } catch {
          resolve(false);
        }
      });
    }

    async function waitUntilRemoved(readResource) {
      for (
        let attempt = 1;
        attempt <= OWNED_RESOURCE_REMOVAL_MAX_ATTEMPTS;
        attempt += 1
      ) {
        if (!(await readResource())) return true;
        if (attempt < OWNED_RESOURCE_REMOVAL_MAX_ATTEMPTS) {
          await wait(OWNED_RESOURCE_REMOVAL_RETRY_MS);
        }
      }
      return false;
    }

    async function closeOwnedRecord(record) {
      if (
        !record ||
        !Number.isInteger(record.windowId) ||
        !Number.isInteger(record.tabId)
      ) {
        return false;
      }

      // Re-read both objects at teardown. If the user moved the managed tab or
      // added a personal tab, remove only the managed tab and leave their
      // window intact.
      const tab = await getTab(record.tabId);
      if (!tab?.id) return true;
      const win =
        tab.windowId === record.windowId
          ? await getWindow(record.windowId)
          : null;
      const windowTabs = Array.isArray(win?.tabs) ? win.tabs : [];
      const isStillSoleOwnedTab =
        tab.windowId === record.windowId &&
        windowTabs.length === 1 &&
        windowTabs[0]?.id === record.tabId;

      if (isStillSoleOwnedTab) {
        const removalAccepted = await removeWindow(record.windowId);
        if (!removalAccepted) {
          return (await getWindow(record.windowId)) === null;
        }
        return waitUntilRemoved(() => getWindow(record.windowId));
      }

      const removalAccepted = await removeTab(record.tabId);
      if (!removalAccepted) {
        return (await getTab(record.tabId)) === null;
      }
      return waitUntilRemoved(() => getTab(record.tabId));
    }

    async function readSession(runId) {
      if (!sessions || typeof sessions.get !== "function") return null;
      try {
        return await sessions.get(runId);
      } catch {
        return null;
      }
    }

    // A session whose attempt its source owner has already ended is a leftover:
    // nothing is left to collect or attend to. Only a confirmed end clears it;
    // an owner that cannot be read keeps protecting the window.
    async function attemptEnded(session) {
      if (!session || typeof options.attemptEnded !== "function") return false;
      try {
        return (await options.attemptEnded(session)) === true;
      } catch {
        return false;
      }
    }

    function windowInUseError(runId, session) {
      let name = null;
      try {
        const value = session && typeof options.collectionName === "function"
          ? options.collectionName(session)
          : null;
        if (typeof value === "string" && value.trim()) name = value.trim();
      } catch {
        name = null;
      }
      return collectionWindowError(
        "collection_window_owner_conflict",
        `${name || "다른 데이터"} ${WINDOW_IN_USE_MESSAGE}`,
        { runId, stage: "validate_owner" },
      );
    }

    async function clearLeftover(record, runId) {
      if (!(await closeOwnedRecord(record))) {
        throw collectionWindowError(
          "collection_window_recovery_failed",
          "Collection tab cleanup failed",
          { runId, stage: "clear_leftover", retryable: true },
        );
      }
      if (typeof sessions?.remove === "function") await sessions.remove(record.runId);
      await clearRecord();
    }

    function reuseDecision(value) {
      if (value === true) return { reuse: true, closePrevious: false };
      if (value && typeof value === "object") {
        return {
          reuse: value.reuse === true,
          closePrevious: value.closePrevious === true,
        };
      }
      return { reuse: false, closePrevious: false };
    }

    async function getOrCreate(runId, url, reuseOptions = {}) {
      if (typeof runId !== "string" || !runId) {
        throw new Error("Collection run ID is required");
      }
      if (typeof url !== "string" || !url) {
        throw new Error("Collection target URL is required");
      }
      const stored = await readRecord();
      const live = await validate(stored);
      if (live?.runId === runId) return live;
      const previousSession = live ? await readSession(live.runId) : null;
      if (live && (await attemptEnded(previousSession))) {
        await clearLeftover(live, runId);
      } else if (live) {
        const decision = reuseDecision(
          typeof reuseOptions.reuse === "function"
            ? await reuseOptions.reuse({
                previousRunId: live.runId,
                previousSession,
                incomingRunId: runId,
              })
            : reuseOptions.reuse,
        );

        // An untracked resource record is safe to supersede only because the
        // caller owns this storage key. A running owner session is protected
        // until its source explicitly authorizes an attention retry.
        if (previousSession && !decision.reuse) {
          throw windowInUseError(runId, previousSession);
        }

        if (previousSession && sessions && typeof sessions.detachTab === "function") {
          await sessions.detachTab(live.runId, {
            tabId: live.tabId,
            closeManagedTab: false,
          });
        }

        if (decision.closePrevious) {
          if (!(await closeOwnedRecord(live))) {
            throw collectionWindowError(
              "collection_window_recovery_failed",
              "Collection tab cleanup failed",
              { runId, stage: "replace_previous", retryable: true },
            );
          }
          await clearRecord();
        } else {
          const adopted = { ...live, runId };
          await chromeApi.storage.local.set({ [storageKey]: adopted });
          return adopted;
        }
      } else if (stored) {
        await clearRecord();
      }

      const win = await createOwnedWindow(url);
      const tab = ownedWindowTab(win);
      if (!tab?.id || tab.windowId !== win.id) {
        await removeWindow(win.id);
        throw new Error("Collection window has no owned tab");
      }
      const record = { runId, windowId: win.id, tabId: tab.id };
      await chromeApi.storage.local.set({ [storageKey]: record });
      return record;
    }

    async function reattach(runId) {
      const stored = await readRecord();
      const live = await validate(stored);
      if (!live) {
        if (stored) await clearRecord();
        return null;
      }
      return live.runId === runId ? live : null;
    }

    async function recoverOwnedWindow(runId, url) {
      const stored = await readRecord();
      const live = await validate(stored);
      if (live?.runId === runId) return live;
      if (live) {
        const previousSession = await readSession(live.runId);
        if (!(await attemptEnded(previousSession))) {
          throw windowInUseError(runId, previousSession);
        }
        await clearLeftover(live, runId);
      } else if (stored) {
        await clearRecord();
      }

      const session = await readSession(runId);
      if (sessions && !session) {
        throw collectionWindowError(
          "collection_window_inactive_run",
          INACTIVE_COLLECTION_RUN_MESSAGE,
          { runId, stage: "validate_session" },
        );
      }

      let win;
      try {
        win = await createOwnedWindow(url);
      } catch (cause) {
        throw collectionWindowError(
          "collection_window_recovery_failed",
          errorMessage(cause),
          { runId, stage: "create_replacement", retryable: true },
        );
      }
      const tab = ownedWindowTab(win);
      if (!tab?.id || tab.windowId !== win.id) {
        await removeWindow(win.id);
        throw collectionWindowError(
          "collection_window_recovery_failed",
          "Collection replacement window has no owned tab",
          { runId, stage: "validate_replacement", retryable: true },
        );
      }
      const record = { runId, windowId: win.id, tabId: tab.id };
      await chromeApi.storage.local.set({ [storageKey]: record });
      if (sessions && typeof sessions.attachTab === "function") {
        let attached;
        try {
          attached = await sessions.attachTab(runId, {
            tabId: record.tabId,
            windowId: record.windowId,
          });
        } catch (cause) {
          if (await closeOwnedRecord(record)) await clearRecord();
          throw collectionWindowError(
            "collection_window_recovery_failed",
            errorMessage(cause),
            { runId, stage: "attach_replacement", retryable: true },
          );
        }
        if (!attached) {
          if (await closeOwnedRecord(record)) await clearRecord();
          throw collectionWindowError(
            "collection_window_inactive_run",
            INACTIVE_COLLECTION_RUN_MESSAGE,
            { runId, stage: "attach_replacement" },
          );
        }
      }
      return record;
    }

    function updateTab(tabId, properties) {
      return new Promise((resolve, reject) => {
        chromeApi.tabs.update(tabId, properties, (tab) => {
          if (chromeApi.runtime.lastError || !tab?.id) {
            reject(
              new Error(
                chromeApi.runtime.lastError?.message ||
                  "Collection tab navigation failed",
              ),
            );
            return;
          }
          resolve(tab);
        });
      });
    }

    function reloadTab(tabId) {
      return new Promise((resolve, reject) => {
        chromeApi.tabs.reload(tabId, {}, () => {
          if (chromeApi.runtime.lastError) {
            reject(
              new Error(
                chromeApi.runtime.lastError.message ||
                  "Collection tab reload failed",
              ),
            );
            return;
          }
          resolve();
        });
      });
    }

    function isMissingMessageReceiver(error) {
      return /Could not establish connection|Receiving end does not exist/i.test(
        errorMessage(error),
      );
    }

    function isNavigationMessageChannelClosed(error) {
      return /message (?:channel|port) closed before a response was received/i.test(
        errorMessage(error),
      );
    }

    function isMissingCollectionTab(error) {
      return /No tab with id:|Collection tab was closed|tab was closed/i.test(
        errorMessage(error),
      );
    }

    async function navigate(runId, url, navigationOptions = {}) {
      let live = await reattach(runId);
      let recovered = false;
      if (!live) {
        live = await recoverOwnedWindow(runId, url);
        recovered = true;
      }
      let tab;
      try {
        tab = await updateTab(live.tabId, { url, active: true });
      } catch (cause) {
        if (!isMissingCollectionTab(cause) || recovered) {
          throw collectionWindowError(
            "collection_window_recovery_failed",
            errorMessage(cause),
            { runId, stage: "navigate_replacement", retryable: true },
          );
        }
        live = await recoverOwnedWindow(runId, url);
        recovered = true;
        try {
          tab = await updateTab(live.tabId, { url, active: true });
        } catch (retryCause) {
          throw collectionWindowError(
            "collection_window_recovery_failed",
            errorMessage(retryCause),
            { runId, stage: "navigate_replacement", retryable: true },
          );
        }
      }
      if (tab.windowId !== live.windowId) {
        throw collectionWindowError(
          recovered
            ? "collection_window_recovery_failed"
            : "collection_window_ownership_lost",
          "Collection tab left its owned window",
          {
            runId,
            stage: recovered ? "navigate_replacement" : "validate_navigation",
            retryable: recovered,
          },
        );
      }
      if (navigationOptions.environmentId !== undefined) {
        await bindTab(tab.id, navigationOptions.environmentId);
      }
      return { ...live, url: tab.url || url };
    }

    function waitForTabComplete(tabId, timeoutMs = 180000) {
      return new Promise((resolve, reject) => {
        let done = false;
        const cleanup = () => {
          chromeApi.tabs.onUpdated.removeListener(onUpdated);
          chromeApi.tabs.onRemoved.removeListener(onRemoved);
          clearTimeout(timeout);
        };
        const finish = (value, error) => {
          if (done) return;
          done = true;
          cleanup();
          if (error) reject(error);
          else resolve(value);
        };
        const onUpdated = (updatedTabId, changeInfo, tab) => {
          if (updatedTabId === tabId && changeInfo.status === "complete") {
            finish(tab || {});
          }
        };
        const onRemoved = (removedTabId) => {
          if (removedTabId === tabId) {
            finish(null, new Error("Collection tab was closed"));
          }
        };
        const timeout = setTimeout(
          () => finish(null, new Error("Collection tab navigation timed out")),
          timeoutMs,
        );
        chromeApi.tabs.onUpdated.addListener(onUpdated);
        chromeApi.tabs.onRemoved.addListener(onRemoved);
        chromeApi.tabs.get(tabId, (tab) => {
          if (chromeApi.runtime.lastError || !tab?.id) {
            finish(
              null,
              new Error(
                chromeApi.runtime.lastError?.message ||
                  "Collection tab was closed",
              ),
            );
            return;
          }
          if (tab.status === "complete") finish(tab);
        });
      });
    }

    function sendMessage(tabId, message, timeoutMs = contentScriptTimeoutMs) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (value, error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (error) reject(error);
          else resolve(value);
        };
        const timeout = setTimeout(() => {
          finish(
            null,
            new Error(
              `Collection content script timed out after ${Math.round(timeoutMs / 1000)}s`,
            ),
          );
        }, timeoutMs);
        chromeApi.tabs.sendMessage(tabId, message, (response) => {
          if (chromeApi.runtime.lastError) {
            finish(
              null,
              new Error(
                chromeApi.runtime.lastError.message ||
                  "Collection content script did not respond",
              ),
            );
            return;
          }
          finish(response);
        });
      });
    }

    async function sendMessageWhenReady(tabId, message) {
      let lastError = null;
      for (
        let attempt = 1;
        attempt <= CONTENT_SCRIPT_READY_MAX_ATTEMPTS;
        attempt += 1
      ) {
        try {
          return await sendMessage(tabId, message);
        } catch (error) {
          lastError = error;
          if (
            !isMissingMessageReceiver(error) ||
            attempt === CONTENT_SCRIPT_READY_MAX_ATTEMPTS
          ) {
            throw error;
          }
          await wait(CONTENT_SCRIPT_READY_RETRY_MS);
        }
      }
      throw lastError || new Error("Collection content script did not respond");
    }

    async function sendMessageWithReload(tabId, message) {
      try {
        return await sendMessageWhenReady(tabId, message);
      } catch (error) {
        if (!isMissingMessageReceiver(error)) throw error;
        await reloadTab(tabId);
        await waitForTabComplete(tabId);
        await wait(2500);
        return sendMessageWhenReady(tabId, message);
      }
    }

    async function bindOwnedTab(tabId, environmentId) {
      await bindTab(tabId, environmentId);
    }

    async function close(runId) {
      const stored = await readRecord();
      // Closing an already-absent owned record is idempotent success. A prior
      // terminal run may have lost its tab/window before this cleanup runs;
      // callers can safely continue replacing that exact run. An existing
      // record owned by another run remains a conflict.
      if (!stored) return true;
      if (stored.runId !== runId) return false;
      if (!(await closeOwnedRecord(stored))) return false;
      const current = await readRecord();
      if (
        current?.runId === stored.runId &&
        current?.windowId === stored.windowId &&
        current?.tabId === stored.tabId
      ) {
        await clearRecord();
      }
      return true;
    }

    async function recover(runId, url) {
      for (let attempt = 0; attempt <= RESOURCE_RECOVERY_MAX_ATTEMPTS; attempt += 1) {
        try {
          return await recoverOwnedWindow(runId, url);
        } catch (error) {
          if (attempt >= RESOURCE_RECOVERY_MAX_ATTEMPTS) throw error;
          if (!isMissingCollectionTab(error)) throw error;
        }
      }
      throw new Error("Collection resource recovery failed");
    }

    return Object.freeze({
      bindTab: bindOwnedTab,
      close,
      getOrCreate,
      getTab,
      isMissingCollectionTab,
      isMissingMessageReceiver,
      isNavigationMessageChannelClosed,
      navigate,
      recover,
      reloadTab,
      reattach,
      runExclusive,
      sendMessage,
      sendMessageWhenReady,
      sendMessageWithReload,
      waitForTabComplete,
    });
  }

  root.KidItemCollectionWindow = Object.freeze({
    collectionWindowError,
    create,
    errorMessage,
  });
})(globalThis);
