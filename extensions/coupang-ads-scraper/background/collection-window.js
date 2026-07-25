(function initializeCollectionWindow(root) {
  "use strict";

  const CONTENT_SCRIPT_TIMEOUT_MS = 30 * 60 * 1000;
  const CONTENT_SCRIPT_READY_MAX_ATTEMPTS = 20;
  const CONTENT_SCRIPT_READY_RETRY_MS = 500;
  const AD_SYNC_BUSY_MAX_ATTEMPTS = 20;
  const AD_SYNC_BUSY_RETRY_MS = 500;
  // The ad sweep deliberately returns after bounded 12-date slices so one
  // content-script message never owns the full 31-day roster. Large accounts
  // can require more than 100 healthy handoffs (campaigns × 31 / 12).
  const MAX_PROGRESSING_RESUME_ATTEMPTS = 500;
  const MAX_STALLED_RESUME_ATTEMPTS = 3;
  const AD_SYNC_PRODUCER = "advertising.ad_sync";
  const ADVERTISING_SESSION_TAB_PATTERNS = [
    "https://advertising.coupang.com/marketing/*",
    "https://advertising.coupang.com/dashboard*",
  ];
  const COLLECTION_OWNER_CONFLICT_MESSAGE =
    "다른 데이터 수집 작업이 확인 대기 중입니다. 기존 작업을 완료하거나 중단한 뒤 다시 시도해주세요.";
  const INACTIVE_COLLECTION_RUN_MESSAGE =
    "이미 중단되거나 종료된 데이터 수집 작업입니다.";

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

  function errorMessage(error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : String(error || "").trim();
    return (message || "Collection infrastructure failed").slice(0, 500);
  }

  function campaignSweepProgress(response) {
    const synced = Math.max(
      toProgressInteger(response?.synced),
      toProgressInteger(response?.progress?.completed),
    );
    const failed = Math.max(
      toProgressInteger(response?.failed),
      toProgressInteger(response?.progress?.failed),
    );
    return {
      synced,
      processed: synced + failed,
      totalRows: toProgressInteger(response?.totalRows),
      dateWorkUnits: toProgressInteger(response?.progress?.current),
    };
  }

  function hasCampaignSweepProgressed(previous, next) {
    return (
      next.synced > previous.synced ||
      next.processed > previous.processed ||
      next.totalRows > previous.totalRows ||
      next.dateWorkUnits > previous.dateWorkUnits
    );
  }

  function mergeCampaignSweepProgress(previous, next) {
    return {
      synced: Math.max(previous.synced, next.synced),
      processed: Math.max(previous.processed, next.processed),
      totalRows: Math.max(previous.totalRows, next.totalRows),
      dateWorkUnits: Math.max(previous.dateWorkUnits, next.dateWorkUnits),
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

    function isAdvertisingSessionUrl(value) {
      try {
        const url = new URL(value || "");
        return (
          url.origin === "https://advertising.coupang.com" &&
          (url.pathname === "/marketing" ||
            url.pathname.startsWith("/marketing/") ||
            url.pathname === "/dashboard" ||
            url.pathname.startsWith("/dashboard/"))
        );
      } catch {
        return false;
      }
    }

    function queryTabs(query) {
      return new Promise((resolve) => {
        try {
          chromeApi.tabs.query(query, (tabs) => {
            if (chromeApi.runtime.lastError) {
              resolve([]);
              return;
            }
            resolve(Array.isArray(tabs) ? tabs : []);
          });
        } catch {
          resolve([]);
        }
      });
    }

    function duplicateTab(tabId) {
      return new Promise((resolve, reject) => {
        chromeApi.tabs.duplicate(tabId, (tab) => {
          if (chromeApi.runtime.lastError || !tab?.id) {
            reject(
              new Error(
                chromeApi.runtime.lastError?.message ||
                  "Advertising session tab duplication failed",
              ),
            );
            return;
          }
          resolve(tab);
        });
      });
    }

    function removeTab(tabId) {
      return new Promise((resolve) => {
        try {
          chromeApi.tabs.remove(tabId, () => resolve());
        } catch {
          resolve();
        }
      });
    }

    function createOwnedWindowFromTab(tabId) {
      return new Promise((resolve, reject) => {
        chromeApi.windows.create(
          { tabId, focused: false, type: "normal" },
          (window) => {
            if (chromeApi.runtime.lastError || !window?.id) {
              reject(
                new Error(
                  chromeApi.runtime.lastError?.message ||
                    "Collection window creation from advertising session failed",
                ),
              );
              return;
            }
            resolve(window);
          },
        );
      });
    }

    async function createAdvertisingSessionWindow(url, producer) {
      if (
        producer !== AD_SYNC_PRODUCER ||
        !isAdvertisingSessionUrl(url) ||
        typeof chromeApi.tabs.duplicate !== "function"
      ) {
        return null;
      }

      const sessionTabs = await queryTabs({
        url: ADVERTISING_SESSION_TAB_PATTERNS,
      });
      const source = sessionTabs.find(
        (tab) =>
          Number.isInteger(tab?.id) &&
          tab.discarded !== true &&
          isAdvertisingSessionUrl(tab.url) &&
          (!tab.pendingUrl || isAdvertisingSessionUrl(tab.pendingUrl)),
      );
      if (!source?.id) return null;

      let duplicate = null;
      let window = null;
      try {
        // 광고센터는 인증 컨텍스트 일부를 tab-scoped sessionStorage에 둔다.
        // 새 URL 창은 동일 쿠키를 공유해도 로그인으로 되돌아갈 수 있으므로,
        // 인증된 탭 자체는 건드리지 않고 복제본만 수집 전용 창으로 옮긴다.
        duplicate = await duplicateTab(source.id);
        window = await createOwnedWindowFromTab(duplicate.id);
        const ownedTab =
          (Array.isArray(window.tabs)
            ? window.tabs.find((candidate) => candidate?.id === duplicate.id)
            : null) || (await getTab(duplicate.id));
        if (!ownedTab?.id || ownedTab.windowId !== window.id) {
          throw new Error("Duplicated advertising tab left its owned window");
        }
        return window;
      } catch {
        if (window?.id) await removeWindow(window.id);
        else if (duplicate?.id) await removeTab(duplicate.id);
        return null;
      }
    }

    function queryWindowTabs(windowId) {
      return new Promise((resolve) => {
        chromeApi.tabs.query({ windowId }, (tabs) => resolve(tabs || []));
      });
    }

    async function getOrCreate(runId, url, producer = null) {
      const stored = await readRecord();
      const live = await validate(stored);
      if (live) {
        if (live.runId !== runId) {
          const canInspectPreviousSession =
            sessions && typeof sessions.get === "function";
          const previousSession = canInspectPreviousSession
            ? await sessions.get(live.runId)
            : null;
          const previousIsTerminal =
            !!canInspectPreviousSession &&
            (!previousSession ||
              ["succeeded", "failed", "cancelled"].includes(
                previousSession.status,
              ));
          const sameProducerNeedsAttention =
            typeof producer === "string" &&
            previousSession?.status === "attention_required" &&
            previousSession.producer === producer;

          if (!previousIsTerminal && !sameProducerNeedsAttention) {
            throw new Error(COLLECTION_OWNER_CONFLICT_MESSAGE);
          }
          if (typeof producer === "string") {
            const incomingSession = await sessions.get(runId);
            if (incomingSession?.status !== "running") {
              throw new Error(INACTIVE_COLLECTION_RUN_MESSAGE);
            }
          }
          const previousOwnedTab =
            producer === AD_SYNC_PRODUCER ? await getTab(live.tabId) : null;
          const replaceLoginAttentionWindow =
            producer === AD_SYNC_PRODUCER &&
            !isAdvertisingSessionUrl(previousOwnedTab?.url);

          // A fresh explicit retry of the same workflow supersedes its old
          // login/captcha attention session. Keep the authenticated owned tab,
          // but transfer its lifecycle ownership to the new run. Active runs
          // and attention sessions from other producers remain protected.
          if (
            previousSession &&
            typeof sessions.detachTab === "function"
          ) {
            await sessions.detachTab(live.runId, {
              tabId: live.tabId,
              closeManagedTab: false,
            });
          }
          const adopted = { ...live, runId };
          await chromeApi.storage.local.set({ [storageKey]: adopted });
          if (sameProducerNeedsAttention) {
            await sessions.cancel(live.runId);
          }
          if (!replaceLoginAttentionWindow) return adopted;

          // A prior login attention window has no tab-scoped advertising
          // session to preserve. Retire only that extension-owned window, then
          // bootstrap the new run from an authenticated user-tab clone below.
          await removeWindow(live.windowId);
          await clearRecord();
        } else {
          return live;
        }
      }
      if (stored) await clearRecord();

      const window =
        (await createAdvertisingSessionWindow(url, producer)) ||
        (await createOwnedWindow(url));
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

    async function sendTabMessageWhenReady(tabId, message) {
      let lastError = null;
      for (
        let attempt = 1;
        attempt <= CONTENT_SCRIPT_READY_MAX_ATTEMPTS;
        attempt += 1
      ) {
        try {
          return await sendTabMessage(tabId, message);
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

    async function collectionAttempt(runId) {
      if (!sessions || typeof sessions.get !== "function") return 1;
      try {
        const session = await sessions.get(runId);
        const attempt = Number(session?.attempt);
        return Number.isInteger(attempt) && attempt > 0 ? attempt : 1;
      } catch {
        return 1;
      }
    }

    async function runManualSync(tabId, runId, resumeUrl) {
      const attempt = await collectionAttempt(runId);
      try {
        for (
          let busyAttempt = 1;
          busyAttempt <= AD_SYNC_BUSY_MAX_ATTEMPTS;
          busyAttempt += 1
        ) {
          const response = await sendTabMessageWhenReady(tabId, {
            action: "manualSync",
            collectionRunId: runId,
            collectionAttempt: attempt,
          });
          if (
            response?.error !== "ad_sync_already_running" ||
            response?.retryable !== true
          ) {
            return response;
          }
          // The content script rejects a different run/attempt before touching
          // its globals or sessionStorage. Give the prior Promise's finally a
          // bounded chance to release ownership, then retry this exact request.
          if (busyAttempt < AD_SYNC_BUSY_MAX_ATTEMPTS) {
            await wait(AD_SYNC_BUSY_RETRY_MS);
          }
        }
        return {
          success: false,
          error: "ad_sync_already_running",
        };
      } catch (error) {
        if (isNavigationMessageChannelClosed(error)) {
          // 광고센터의 캠페인 상세/대시보드 전환은 document 자체를 다시
          // 로드할 수 있다. 이때 이전 content script의 응답 port가 닫히는
          // 것은 수집 실패가 아니라 sessionStorage 기반 sweep의 재개 신호다.
          // 상세 URL에는 ad-sync hash가 없으므로 그 자리에서 재전송하지 않고
          // 소유 탭을 명시적인 대시보드 URL로 돌린 뒤 이어서 실행한다.
          let progress = null;
          try {
            progress =
              sessions && typeof sessions.get === "function"
                ? (await sessions.get(runId))?.progress || null
                : null;
          } catch {
            // The navigation handoff remains recoverable even if the optional
            // progress projection cannot be read.
          }
          return {
            success: false,
            resumeRequired: true,
            resumeUrl,
            error: errorMessage(error),
            progress,
          };
        }
        return { success: false, error: errorMessage(error) };
      }
    }

    async function collectTarget(runId, target) {
      let tab = await navigate(runId, target.url);
      await waitForTabComplete(tab.tabId);
      await wait(4000);
      let response = await runManualSync(tab.tabId, runId, target.url);

      // 광고 캠페인 sweep가 SPA 상세 화면에서 대시보드 복귀에 실패하면 content
      // script가 unload되기 전에 명시적으로 응답한다. 캠페인 수가 4개보다 많아도
      // 실제 저장/처리 진척이 있는 동안에는 같은 소유 탭과 sessionStorage 상태로
      // 이어간다. 동일 캠페인만 반복하는 DOM/API 오류는 3회 무진척 후 중단한다.
      let resumeProgress = campaignSweepProgress(response);
      let stalledResumeAttempts = 0;
      for (
        let resumeAttempt = 1;
        response?.resumeRequired &&
        resumeAttempt <= MAX_PROGRESSING_RESUME_ATTEMPTS &&
        stalledResumeAttempts < MAX_STALLED_RESUME_ATTEMPTS;
        resumeAttempt += 1
      ) {
        if (await isCancelled(runId)) break;
        const resumeUrl = response.resumeUrl || target.url;
        tab = await navigate(runId, resumeUrl);
        await waitForTabComplete(tab.tabId);
        await wait(2500);
        response = await runManualSync(tab.tabId, runId, target.url);
        const nextProgress = campaignSweepProgress(response);
        if (hasCampaignSweepProgressed(resumeProgress, nextProgress)) {
          stalledResumeAttempts = 0;
        } else {
          stalledResumeAttempts += 1;
        }
        resumeProgress = mergeCampaignSweepProgress(
          resumeProgress,
          nextProgress,
        );
      }

      if (response?.resumeRequired) {
        response = {
          success: false,
          error:
            stalledResumeAttempts >= MAX_STALLED_RESUME_ATTEMPTS
              ? "광고 캠페인 수집이 같은 위치에서 반복되어 중단했습니다."
              : response.error ||
                "광고 대시보드 복귀 재시도 한도를 초과했습니다.",
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
          const owned = await getOrCreate(runId, targets[0].url, producer);
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
            if (await isCancelled(runId)) {
              cancelled = true;
              break;
            }
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
            if (preservesContentProgress && result.success && result.progress) {
              // advertising.ad_sync는 content script가 캠페인 단위 progress를
              // 보고한다. 여기서 URL target 단위 1/1로 덮으면 완료 순간 UI가
              // 11/11 → 1/1로 회귀하므로 content의 terminal snapshot을 유지한다.
              await sessions.progress(runId, result.progress);
            } else if (preservesContentProgress && !result.success) {
              // 실패는 반드시 사유를 남긴다.
              //
              // 예전에는 실패해도 content 의 progress 가 있으면 그걸 그대로 썼고
              // (label 은 마지막 캠페인명), 없으면 두 분기 모두 건너뛰어 progress
              // 를 아예 갱신하지 않았다. sessions.fail() 은 status 만 바꾸므로
              // label 에는 직전 성공 문구("광고 동기화 완료")가 남았다. 웹 UI 는
              // 그 label 을 toast.error 로 띄우기 때문에 사용자는 실패 사유 대신
              // 캠페인 이름이나 완료 문구를 봤다 — 실패가 조용히 성공처럼 보였다.
              // 실제 사유(예: "Collection content script timed out after 1800s")
              // 는 chrome.storage.local 의 batch status 에만 적혔고 웹은 그 키를
              // 읽지 않는다.
              await sessions.progress(runId, {
                ...(result.progress || {}),
                current: index + 1,
                total: targets.length,
                completed,
                failed,
                label: latestError,
              });
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

          if (!cancelled && (await isCancelled(runId))) {
            cancelled = true;
          }
          if (cancelled) {
            attentionRequired = false;
            latestError = null;
            await sessions.cancel(runId);
          } else if (!attentionRequired && failed > 0) {
            await sessions.fail(runId);
          } else if (!attentionRequired) {
            await sessions.succeed(runId);
          }
          // Cancellation may race the terminal transition above. The generic
          // session is the durable fence, so read it once more before writing
          // the separate batch-status projection.
          if (!cancelled && (await isCancelled(runId))) {
            cancelled = true;
            attentionRequired = false;
            latestError = null;
            await sessions.cancel(runId);
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
          let cancelledNow = false;
          try {
            cancelledNow = await isCancelled(runId);
          } catch {
            // The original failure is more actionable than a cancellation
            // status lookup failure.
          }
          if (cancelledNow) {
            try {
              await sessions.cancel(runId);
              await writeStatus({
                runId,
                total: targets.length,
                completed,
                failed,
                current: completed + failed,
                currentError: null,
                status: "cancelled",
                startedAt,
                endedAt: Date.now(),
                cancelled: true,
                error: null,
              });
            } catch {
              // The generic session already fences cancelled runs from later
              // terminal writes.
            }
            notify();
            return {
              success: false,
              completed,
              failed,
              total: targets.length,
              cancelled: true,
              attentionRequired: false,
              runId,
              error: null,
            };
          }

          const message = errorMessage(error);
          let previousProgress = null;
          try {
            previousProgress = (await sessions.get(runId))?.progress || null;
          } catch {
            // Continue with the local counters so the original exception is
            // not replaced by a secondary session lookup failure.
          }
          const failureProgress =
            normalizeProgress(
              {
                current: Math.max(1, completed + failed),
                total: Math.max(1, targets.length),
                completed,
                failed: Math.max(1, failed),
                label: message,
              },
              previousProgress || {},
            ) || {
              current: 1,
              total: Math.max(1, targets.length),
              completed,
              failed: Math.max(1, failed),
              label: message,
            };
          try {
            await sessions.progress(runId, failureProgress);
          } catch {
            // Batch status below is the fallback diagnostic channel.
          }
          try {
            await writeStatus({
              runId,
              total: failureProgress.total,
              completed: failureProgress.completed,
              failed: failureProgress.failed,
              current: failureProgress.current,
              currentError: message,
              status: "error",
              startedAt,
              endedAt: Date.now(),
              error: message,
            });
          } catch {
            // Preserve and rethrow the original collection exception.
          }
          try {
            await sessions.fail(runId);
          } catch {
            // Preserve and rethrow the original collection exception.
          }
          notify();
          throw error;
        } finally {
          if (!attentionRequired) await close(runId);
        }
      });
    }

    async function cancelRun(runId) {
      requireCollectionDependencies();
      const stored = await chromeApi.storage.local.get(statusKey);
      const status = stored?.[statusKey] || {};
      const requestedRunId =
        typeof runId === "string" && runId ? runId : status.runId;
      if (!requestedRunId) {
        return { success: true, cancelled: false, runId: null };
      }

      const ownsBatchStatus =
        !status.runId || status.runId === requestedRunId;
      if (ownsBatchStatus) {
        await chromeApi.storage.local.set({
          [cancelKey]: {
            cancelled: true,
            runId: requestedRunId,
            requestedAt: Date.now(),
          },
        });
      }

      // The requested generic session and the extension-owned window are the
      // cancellation authority. A newer run may already have replaced the
      // single batch-status projection; that must not make an older attention
      // session impossible to stop.
      await sessions.cancel(requestedRunId);
      await close(requestedRunId);
      if (ownsBatchStatus) {
        await writeStatus({
          ...status,
          runId: requestedRunId,
          status: "cancelled",
          cancelled: true,
          endedAt: Date.now(),
        });
      }
      notify();
      return { success: true, cancelled: true, runId: requestedRunId };
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
