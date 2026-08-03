(function initializeCollectionWindow(root) {
  "use strict";

  const CONTENT_SCRIPT_TIMEOUT_MS = 30 * 60 * 1000;
  const CONTENT_SCRIPT_READY_MAX_ATTEMPTS = 20;
  const CONTENT_SCRIPT_READY_RETRY_MS = 500;
  const OWNED_RESOURCE_REMOVAL_MAX_ATTEMPTS = 20;
  const OWNED_RESOURCE_REMOVAL_RETRY_MS = 100;
  const AD_SYNC_BUSY_MAX_ATTEMPTS = 20;
  const AD_SYNC_BUSY_RETRY_MS = 500;
  const ADVERTISING_LOGIN_HANDOFF_TIMEOUT_MS = 60 * 1000;
  const PROFITABILITY_REPORT_PATH = "/marketing-reporting/billboard/reports/pa";
  const PROFITABILITY_TARGET_SETTLE_MS = 100;
  const MAX_ADVERTISING_LOGIN_HANDOFF_ATTEMPTS = 3;
  // The ad sweep deliberately returns after bounded 12-date slices so one
  // content-script message never owns the full 31-day roster. Size the lease
  // from the advertised exact-day work total instead of cutting every account
  // off at 500 handoffs, while retaining an absolute infrastructure bound.
  const MIN_PROGRESSING_RESUME_ATTEMPTS = 2_000;
  const MAX_PROGRESSING_RESUME_ATTEMPTS = 50_000;
  const RESUME_ATTEMPTS_PER_WORK_UNIT = 2;
  // One campaign's exact-day collection intentionally revisits the same
  // dashboard/detail edge for its 12 + 12 + 7 day slices. The fourth
  // recurrence without any persisted numeric progress is the first one that
  // cannot be part of that healthy three-slice sequence.
  const MAX_STALLED_RESUME_TRANSITION_VISITS = 4;
  const AD_SYNC_PRODUCER = "advertising.ad_sync";
  const AD_KEYWORD_PRODUCER = "advertising.ad_keyword";
  const COUPANG_ADS_DAILY_PRODUCER = "dashboard.coupang_ads";
  // 광고 성과(dashboard.coupang_ads)와 광고 동기화(advertising.ad_sync)는 둘 다
  // 같은 광고센터 대시보드를 별도의 포커스 없는 수집 창에서 처리한다. 로그인
  // 화면이 뜨면 content script가 이미 채워진 자격증명으로 로그인 버튼을 눌러
  // 진행한다. 아래 producer 판정은 로그인 handoff와 resume URL 경계를 함께
  // 결정한다.
  const ADVERTISING_SESSION_PRODUCERS = new Set([
    AD_SYNC_PRODUCER,
    AD_KEYWORD_PRODUCER,
    COUPANG_ADS_DAILY_PRODUCER,
  ]);
  function isAdvertisingSessionProducer(producer) {
    return ADVERTISING_SESSION_PRODUCERS.has(producer);
  }
  const COLLECTION_OWNER_CONFLICT_MESSAGE =
    "다른 데이터 수집 작업이 확인 대기 중입니다. 기존 작업을 완료하거나 중단한 뒤 다시 시도해주세요.";
  const INACTIVE_COLLECTION_RUN_MESSAGE =
    "이미 중단되거나 종료된 데이터 수집 작업입니다.";
  const COLLECTION_TAB_RECOVERY_FAILED_MESSAGE =
    "collection_window_recovery_failed: 데이터 수집 탭이 반복해서 종료되어 복구하지 못했습니다. 확장프로그램을 새로고침한 뒤 다시 시도해주세요.";

  function collectionWindowError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    error.retryable = details.retryable === true;
    if (typeof details.runId === "string") error.runId = details.runId;
    if (typeof details.stage === "string") error.stage = details.stage;
    return error;
  }

  function advertisingNavigationResumeUrl(currentUrl, dashboardResumeUrl) {
    try {
      const current = new URL(String(currentUrl || ""));
      if (
        current.protocol === "https:" &&
        current.hostname.toLowerCase() === "advertising.coupang.com" &&
        !current.username &&
        !current.password &&
        !current.port &&
        /^\/marketing\/(?:dashboard\/(?:sales|pa)\/)?campaign\/[^/]+(?:\/|$)/i.test(
          current.pathname,
        )
      ) {
        return current.href;
      }
    } catch {
      // Fall back to the fixed dashboard target below.
    }
    return dashboardResumeUrl;
  }

  function parseSafeHttpsUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.port
      )
        ? url
        : null;
    } catch {
      return null;
    }
  }

  function isAllowlistedAdvertisingDetailUrl(value) {
    const url = parseSafeHttpsUrl(value);
    if (
      !url ||
      url.hostname.toLowerCase() !== "advertising.coupang.com"
    ) {
      return false;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    let campaignId = "";
    if (
      segments[0]?.toLowerCase() === "marketing" &&
      segments[1]?.toLowerCase() === "campaign"
    ) {
      campaignId = segments[2] || "";
    } else if (
      segments[0]?.toLowerCase() === "marketing" &&
      segments[1]?.toLowerCase() === "dashboard" &&
      ["sales", "pa"].includes(segments[2]?.toLowerCase()) &&
      segments[3]?.toLowerCase() === "campaign"
    ) {
      campaignId = segments[4] || "";
    }
    return (
      !!campaignId &&
      !/^(?:type|registration|create|new|product|detail|dashboard|sales)$/i.test(
        campaignId,
      )
    );
  }

  function isAllowlistedAdvertisingDashboardUrl(value) {
    const url = parseSafeHttpsUrl(value);
    if (
      !url ||
      url.hostname.toLowerCase() !== "advertising.coupang.com"
    ) {
      return false;
    }
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return (
      pathname.toLowerCase() === "/marketing/dashboard/sales" ||
      pathname.toLowerCase() === "/marketing-reporting/billboard/reports/pa" ||
      pathname.toLowerCase() === "/dashboard"
    );
  }

  function isAllowlistedAdvertisingResumeUrl(value) {
    return (
      isAllowlistedAdvertisingDashboardUrl(value) ||
      isAllowlistedAdvertisingDetailUrl(value)
    );
  }

  function isSameTargetUrlFamily(value, targetValue) {
    const candidate = parseSafeHttpsUrl(value);
    const target = parseSafeHttpsUrl(targetValue);
    if (!candidate || !target || candidate.origin !== target.origin) {
      return false;
    }
    const targetPath = target.pathname.replace(/\/+$/, "") || "/";
    if (targetPath === "/") return true;
    return (
      candidate.pathname === targetPath ||
      candidate.pathname.startsWith(`${targetPath}/`)
    );
  }

  function resolveCollectionResumeUrl(resumeUrl, targetUrl, producer) {
    const hasExplicitResumeUrl =
      typeof resumeUrl === "string" && resumeUrl.trim().length > 0;
    const requestedUrl = hasExplicitResumeUrl ? resumeUrl : targetUrl;
    const allowed = isAdvertisingSessionProducer(producer)
      ? isAllowlistedAdvertisingResumeUrl(requestedUrl)
      : isSameTargetUrlFamily(requestedUrl, targetUrl);
    if (!allowed) {
      throw new Error("Collection resume URL is outside the allowed target family");
    }
    return new URL(requestedUrl).href;
  }

  function sameAbsoluteUrl(left, right) {
    try {
      return new URL(String(left || "")).href === new URL(String(right || "")).href;
    } catch {
      return false;
    }
  }

  function isOfficialProfitabilityReportUrl(value) {
    const url = parseSafeHttpsUrl(value);
    if (!url || url.hostname.toLowerCase() !== "advertising.coupang.com") {
      return false;
    }
    return (url.pathname.replace(/\/+$/, "") || "/") === PROFITABILITY_REPORT_PATH;
  }

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
      dateWorkTotal: toProgressInteger(response?.progress?.total),
      position: campaignSweepResumePosition(response),
    };
  }

  function campaignSweepResumePosition(response) {
    let resumeUrl = "";
    try {
      const parsed = new URL(String(response?.resumeUrl || ""));
      if (
        parsed.protocol === "https:" &&
        parsed.hostname.toLowerCase() === "advertising.coupang.com" &&
        !parsed.username &&
        !parsed.password &&
        !parsed.port
      ) {
        resumeUrl = parsed.href.slice(0, 1000);
      }
    } catch {
      resumeUrl = "";
    }
    const label =
      typeof response?.progress?.label === "string"
        ? response.progress.label.trim().slice(0, 500)
        : "";
    const phase =
      typeof response?.error === "string"
        ? response.error.trim().slice(0, 200)
        : "";
    const key = [resumeUrl, label, phase].join("\u001f");
    return key.replace(/\u001f+$/g, "") || "unknown";
  }

  function campaignSweepResumeTransition(previousPosition, nextPosition) {
    return [
      String(previousPosition || "unknown"),
      String(nextPosition || "unknown"),
    ].join("\u001e");
  }

  function campaignSweepResumeAttemptLimit(progress) {
    const workTotal = toProgressInteger(progress?.dateWorkTotal);
    return Math.min(
      MAX_PROGRESSING_RESUME_ATTEMPTS,
      Math.max(
        MIN_PROGRESSING_RESUME_ATTEMPTS,
        workTotal * RESUME_ATTEMPTS_PER_WORK_UNIT,
      ),
    );
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
      dateWorkTotal: Math.max(
        toProgressInteger(previous.dateWorkTotal),
        toProgressInteger(next.dateWorkTotal),
      ),
      position: next.position || previous.position || "unknown",
    };
  }

  function create(options) {
    const chromeApi = options.chrome;
    const storageKey = options.storageKey;
    const sessions = options.sessions || null;
    const statusKey = options.statusKey || null;
    const cancelKey = options.cancelKey || null;
    const markScraped = options.markScraped || (() => Promise.resolve());
    const bindTab = options.bindTab || (() => Promise.resolve());
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
      // 수집은 별도 창(focused:false)에서 돈다. 이 창의 활성 탭은 사용자가 다른
      // 창을 봐도 visible 로 유지돼 Coupang React 그리드가 스로틀 없이 렌더된다.
      // (현재 창 새 탭 방식은 사용자가 다른 탭을 보면 백그라운드로 밀려 그리드가
      // 렌더되지 않아 report_surface_unverified 로 실패했다.) 사용자 포커스는
      // 뺏지 않고, 로그인 화면은 content script 가 자동 통과한다.
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

      // Re-read both objects at teardown. The user may have moved the managed
      // tab to another window or added a personal tab to the collection window
      // since the record was written. In either case remove only the managed
      // tab; never close a window that now contains unrelated user state.
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
      } else {
        const removalAccepted = await removeTab(record.tabId);
        if (!removalAccepted) {
          return (await getTab(record.tabId)) === null;
        }
        return waitUntilRemoved(() => getTab(record.tabId));
      }
    }

    function isAdvertisingSessionUrl(value) {
      try {
        const url = new URL(value || "");
        return (
          url.origin === "https://advertising.coupang.com" &&
          (url.pathname === "/marketing" ||
            url.pathname.startsWith("/marketing/") ||
            isOfficialProfitabilityReportUrl(url.href) ||
            url.pathname === "/dashboard" ||
            url.pathname.startsWith("/dashboard/"))
        );
      } catch {
        return false;
      }
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
          const previousOwnedTab = isAdvertisingSessionProducer(producer)
            ? await getTab(live.tabId)
            : null;
          const replaceLoginAttentionTab =
            isAdvertisingSessionProducer(producer) &&
            !isAdvertisingSessionUrl(previousOwnedTab?.url);

          // A fresh explicit retry of the same workflow supersedes its old
          // login/captcha attention session. Detach the old tab's lifecycle
          // ownership to the new run. Active runs and attention sessions from
          // other producers remain protected.
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
          if (!replaceLoginAttentionTab) return adopted;

          // 이전 세션이 로그인 화면에서 멈춘 창이면 재사용하지 않고 닫은 뒤,
          // 아래에서 새 수집 창을 연다.
          if (!(await closeOwnedRecord(live))) {
            throw new Error("Collection tab cleanup failed");
          }
          await clearRecord();
        } else {
          return live;
        }
      }
      if (stored) await clearRecord();

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

    async function recoverOwnedWindow(runId, url) {
      const stored = await readRecord();
      const live = await validate(stored);
      if (live) {
        if (live.runId !== runId) {
          throw collectionWindowError(
            "collection_window_owner_conflict",
            COLLECTION_OWNER_CONFLICT_MESSAGE,
            { runId, stage: "validate_owner" },
          );
        }
        return live;
      }
      if (stored) await clearRecord();

      const session = sessions && typeof sessions.get === "function"
        ? await sessions.get(runId)
        : null;
      if (session?.status !== "running") {
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
        if (attached?.status !== "running") {
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

    async function navigate(runId, url) {
      let live = await reattach(runId);
      let recovered = !live;
      if (!live) live = await recoverOwnedWindow(runId, url);
      let tab;
      try {
        tab = await updateTab(live.tabId, { url, active: true });
      } catch (cause) {
        // reattach 가 살아있다고 본 탭이 그 직후 사라질 수 있다(브라우저가 탭을 닫거나
        // 폐기). 예전에는 recovered=false 인 이 경로에 복구가 없어서, 첫 target 을 성공한
        // 뒤 다음 target 으로 넘어가는 순간 "No tab with id: N" 이라는 크롬 원문 오류로
        // run 전체가 끝났다 — 이미 만들어 둔 recoverOwnedWindow 를 쓰지 못한 채였다.
        if (!recovered) {
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
        } else {
          throw collectionWindowError(
            "collection_window_recovery_failed",
            errorMessage(cause),
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
          if (tab.status === "complete") {
            finish(tab);
          }
        });
      });
    }

    async function waitForTabCompleteAtUrl(tabId, expectedUrl, timeoutMs = 180000) {
      const startedAt = Date.now();
      await waitForTabComplete(tabId, timeoutMs);
      while (Date.now() - startedAt <= timeoutMs) {
        const current = await getTab(tabId);
        if (!current?.id) throw new Error("Collection tab was closed");
        if (
          current.status === "complete" &&
          (current.url === expectedUrl || isExternalCoupangAdvertisingLoginUrl(current.url))
        ) {
          return current;
        }
        await wait(100);
      }
      throw new Error("Collection tab navigation timed out");
    }

    function waitForAdvertisingLoginHandoff(
      tabId,
      timeoutMs = ADVERTISING_LOGIN_HANDOFF_TIMEOUT_MS,
    ) {
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
        const acceptDashboard = (tab) => {
          if (
            tab?.id === tabId &&
            tab.status === "complete" &&
            isAllowlistedAdvertisingDashboardUrl(tab.url)
          ) {
            finish(tab);
            return true;
          }
          return false;
        };
        const onUpdated = (updatedTabId, changeInfo, tab) => {
          if (updatedTabId !== tabId) return;
          const nextTab = {
            ...(tab || {}),
            id: updatedTabId,
            status: changeInfo.status || tab?.status,
            url: changeInfo.url || tab?.url,
          };
          acceptDashboard(nextTab);
        };
        const onRemoved = (removedTabId) => {
          if (removedTabId === tabId) {
            finish(null, new Error("Collection tab was closed during advertising login"));
          }
        };
        const timeout = setTimeout(
          () =>
            finish(
              null,
              new Error(
                "쿠팡 광고센터 자동 로그인 후 대시보드 전환을 확인하지 못했습니다.",
              ),
            ),
          timeoutMs,
        );
        chromeApi.tabs.onUpdated.addListener(onUpdated);
        chromeApi.tabs.onRemoved.addListener(onRemoved);
        chromeApi.tabs.get(tabId, (tab) => {
          if (chromeApi.runtime.lastError || !tab?.id) {
            finish(null, new Error("Collection tab was closed during advertising login"));
            return;
          }
          acceptDashboard(tab);
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

    function isExternalCoupangAdvertisingLoginUrl(value) {
      try {
        const url = new URL(value);
        if (url.protocol !== "https:") return false;
        if (url.hostname === "xauth.coupang.com") return true;
        return (
          url.hostname === "advertising.coupang.com" &&
          url.pathname.startsWith("/user/login")
        );
      } catch {
        return false;
      }
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

    async function runManualSync(
      tabId,
      runId,
      resumeUrl,
      environmentId,
      producer,
      operationPayload = null,
    ) {
      const attempt = await collectionAttempt(runId);
      try {
        for (
          let busyAttempt = 1;
          busyAttempt <= AD_SYNC_BUSY_MAX_ATTEMPTS;
          busyAttempt += 1
        ) {
          const message = {
            action: "manualSync",
            collectionRunId: runId,
            collectionAttempt: attempt,
            environmentId,
          };
          if (producer === "advertising.ad_sync") {
            if (operationPayload?.profitabilitySlice) {
              message.syncMode = "profitability_report";
              message.profitabilitySlice = operationPayload.profitabilitySlice;
            } else {
              message.syncMode = "campaign_sweep";
            }
          }
          if (producer === AD_KEYWORD_PRODUCER) {
            message.syncMode = "keyword_sweep";
          }
          const response = await sendTabMessageWhenReady(tabId, message);
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
          // 실제 이동이 허용된 캠페인 상세면 그 문서에서 pending campaign을
          // 이어가고, 그 외에는 원래 대시보드 target에서 재개한다.
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
          let navigationResumeUrl = resumeUrl;
          try {
            // href 없는 캠페인명 클릭은 실제로 상세 document를 새로 로드한다.
            // 그 상세 URL을 버리고 곧바로 dashboard로 돌리면 같은 row를 다시
            // 클릭하는 루프가 된다. 새 content script가 sessionStorage의
            // pending campaign을 이어받도록 정확한 광고센터 상세 URL에서 재개한다.
            const navigatedTab = await waitForTabComplete(tabId);
            navigationResumeUrl = advertisingNavigationResumeUrl(
              navigatedTab?.url || (await getTab(tabId))?.url,
              resumeUrl,
            );
          } catch {
            navigationResumeUrl = resumeUrl;
          }
          return {
            success: false,
            resumeRequired: true,
            resumeUrl: navigationResumeUrl,
            error: errorMessage(error),
            progress,
          };
        }
        return { success: false, error: errorMessage(error) };
      }
    }

    async function runManualSyncWithReceiverRecovery(
      tabId,
      runId,
      resumeUrl,
      environmentId,
      producer,
      operationPayload = null,
    ) {
      let response = await runManualSync(
        tabId,
        runId,
        resumeUrl,
        environmentId,
        producer,
        operationPayload,
      );
      if (!isMissingMessageReceiver(response?.error)) return response;

      const redirectedTab = await getTab(tabId).catch(() => null);
      if (isExternalCoupangAdvertisingLoginUrl(redirectedTab?.url)) {
        return {
          success: false,
          pendingLogin: true,
          error: "쿠팡 광고센터 로그인이 필요합니다.",
        };
      }

      // Reloading an unpacked MV3 extension invalidates content scripts that
      // were already attached to the managed collection tab. Updating that
      // tab to the same URL is a no-op in Chrome, so receiver retries alone
      // can never recover. Reload only this extension-owned tab once, wait for
      // the fresh manifest content script, then retry the exact run command.
      await reloadTab(tabId);
      await waitForTabComplete(tabId);
      await wait(2500);
      response = await runManualSync(
        tabId,
        runId,
        resumeUrl,
        environmentId,
        producer,
        operationPayload,
      );
      return response;
    }

    async function runTargetCommand(
      runId,
      target,
      environmentId,
      producer,
      operationPayload = null,
    ) {
      const isProfitabilityTarget =
        Boolean(operationPayload?.profitabilitySlice) &&
        isOfficialProfitabilityReportUrl(target.url);
      let tab = null;
      if (isProfitabilityTarget) {
        const live = await reattach(runId);
        const current = live ? await getTab(live.tabId) : null;
        if (
          current?.id &&
          current.windowId === live.windowId &&
          isOfficialProfitabilityReportUrl(current.url)
        ) {
          tab = { ...live, url: current.url };
        }
      }
      tab ??= await navigate(runId, target.url);
      await bindTab(tab.tabId, environmentId);
      if (isProfitabilityTarget) {
        await waitForTabCompleteAtUrl(tab.tabId, target.url);
      } else {
        await waitForTabComplete(tab.tabId);
      }
      await wait(isProfitabilityTarget ? PROFITABILITY_TARGET_SETTLE_MS : 4000);
      const response = await runManualSyncWithReceiverRecovery(
        tab.tabId,
        runId,
        target.url,
        environmentId,
        producer,
        operationPayload,
      );
      return { tab, response };
    }

    function targetRecoveryFailure(error, runId, stage) {
      return collectionWindowError(
        "collection_window_recovery_failed",
        `${COLLECTION_TAB_RECOVERY_FAILED_MESSAGE} (${errorMessage(error)})`,
        { runId, stage, retryable: true },
      );
    }

    async function collectTarget(
      runId,
      target,
      environmentId,
      producer,
      operationPayload = null,
    ) {
      let command;
      let targetRecoveryAttempted = false;
      try {
        command = await runTargetCommand(
          runId,
          target,
          environmentId,
          producer,
          operationPayload,
        );
      } catch (error) {
        // Chrome may drop the managed tab after tabs.update succeeds but before
        // waitForTabComplete performs its first tabs.get. The old recovery only
        // covered update/sendMessage, so this gap leaked "No tab with id" and
        // ended a multi-day batch after its first persisted target.
        if (!isMissingCollectionTab(error)) throw error;
        targetRecoveryAttempted = true;
        try {
          command = await runTargetCommand(
            runId,
            target,
            environmentId,
            producer,
            operationPayload,
          );
        } catch (retryError) {
          if (isMissingCollectionTab(retryError)) {
            throw targetRecoveryFailure(
              retryError,
              runId,
              "prepare_replacement",
            );
          }
          throw retryError;
        }
      }

      let { tab, response } = command;
      if (isMissingCollectionTab(response?.error)) {
        if (targetRecoveryAttempted) {
          response = {
            ...response,
            success: false,
            error: `${COLLECTION_TAB_RECOVERY_FAILED_MESSAGE} (${errorMessage(response.error)})`,
          };
        } else {
          // The tab may instead disappear while the content-script command is
          // opening. Replay the whole target preparation once so navigation,
          // environment binding, load confirmation, and command delivery all
          // belong to the replacement tab.
          targetRecoveryAttempted = true;
          try {
            command = await runTargetCommand(
              runId,
              target,
              environmentId,
              producer,
              operationPayload,
            );
            ({ tab, response } = command);
          } catch (retryError) {
            if (isMissingCollectionTab(retryError)) {
              throw targetRecoveryFailure(
                retryError,
                runId,
                "command_replacement",
              );
            }
            throw retryError;
          }
          if (isMissingCollectionTab(response?.error)) {
            response = {
              ...response,
              success: false,
              error: `${COLLECTION_TAB_RECOVERY_FAILED_MESSAGE} (${errorMessage(response.error)})`,
            };
          }
        }
      }

      // 광고 캠페인 sweep가 SPA 상세 화면에서 대시보드 복귀에 실패하면 content
      // script가 unload되기 전에 명시적으로 응답한다. 캠페인 수가 4개보다 많아도
      // 실제 저장/처리 진척이 있는 동안에는 같은 소유 탭과 sessionStorage 상태로
      // 이어간다. 동일 캠페인만 반복하는 DOM/API 오류는 정상적인 12 + 12 + 7
      // 세 번의 detail 방문을 허용한 뒤 네 번째 같은 전이에서 중단한다.
      let resumeProgress = campaignSweepProgress(response);
      let stalledResumeTransitionVisits = 0;
      const stalledResumeTransitions = new Map();
      let loginHandoffAttempts = 0;
      let resumeAttempts = 0;
      let resumeAttemptLimit =
        campaignSweepResumeAttemptLimit(resumeProgress);
      while (
        response?.resumeRequired &&
        resumeAttempts < resumeAttemptLimit &&
        stalledResumeTransitionVisits <
          MAX_STALLED_RESUME_TRANSITION_VISITS
      ) {
        resumeAttempts += 1;
        if (await isCancelled(runId)) break;

        if (response.loginHandoff === true) {
          loginHandoffAttempts += 1;
          if (
            loginHandoffAttempts > MAX_ADVERTISING_LOGIN_HANDOFF_ATTEMPTS
          ) {
            response = {
              success: false,
              pendingLogin: true,
              error:
                "쿠팡 광고센터 자동 로그인 전환이 반복되었습니다. 확인 탭에서 로그인 상태를 확인해주세요.",
            };
            break;
          }

          try {
            // 계정 유형 선택 버튼을 누른 직후 target URL로 덮어쓰면 쿠팡의
            // 로그인 redirect가 취소된다. 현재 탭이 allowlist된 광고 대시보드로
            // 완전히 돌아온 뒤에만 동일 run의 manualSync를 다시 보낸다.
            const authenticatedTab = await waitForAdvertisingLoginHandoff(
              tab.tabId,
            );
            tab = { ...tab, url: authenticatedTab.url };

            // 쿠팡이 callback hash를 보존하지 않은 경우에는 인증 전환이 끝난
            // 뒤에만 원래 target을 복원한다. 일별 광고 성과의 targetDate와 광고
            // 동기화의 kiditemAdSync 모드가 일반 7일 수집으로 바뀌지 않게 한다.
            if (!sameAbsoluteUrl(tab.url, target.url)) {
              tab = await navigate(runId, target.url);
              await waitForTabComplete(tab.tabId);
            }
            await bindTab(tab.tabId, environmentId);
            await wait(2500);
            response = await runManualSyncWithReceiverRecovery(
              tab.tabId,
              runId,
              target.url,
              environmentId,
              producer,
              operationPayload,
            );
            const nextProgress = campaignSweepProgress(response);
            resumeProgress = mergeCampaignSweepProgress(
              resumeProgress,
              nextProgress,
            );
            resumeAttemptLimit = Math.max(
              resumeAttemptLimit,
              campaignSweepResumeAttemptLimit(resumeProgress),
            );
            continue;
          } catch (error) {
            response = {
              success: false,
              pendingLogin: true,
              error:
                errorMessage(error) ||
                "쿠팡 광고센터 로그인을 완료하지 못했습니다.",
            };
            break;
          }
        }

        let resumeUrl;
        try {
          resumeUrl = resolveCollectionResumeUrl(
            response.resumeUrl,
            target.url,
            producer,
          );
        } catch (error) {
          response = {
            success: false,
            error: errorMessage(error),
            progress: response.progress || null,
          };
          break;
        }
        tab = await navigate(runId, resumeUrl);
        await bindTab(tab.tabId, environmentId);
        await waitForTabComplete(tab.tabId);
        await wait(2500);
        response = await runManualSyncWithReceiverRecovery(
          tab.tabId,
          runId,
          target.url,
          environmentId,
          producer,
          operationPayload,
        );
        const nextProgress = campaignSweepProgress(response);
        if (hasCampaignSweepProgressed(resumeProgress, nextProgress)) {
          stalledResumeTransitions.clear();
          stalledResumeTransitionVisits = 0;
        } else {
          const transition = campaignSweepResumeTransition(
            resumeProgress.position,
            nextProgress.position,
          );
          const visits = (stalledResumeTransitions.get(transition) || 0) + 1;
          stalledResumeTransitions.set(transition, visits);
          // Every campaign shares the same dashboard return position. Counting
          // that destination alone makes the third distinct campaign look
          // stuck. A dashboard → detail-B edge is different from dashboard →
          // detail-A, while a real detail-A ↔ dashboard loop repeats the same
          // two edges and remains bounded.
          stalledResumeTransitionVisits = visits;
        }
        resumeProgress = mergeCampaignSweepProgress(
          resumeProgress,
          nextProgress,
        );
        resumeAttemptLimit = Math.max(
          resumeAttemptLimit,
          campaignSweepResumeAttemptLimit(resumeProgress),
        );
      }

      if (response?.resumeRequired) {
        response = {
          success: false,
          error:
            stalledResumeTransitionVisits >=
            MAX_STALLED_RESUME_TRANSITION_VISITS
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
      if (response?.success && target.id) await markScraped(target.id, environmentId);
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
      const {
        runId,
        targets,
        startedAt,
        producer,
        environmentId,
        operationPayload = null,
        retainOwnedWindow = false,
      } = input;
      // Both advertising sweeps report their own campaign/ad-level progress
      // from the content script, so the window must not overwrite it with a
      // per-URL count.
      const preservesContentProgress =
        producer === AD_SYNC_PRODUCER || producer === AD_KEYWORD_PRODUCER;
      return runExclusive(async () => {
        let completed = 0;
        let failed = 0;
        let cancelled = false;
        let attentionRequired = false;
        let retainAfterSuccess = false;
        await chromeApi.storage.local.remove(cancelKey);
        try {
          let owned = await getOrCreate(runId, targets[0].url, producer);
          await bindTab(owned.tabId, environmentId);
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
            const result = await collectTarget(
              runId,
              target,
              environmentId,
              producer,
              operationPayload,
            );
            const liveOwned = await reattach(runId);
            if (liveOwned) owned = liveOwned;
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
          retainAfterSuccess = !cancelled && !attentionRequired && failed === 0;
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
          if (
            !attentionRequired &&
            !(retainOwnedWindow && retainAfterSuccess)
          ) {
            await close(runId);
          }
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

      // The requested generic session and the extension-owned collection tab
      // are the cancellation authority. A newer run may already have replaced
      // the single batch-status projection; that must not make an older
      // attention session impossible to stop.
      await sessions.cancel(requestedRunId);
      const ownedRecord = await readRecord();
      const ownsCollectionTab = ownedRecord?.runId === requestedRunId;
      const collectionTabClosed = await close(requestedRunId);
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
      if (ownsCollectionTab && !collectionTabClosed) {
        return {
          success: false,
          cancelled: true,
          runId: requestedRunId,
          error: "Collection tab cleanup failed",
        };
      }
      return { success: true, cancelled: true, runId: requestedRunId };
    }

    async function close(runId) {
      const stored = await readRecord();
      if (!stored || stored.runId !== runId) return false;
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

  root.KidItemCollectionWindow = Object.freeze({
    advertisingNavigationResumeUrl,
    campaignSweepProgress,
    campaignSweepResumeAttemptLimit,
    campaignSweepResumePosition,
    campaignSweepResumeTransition,
    create,
    hasCampaignSweepProgressed,
    isAllowlistedAdvertisingResumeUrl,
    isSameTargetUrlFamily,
    mergeCampaignSweepProgress,
    normalizeProgress,
    resolveCollectionResumeUrl,
  });
})(globalThis);
