(function initializeCollectionWindow(root) {
  "use strict";

  const CONTENT_SCRIPT_TIMEOUT_MS = 30 * 60 * 1000;

  function toProgressInteger(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
  }

  function normalizeProgress(value, previous = {}) {
    if (!value || typeof value !== "object") return null;
    const current = Math.max(
      toProgressInteger(previous.current),
      toProgressInteger(value.current),
    );
    const total = Math.max(
      current,
      toProgressInteger(previous.total),
      toProgressInteger(value.total),
    );
    return {
      current,
      total,
      completed: Math.max(
        toProgressInteger(previous.completed),
        toProgressInteger(value.completed),
      ),
      failed: Math.max(
        toProgressInteger(previous.failed),
        toProgressInteger(value.failed),
      ),
      label: typeof value.label === "string" ? value.label.slice(0, 500) : null,
    };
  }

  function create(options) {
    const chromeApi = options.chrome;
    const storageKey = options.storageKey;
    const sessions = options.sessions || null;
    const statusKey = options.statusKey || null;
    const cancelKey = options.cancelKey || null;
    const markScraped = options.markScraped || (() => Promise.resolve());
    const notify = options.notify || (() => undefined);
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

    function sendTabMessage(tabId, message, timeoutMs = contentScriptTimeoutMs) {
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
            new Error(`Collection content script timed out after ${Math.round(timeoutMs / 1000)}s`),
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

    async function collectTarget(runId, target) {
      let tab = await navigate(runId, target.url);
      await waitForTabComplete(tab.tabId);
      await wait(4000);
      let response = await sendTabMessage(tab.tabId, {
        action: "manualSync",
        collectionRunId: runId,
      }).catch((error) => ({ success: false, error: error.message }));

      // 광고 캠페인 sweep가 SPA 상세 화면에서 대시보드 복귀에 실패하면 content
      // script가 unload되기 전에 명시적으로 응답한다. 같은 소유 탭/세션에서 최대
      // 3회 대시보드로 이동해 sessionStorage의 seen/progress를 이어받는다.
      for (let resumeAttempt = 1; response?.resumeRequired && resumeAttempt <= 3; resumeAttempt += 1) {
        const resumeUrl = response.resumeUrl || target.url;
        tab = await navigate(runId, resumeUrl);
        await waitForTabComplete(tab.tabId);
        await wait(2500);
        response = await sendTabMessage(tab.tabId, {
          action: "manualSync",
          collectionRunId: runId,
        }).catch(
          (error) => ({ success: false, error: error.message }),
        );
      }

      if (response?.resumeRequired) {
        response = {
          success: false,
          error: response.error || "광고 대시보드 복귀 재시도 한도를 초과했습니다.",
          progress: response.progress || null,
        };
      }

      const message = String(response?.error || response?.reason || "");
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
        progress: normalizeProgress(response?.progress),
        error: response?.error || response?.reason,
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
      const { runId, targets, startedAt, producer } = input;
      const preservesContentProgress = producer === "advertising.ad_sync";
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

          let latestError = null;
          for (let index = 0; index < targets.length; index += 1) {
            if (await isCancelled(runId)) {
              cancelled = true;
              break;
            }
            const target = targets[index];
            if (!preservesContentProgress) {
              await sessions.progress(runId, {
                current: index + 1,
                total: targets.length,
                completed,
                failed,
                label: target.label || null,
              });
            }
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
            else {
              failed += 1;
              latestError = result.error || target.label || "수집 실패";
            }
            if (preservesContentProgress && result.progress) {
              // advertising.ad_sync는 content script가 캠페인 단위 progress를
              // 보고한다. 여기서 URL target 단위 1/1로 덮으면 완료 순간 UI가
              // 11/11 → 1/1로 회귀하므로 content의 terminal snapshot을 유지한다.
              await sessions.progress(runId, result.progress);
            } else if (!preservesContentProgress) {
              await sessions.progress(runId, {
                current: index + 1,
                total: targets.length,
                completed,
                failed,
                label: result.success ? target.label || null : latestError,
              });
            }
            await writeStatus({
              runId,
              total: targets.length,
              completed,
              failed,
              current: index + 1,
              currentLabel: target.label,
              currentError: result.success ? null : latestError,
              currentTabId: owned.tabId,
              status: "running",
              startedAt,
            });
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
            error: latestError,
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
            error: latestError,
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
      normalizeProgress,
      reattach,
      runExclusive,
    });
  }

  root.KidItemCollectionWindow = Object.freeze({ create, normalizeProgress });
})(globalThis);
