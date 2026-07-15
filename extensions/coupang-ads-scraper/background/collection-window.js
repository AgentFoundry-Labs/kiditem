(function initializeCollectionWindow(root) {
  "use strict";

  function create(options) {
    const chromeApi = options.chrome;
    const storageKey = options.storageKey;
    const sessions = options.sessions || null;
    const statusKey = options.statusKey || null;
    const cancelKey = options.cancelKey || null;
    const markScraped = options.markScraped || (() => Promise.resolve());
    const notify = options.notify || (() => undefined);
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
      return new Promise((resolve, reject) => {
        chromeApi.windows.create(
          { url, focused: false, type: "normal" },
          (window) => {
            if (chromeApi.runtime.lastError || !window?.id) {
              reject(
                new Error(
                  chromeApi.runtime.lastError?.message ||
                    "Collection window creation failed",
                ),
              );
              return;
            }
            resolve(window);
          },
        );
      });
    }

    function queryWindowTabs(windowId) {
      return new Promise((resolve) => {
        chromeApi.tabs.query({ windowId }, (tabs) => resolve(tabs || []));
      });
    }

    async function getOrCreate(runId, url) {
      const stored = await readRecord();
      const live = await validate(stored);
      if (live) {
        if (live.runId !== runId) {
          throw new Error("Another collection run requires attention");
        }
        return live;
      }
      if (stored) await clearRecord();

      const window = await createOwnedWindow(url);
      const tab =
        (Array.isArray(window.tabs)
          ? window.tabs.find((candidate) => candidate?.id)
          : null) || (await queryWindowTabs(window.id))[0];
      if (!tab?.id || tab.windowId !== window.id) {
        await removeWindow(window.id);
        throw new Error("Collection window has no owned tab");
      }
      const record = { runId, windowId: window.id, tabId: tab.id };
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

    async function navigate(runId, url) {
      const live = await reattach(runId);
      if (!live) throw new Error("Collection window ownership was lost");
      const tab = await updateTab(live.tabId, { url, active: true });
      if (tab.windowId !== live.windowId) {
        throw new Error("Collection tab left its owned window");
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
          if (!chromeApi.runtime.lastError && tab?.status === "complete") {
            finish(tab);
          }
        });
      });
    }

    function sendTabMessage(tabId, message) {
      return new Promise((resolve, reject) => {
        chromeApi.tabs.sendMessage(tabId, message, (response) => {
          if (chromeApi.runtime.lastError) {
            reject(
              new Error(
                chromeApi.runtime.lastError.message ||
                  "Collection content script did not respond",
              ),
            );
            return;
          }
          resolve(response);
        });
      });
    }

    function delay(milliseconds) {
      return new Promise((resolve) => setTimeout(resolve, milliseconds));
    }

    async function collectTarget(runId, target) {
      const tab = await navigate(runId, target.url);
      await waitForTabComplete(tab.tabId);
      await delay(4000);
      const response = await sendTabMessage(tab.tabId, {
        action: "manualSync",
      }).catch((error) => ({ success: false, error: error.message }));
      const message = String(response?.error || "");
      if (response?.pendingLogin || /로그인|captcha|보안문자/i.test(message)) {
        return {
          success: false,
          attentionRequired: true,
          reason: /captcha|보안문자/i.test(message)
            ? "captcha"
            : "marketplace_login",
          error:
            message ||
            "쿠팡 로그인이 필요합니다. 알림에서 확인 탭을 열어주세요.",
        };
      }
      if (response?.success && target.id) await markScraped(target.id);
      return {
        success: !!response?.success,
        type: response?.type || "unknown",
        count: response?.count || 0,
        error: response?.error,
      };
    }

    async function isCancelled(runId) {
      if (sessions && (await sessions.get(runId))?.status === "cancelled") {
        return true;
      }
      if (!cancelKey) return false;
      const stored = await chromeApi.storage.local.get(cancelKey);
      const cancellation = stored?.[cancelKey];
      return (
        !!cancellation?.cancelled &&
        (!cancellation.runId || cancellation.runId === runId)
      );
    }

    async function writeStatus(status) {
      if (statusKey) {
        await chromeApi.storage.local.set({ [statusKey]: status });
      }
    }

    function requireCollectionDependencies() {
      if (!sessions || !statusKey || !cancelKey) {
        throw new Error("Collection lifecycle dependencies are required");
      }
    }

    async function collectTargets(input) {
      requireCollectionDependencies();
      const { runId, targets, startedAt } = input;
      return runExclusive(async () => {
        let completed = 0;
        let failed = 0;
        let cancelled = false;
        let attentionRequired = false;
        await chromeApi.storage.local.remove(cancelKey);
        try {
          const owned = await getOrCreate(runId, targets[0].url);
          await sessions.attachTab(runId, {
            tabId: owned.tabId,
            windowId: owned.windowId,
          });
          await writeStatus({
            runId,
            total: targets.length,
            completed,
            failed,
            current: 0,
            currentTabId: owned.tabId,
            status: "running",
            startedAt,
          });

          for (let index = 0; index < targets.length; index += 1) {
            if (await isCancelled(runId)) {
              cancelled = true;
              break;
            }
            const target = targets[index];
            await sessions.progress(runId, {
              current: index + 1,
              total: targets.length,
              completed,
              failed,
              label: target.label || null,
            });
            await writeStatus({
              runId,
              total: targets.length,
              completed,
              failed,
              current: index + 1,
              currentLabel: target.label,
              currentTabId: owned.tabId,
              status: "running",
              startedAt,
            });
            const result = await collectTarget(runId, target);
            if (result.attentionRequired) {
              attentionRequired = true;
              await sessions.requireAttention(runId, {
                reason: result.reason,
                message: result.error,
              });
              break;
            }
            if (result.success) completed += 1;
            else failed += 1;
          }

          const status = cancelled
            ? "cancelled"
            : attentionRequired
              ? "attention_required"
              : failed > 0
                ? "error"
                : "done";
          await writeStatus({
            runId,
            total: targets.length,
            completed,
            failed,
            current: attentionRequired
              ? completed + failed + 1
              : completed + failed,
            currentTabId: attentionRequired ? owned.tabId : null,
            status,
            startedAt,
            endedAt: attentionRequired ? null : Date.now(),
            cancelled,
          });
          if (cancelled) await sessions.cancel(runId);
          else if (!attentionRequired && failed > 0) await sessions.fail(runId);
          else if (!attentionRequired) await sessions.succeed(runId);
          notify();
          return {
            success: !cancelled && !attentionRequired && failed === 0,
            completed,
            failed,
            total: targets.length,
            cancelled,
            attentionRequired,
            runId,
          };
        } catch (error) {
          if (await isCancelled(runId)) await sessions.cancel(runId);
          else await sessions.fail(runId);
          throw error;
        } finally {
          if (!attentionRequired) await close(runId);
        }
      });
    }

    async function cancelRun(runId) {
      requireCollectionDependencies();
      await chromeApi.storage.local.set({
        [cancelKey]: { cancelled: true, runId, requestedAt: Date.now() },
      });
      const stored = await chromeApi.storage.local.get(statusKey);
      const status = stored?.[statusKey] || {};
      if (runId && status.runId && status.runId !== runId) {
        return { success: true, cancelled: false, staleRunId: status.runId };
      }
      const activeRunId = status.runId || runId;
      await sessions.cancel(activeRunId);
      await close(activeRunId);
      await writeStatus({
        ...status,
        runId: activeRunId,
        status: "cancelled",
        cancelled: true,
        endedAt: Date.now(),
      });
      notify();
      return { success: true, cancelled: true, runId: activeRunId };
    }

    function removeWindow(windowId) {
      return new Promise((resolve) => {
        try {
          chromeApi.windows.remove(windowId, () => resolve());
        } catch {
          resolve();
        }
      });
    }

    async function close(runId) {
      const stored = await readRecord();
      if (!stored || stored.runId !== runId) return false;
      await removeWindow(stored.windowId);
      await clearRecord();
      return true;
    }

    return Object.freeze({
      close,
      cancelRun,
      collectTargets,
      getOrCreate,
      navigate,
      reattach,
      runExclusive,
    });
  }

  root.KidItemCollectionWindow = Object.freeze({ create });
})(globalThis);
