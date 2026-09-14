(function installAdCenterCollector(root) {
  "use strict";

  const SALES_URL = "https://advertising.coupang.com/marketing/dashboard/sales";
  const KEYWORD_URL = `${SALES_URL}#kiditemAdKeyword=1`;
  const CAMPAIGN_URL = `${SALES_URL}#kiditemAdSync=1`;
  const PROFITABILITY_PATH = "/marketing-reporting/billboard/reports/pa";
  const PROFITABILITY_URL = `https://advertising.coupang.com${PROFITABILITY_PATH}`;
  const AD_SYNC_PRODUCER = "advertising.ad_sync";
  const AD_PROFITABILITY_PRODUCER = "advertising.profitability_import";
  const AD_KEYWORD_PRODUCER = "advertising.ad_keyword";
  const AD_PROGRESS_PRODUCERS = new Set([
    AD_SYNC_PRODUCER,
    AD_PROFITABILITY_PRODUCER,
    AD_KEYWORD_PRODUCER,
  ]);
  const MAX_BUSY_ATTEMPTS = 20;
  const LOGIN_HANDOFF_TIMEOUT_MS = 60 * 1000;
  const MAX_LOGIN_HANDOFF_ATTEMPTS = 3;
  const MIN_RESUME_ATTEMPTS = 2_000;
  const MAX_RESUME_ATTEMPTS = 50_000;
  const RESUME_ATTEMPTS_PER_WORK_UNIT = 2;
  const MAX_STALLED_TRANSITION_VISITS = 4;
  const TARGET_SETTLE_MS = 100;
  const NORMAL_TARGET_SETTLE_MS = 4000;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;

  function errorMessage(error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : String(error || "").trim();
    return (message || "Advertising collection failed").slice(0, 500);
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
      label: typeof value.label === "string" ? value.label.slice(0, 300) : null,
    };
  }

  function safeHttpsUrl(value) {
    try {
      const raw = String(value || "");
      const authority = /^https:\/\/([^\/?#]*)/i.exec(raw)?.[1] || "";
      const url = new URL(raw);
      if (url.protocol !== "https:" || url.username || url.password || url.port || authority.includes("@") || authority.includes(":")) {
        return null;
      }
      return url;
    } catch {
      return null;
    }
  }

  function officialProfitabilityReportUrl(value) {
    const url = safeHttpsUrl(value);
    if (!url || url.hostname.toLowerCase() !== "advertising.coupang.com") return false;
    return (url.pathname.replace(/\/+$/, "") || "/") === PROFITABILITY_PATH;
  }

  function expectedProfitabilityReportUrl(value, expectedValue) {
    const candidate = safeHttpsUrl(value);
    const expected = safeHttpsUrl(expectedValue);
    if (
      !candidate ||
      !expected ||
      candidate.origin !== expected.origin ||
      candidate.hash !== expected.hash
    ) return false;
    const candidatePath = candidate.pathname.replace(/\/+$/, "") || "/";
    const expectedPath = expected.pathname.replace(/\/+$/, "") || "/";
    if (candidatePath !== expectedPath || expectedPath !== PROFITABILITY_PATH) return false;
    // The report surface may append this one provider-owned marker. Account
    // overrides, unknown queries and duplicate markers remain rejected.
    return candidate.search === expected.search ||
      (expected.search === "" && candidate.search === "?_cap_client=WING");
  }

  function advertisingDashboardUrl(value) {
    const url = safeHttpsUrl(value);
    if (!url || url.hostname.toLowerCase() !== "advertising.coupang.com") return false;
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return path === "/marketing/dashboard/sales" ||
      path === "/dashboard" ||
      path === PROFITABILITY_PATH;
  }

  function manualCampaignUrl(value) {
    const url = safeHttpsUrl(value);
    if (!url || url.hostname.toLowerCase() !== "advertising.coupang.com") return false;
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return path === "/marketing/dashboard/sales";
  }

  function dateSpan(startDate, endDate) {
    const start = Date.parse(`${startDate}T00:00:00Z`);
    const end = Date.parse(`${endDate}T00:00:00Z`);
    return Number.isFinite(start) && Number.isFinite(end)
      ? Math.round((end - start) / 86_400_000) + 1
      : 0;
  }

  function validManualCampaignControl(control) {
    const plan = control?.plan;
    return plan?.captureMode === "manual_report" &&
      (plan.period === "1d" || plan.period === "7d") &&
      typeof plan.targetUrl === "string" && plan.targetUrl.length <= 2048 &&
      manualCampaignUrl(plan.targetUrl) &&
      Array.isArray(plan.businessDates) && plan.businessDates.length === 1 &&
      DATE.test(plan.startDate || "") && DATE.test(plan.endDate || "") &&
      plan.businessDates[0] === plan.endDate &&
      dateSpan(plan.startDate, plan.endDate) === (plan.period === "1d" ? 1 : 7);
  }

  function normalizedProfitabilitySlice(slice) {
    return {
      sliceId: slice?.sliceId,
      startDate: slice?.startDate || slice?.from,
      endDate: slice?.endDate || slice?.to,
      businessDates: Array.isArray(slice?.businessDates) ? [...slice.businessDates] : [],
    };
  }

  function normalizedProfitabilityAccount(account) {
    return {
      externalAccountId: account?.externalAccountId,
      expectedAdvertiserId: account?.expectedAdvertiserId,
    };
  }

  function advertisingDetailUrl(value) {
    const url = safeHttpsUrl(value);
    if (!url || url.hostname.toLowerCase() !== "advertising.coupang.com") return false;
    const segments = url.pathname.split("/").filter(Boolean);
    const directDetail = segments.length === 4 &&
      segments[0]?.toLowerCase() === "marketing" &&
      segments[1]?.toLowerCase() === "campaign" &&
      segments[3]?.toLowerCase() === "product";
    const directGroupDetail = segments.length === 6 &&
      segments[0]?.toLowerCase() === "marketing" &&
      segments[1]?.toLowerCase() === "campaign" &&
      segments[3]?.toLowerCase() === "group" &&
      segments[5]?.toLowerCase() === "product" &&
      segments[2] !== "" && segments[4] !== "";
    const dashboardDetail = segments.length === 8 &&
      segments[0]?.toLowerCase() === "marketing" &&
      segments[1]?.toLowerCase() === "dashboard" &&
      segments[2]?.toLowerCase() === "sales" &&
      segments[3]?.toLowerCase() === "campaign" &&
      segments[5]?.toLowerCase() === "group" &&
      segments[7]?.toLowerCase() === "product" &&
      segments[4] !== "" && segments[6] !== "";
    const campaignId = directDetail || directGroupDetail ? segments[2] : dashboardDetail ? segments[4] : "";
    return (directDetail || directGroupDetail || dashboardDetail) &&
      !!campaignId &&
      !/^(?:type|registration|create|new|product|detail|dashboard|sales)$/i.test(campaignId);
  }

  function advertisingResumeUrl(value) {
    return advertisingDashboardUrl(value) || advertisingDetailUrl(value);
  }

  function campaignNavigationResumeUrl(currentUrl, dashboardUrl) {
    return advertisingDetailUrl(currentUrl) ? new URL(currentUrl).href : dashboardUrl;
  }

  function resolveCampaignResumeUrl(resumeUrl, targetUrl) {
    const requested = typeof resumeUrl === "string" && resumeUrl.trim() ? resumeUrl : targetUrl;
    if (!advertisingResumeUrl(requested)) {
      throw new Error("Collection resume URL is outside the advertising target family");
    }
    return new URL(requested).href;
  }

  function sameAbsoluteUrl(left, right) {
    try {
      return new URL(String(left || "")).href === new URL(String(right || "")).href;
    } catch {
      return false;
    }
  }

  function externalLoginUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" &&
        (url.hostname.toLowerCase() === "xauth.coupang.com" ||
          (url.hostname.toLowerCase() === "advertising.coupang.com" && url.pathname.startsWith("/user/login")));
    } catch {
      return false;
    }
  }

  function missingTab(error) {
    return /No tab with id:|Collection tab was closed|tab was closed/i.test(errorMessage(error));
  }

  function closedChannel(error) {
    return /message (?:channel|port) closed before a response was received/i.test(errorMessage(error));
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
    let resumeUrl = "";
    try {
      const parsed = new URL(String(response?.resumeUrl || ""));
      if (advertisingResumeUrl(parsed.href)) resumeUrl = parsed.href.slice(0, 1000);
    } catch {}
    const label = typeof response?.progress?.label === "string"
      ? response.progress.label.trim().slice(0, 300)
      : "";
    const phase = typeof response?.error === "string" ? response.error.trim().slice(0, 200) : "";
    return {
      synced,
      processed: synced + failed,
      totalRows: toProgressInteger(response?.totalRows),
      dateWorkUnits: toProgressInteger(response?.progress?.current),
      dateWorkTotal: toProgressInteger(response?.progress?.total),
      position: [resumeUrl, label, phase].join("\u001f").replace(/\u001f+$/g, "") || "unknown",
    };
  }

  function campaignResumeAttemptLimit(progress) {
    const workTotal = toProgressInteger(progress?.dateWorkTotal);
    return Math.min(
      MAX_RESUME_ATTEMPTS,
      Math.max(MIN_RESUME_ATTEMPTS, workTotal * RESUME_ATTEMPTS_PER_WORK_UNIT),
    );
  }

  function mergeCampaignProgress(previous, next) {
    return {
      synced: Math.max(previous.synced, next.synced),
      processed: Math.max(previous.processed, next.processed),
      totalRows: Math.max(previous.totalRows, next.totalRows),
      dateWorkUnits: Math.max(previous.dateWorkUnits, next.dateWorkUnits),
      dateWorkTotal: Math.max(previous.dateWorkTotal, next.dateWorkTotal),
      position: next.position || previous.position || "unknown",
    };
  }

  function progressed(previous, next) {
    return next.synced > previous.synced ||
      next.processed > previous.processed ||
      next.totalRows > previous.totalRows ||
      next.dateWorkUnits > previous.dateWorkUnits;
  }

  function transition(previous, next) {
    return [String(previous || "unknown"), String(next || "unknown")].join("\u001e");
  }

  function create(options = {}) {
    const windowResource = options.window || options.resource;
    const chromeApi = options.chrome || root.chrome;
    const sessions = options.sessions;
    const bindTab = options.bindTab || ((tabId, environmentId) =>
      windowResource?.bindTab?.(tabId, environmentId));
    const statusKey = options.statusKey || null;
    const cancelKey = options.cancelKey || null;
    const notify = options.notify || (() => undefined);
    const wait = options.delay || ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
    if (!windowResource || !sessions) throw new Error("Advertising collector dependencies are required");

    async function storageGet(key) {
      if (!chromeApi?.storage?.local || !key) return null;
      const value = await chromeApi.storage.local.get(key);
      return value?.[key] || null;
    }

    async function writeStatus(value) {
      if (!statusKey || !chromeApi?.storage?.local) return;
      await chromeApi.storage.local.set({ [statusKey]: value });
    }

    function ownershipError(code, message, runId) {
      const error = new Error(message);
      error.code = code;
      error.runId = runId;
      error.cancelled = code === "USER_CANCELLED";
      return error;
    }

    async function ownedSession(attemptId, environmentId, producer) {
      if (typeof sessions?.get !== "function") return null;
      const session = await sessions.get(attemptId).catch(() => null);
      if (!session || session.attemptId !== attemptId ||
        session.environmentId !== environmentId || session.producer !== producer) {
        return null;
      }
      return session;
    }

    async function activeRun(attemptId, environmentId, producer, { clearPrior = true } = {}) {
      const marker = await storageGet(cancelKey);
      if (marker?.cancelled === true && (!marker.runId || marker.runId === attemptId)) {
        throw ownershipError(
          "USER_CANCELLED",
          "Collection was cancelled by the owner.",
          attemptId,
        );
      }
      const session = await ownedSession(attemptId, environmentId, producer);
      if (!session) {
        throw ownershipError(
          "SOURCE_OWNER_UNAVAILABLE",
          "Collection session is no longer owned by this source.",
          attemptId,
        );
      }
      if (typeof sessions.isActive === "function" &&
        !(await sessions.isActive(attemptId, environmentId, producer))) {
        throw ownershipError(
          "USER_CANCELLED",
          "Collection was cancelled by the owner.",
          attemptId,
        );
      }
      if (clearPrior && marker?.cancelled === true && marker.runId && marker.runId !== attemptId) {
        await chromeApi?.storage?.local?.remove?.(cancelKey);
      }
      return session;
    }

    async function reportProgress({ environmentId, attemptId, tabId, progress } = {}) {
      const candidate = await sessions.get(attemptId).catch(() => null);
      if (!AD_PROGRESS_PRODUCERS.has(candidate?.producer)) {
        const error = ownershipError(
          "SOURCE_OWNER_UNAVAILABLE",
          "Collection session is no longer owned by an advertising source.",
          attemptId,
        );
        throw error;
      }
      const session = await activeRun(
        attemptId,
        environmentId,
        candidate.producer,
        { clearPrior: false },
      );
      if (!session || !Number.isInteger(tabId)) {
        throw ownershipError(
          "SOURCE_OWNER_UNAVAILABLE",
          "Collection progress is no longer owned by this source.",
          attemptId,
        );
      }
      const resource = await windowResource.reattach(attemptId).catch(() => null);
      if (!resource || resource.tabId !== tabId) {
        throw ownershipError(
          "SOURCE_OWNER_UNAVAILABLE",
          "Collection progress tab is no longer owned by this source.",
          attemptId,
        );
      }
      const normalized = normalizeProgress(progress, session.progress || {});
      if (!normalized || typeof sessions.progress !== "function") {
        throw ownershipError(
          "SOURCE_OWNER_UNAVAILABLE",
          "Collection progress is unavailable.",
          attemptId,
        );
      }
      const updated = await sessions.progress(attemptId, normalized);
      if (!updated) {
        throw ownershipError(
          "SOURCE_OWNER_UNAVAILABLE",
          "Collection session is no longer active.",
          attemptId,
        );
      }
      return { ignored: false };
    }

    function cancelledResult(runId) {
      return {
        success: false,
        cancelled: true,
        runId,
        errorCode: "USER_CANCELLED",
        error: null,
      };
    }

    async function sourceReuse({ previousRunId, previousSession }) {
      if (!previousSession?.attention || previousSession.producer === undefined) {
        return false;
      }
      const previousRecord = await windowResource.reattach(previousRunId).catch(() => null);
      const previousTab = previousRecord
        ? await windowResource.getTab(previousRecord.tabId).catch(() => null)
        : null;
      // Only source-level attention retries can authorize adoption. Login tabs
      // are replaced rather than reused, while an already authenticated tab is
      // safely adopted by the same producer.
      if (externalLoginUrl(previousTab?.url)) {
        return { reuse: true, closePrevious: true };
      }
      return { reuse: true, closePrevious: false };
    }

    async function getResource(attemptId, url, producer, environmentId) {
      await activeRun(attemptId, environmentId, producer);
      const current = await windowResource.reattach(attemptId).catch(() => null);
      let adoptedPrevious = false;
      const resource = await windowResource.getOrCreate(attemptId, url, {
        reuse: async ({ previousRunId, previousSession }) => {
          if (!previousSession || previousSession.environmentId !== environmentId ||
            previousSession.producer !== producer) return false;
          const decision = await sourceReuse({ previousRunId, previousSession });
          adoptedPrevious = decision?.reuse === true && decision?.closePrevious !== true;
          return decision;
        },
      });
      const newlyOwned = !current && !adoptedPrevious;
      try {
        await activeRun(attemptId, environmentId, producer);
        await bindTab(resource.tabId, environmentId);
        await activeRun(attemptId, environmentId, producer);
        if (typeof sessions.attachTab === "function") {
          const attached = await sessions.attachTab(attemptId, {
            tabId: resource.tabId,
            windowId: resource.windowId,
          });
          if (!attached) throw ownershipError(
            "SOURCE_OWNER_UNAVAILABLE",
            "Collection session is no longer active.",
            attemptId,
          );
        }
        await activeRun(attemptId, environmentId, producer);
        return resource;
      } catch (error) {
        if (newlyOwned) await windowResource.close(attemptId).catch(() => undefined);
        throw error;
      }
    }

    async function waitForLoginHandoff(tabId, timeoutMs = LOGIN_HANDOFF_TIMEOUT_MS) {
      if (!chromeApi?.tabs?.onUpdated || !chromeApi?.tabs?.onRemoved) {
        throw new Error("Advertising login handoff cannot be observed");
      }
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
          error ? reject(error) : resolve(value);
        };
        const accept = (tab) => {
          if (tab?.id === tabId && tab.status === "complete" && advertisingDashboardUrl(tab.url)) {
            finish(tab);
            return true;
          }
          return false;
        };
        const onUpdated = (updatedTabId, changeInfo, tab) => {
          if (updatedTabId !== tabId) return;
          accept({ ...(tab || {}), id: updatedTabId, status: changeInfo.status || tab?.status, url: changeInfo.url || tab?.url });
        };
        const onRemoved = (removedTabId) => {
          if (removedTabId === tabId) finish(null, new Error("Collection tab was closed during advertising login"));
        };
        const timeout = setTimeout(() => finish(null, new Error("쿠팡 광고센터 자동 로그인 후 대시보드 전환을 확인하지 못했습니다.")), timeoutMs);
        chromeApi.tabs.onUpdated.addListener(onUpdated);
        chromeApi.tabs.onRemoved.addListener(onRemoved);
        chromeApi.tabs.get(tabId, (tab) => {
          if (chromeApi.runtime?.lastError || !tab?.id) finish(null, new Error("Collection tab was closed during advertising login"));
          else accept(tab);
        });
      });
    }

    async function waitForReportUrl(tabId, expectedUrl, owner) {
      const { attemptId, environmentId, producer } = owner;
      await activeRun(attemptId, environmentId, producer);
      await windowResource.waitForTabComplete(tabId);
      const startedAt = Date.now();
      while (Date.now() - startedAt <= 180000) {
        await activeRun(attemptId, environmentId, producer);
        const current = await windowResource.getTab(tabId);
        if (!current?.id) throw new Error("Collection tab was closed");
        if (current.status === "complete" &&
          (expectedProfitabilityReportUrl(current.url, expectedUrl) || externalLoginUrl(current.url))) return current;
        await wait(100);
      }
      throw new Error("Collection tab navigation timed out");
    }

    function targetMessage(runId, attempt, environmentId, mode, control, extra = {}) {
      const message = {
        action: "manualSync",
        collectionRunId: runId,
        collectionAttempt: attempt,
        environmentId,
        syncMode: mode,
        ...extra,
      };
      if (mode === "campaign_sweep" || mode === "campaign_manual_report") message.campaignControl = control;
      if (mode === "keyword_sweep") message.keywordControl = control;
      if (mode === "profitability_report") {
        message.profitabilitySlice = normalizedProfitabilitySlice(control.slice);
        if (control.account) message.profitabilityAccount = normalizedProfitabilityAccount(control.account);
      }
      return message;
    }

    async function sendManualSync(tabId, runId, targetUrl, environmentId, mode, control, producer, extra = {}) {
      const message = targetMessage(runId, 1, environmentId, mode, control, extra);
      for (let busyAttempt = 1; busyAttempt <= MAX_BUSY_ATTEMPTS; busyAttempt += 1) {
        await activeRun(runId, environmentId, producer);
        try {
          const response = await windowResource.sendMessageWhenReady(tabId, message);
          if (response?.error !== "ad_sync_already_running" || response?.retryable !== true) return response;
        } catch (error) {
          if (mode === "keyword_sweep" && closedChannel(error)) {
            return { success: false, error: errorMessage(error), errorCode: "SOURCE_OWNER_UNAVAILABLE" };
          }
          if (closedChannel(error)) {
            await activeRun(runId, environmentId, producer);
            let resumeUrl = targetUrl;
            let progress = null;
            try {
              const navigatedTab = await windowResource.waitForTabComplete(tabId);
              const session = await activeRun(runId, environmentId, producer);
              resumeUrl = campaignNavigationResumeUrl(navigatedTab?.url || (await windowResource.getTab(tabId))?.url, targetUrl);
              if (mode === "campaign_sweep") {
                progress = normalizeProgress(session?.progress);
              }
            } catch {}
            return {
              success: false,
              resumeRequired: true,
              resumeUrl,
              error: errorMessage(error),
              ...(progress ? { progress } : {}),
            };
          }
          return { success: false, error: errorMessage(error) };
        }
        if (busyAttempt < MAX_BUSY_ATTEMPTS) await wait(500);
      }
      return { success: false, error: "ad_sync_already_running" };
    }

    async function sendWithReceiverRecovery(tabId, runId, targetUrl, environmentId, mode, control, producer, extra = {}) {
      let response = await sendManualSync(tabId, runId, targetUrl, environmentId, mode, control, producer, extra);
      if (!/Could not establish connection|Receiving end does not exist/i.test(String(response?.error || ""))) return response;
      await activeRun(runId, environmentId, producer);
      const current = await windowResource.getTab(tabId).catch(() => null);
      if (externalLoginUrl(current?.url)) return { success: false, pendingLogin: true, error: "쿠팡 광고센터 로그인이 필요합니다." };
      await windowResource.reloadTab(tabId);
      await windowResource.waitForTabComplete(tabId);
      await wait(2500);
      await activeRun(runId, environmentId, producer);
      return sendManualSync(tabId, runId, targetUrl, environmentId, mode, control, producer, extra);
    }

    async function runTarget(runId, target, environmentId, mode, control, producer, extra = {}) {
      await activeRun(runId, environmentId, producer);
      const isProfitability = mode === "profitability_report";
      let owned;
      if (isProfitability) {
        const live = await windowResource.reattach(runId);
        const current = live ? await windowResource.getTab(live.tabId) : null;
        if (current?.id && current.windowId === live.windowId && expectedProfitabilityReportUrl(current.url, target.url)) {
          owned = { ...live, url: current.url };
        }
      }
      owned ||= await windowResource.navigate(runId, target.url, { environmentId });
      await activeRun(runId, environmentId, producer);
      await bindTab(owned.tabId, environmentId);
      if (isProfitability) await waitForReportUrl(owned.tabId, target.url, { attemptId: runId, environmentId, producer });
      else {
        await windowResource.waitForTabComplete(owned.tabId);
        await activeRun(runId, environmentId, producer);
      }
      await wait(isProfitability ? TARGET_SETTLE_MS : NORMAL_TARGET_SETTLE_MS);
      await activeRun(runId, environmentId, producer);
      return {
        owned,
        response: await sendWithReceiverRecovery(
          owned.tabId,
          runId,
          target.url,
          environmentId,
          mode,
          control,
          producer,
          extra,
        ),
      };
    }

    async function collectTarget(runId, target, environmentId, mode, control, producer, extra = {}) {
      let command;
      let recoveryAttempted = false;
      try {
        command = await runTarget(runId, target, environmentId, mode, control, producer, extra);
      } catch (error) {
        if (!missingTab(error)) throw error;
        if (mode === "keyword_sweep") return { success: false, error: errorMessage(error), errorCode: "SOURCE_OWNER_UNAVAILABLE" };
        recoveryAttempted = true;
        command = await runTarget(runId, target, environmentId, mode, control, producer, extra);
      }
      let { owned, response } = command;
      if (mode === "keyword_sweep" && missingTab(response?.error)) return { success: false, error: response.error, errorCode: "SOURCE_OWNER_UNAVAILABLE" };
      if (missingTab(response?.error) && !recoveryAttempted) {
        recoveryAttempted = true;
        command = await runTarget(runId, target, environmentId, mode, control, producer, extra);
        ({ owned, response } = command);
      }

      let progress = campaignSweepProgress(response);
      let stalledVisits = 0;
      const stalledTransitions = new Map();
      let loginAttempts = 0;
      let resumeAttempts = 0;
      let resumeLimit = campaignResumeAttemptLimit(progress);
      while (mode === "campaign_sweep" && response?.resumeRequired &&
        resumeAttempts < resumeLimit && stalledVisits < MAX_STALLED_TRANSITION_VISITS) {
        resumeAttempts += 1;
        await activeRun(runId, environmentId, producer);
        if (response.loginHandoff === true) {
          loginAttempts += 1;
          if (loginAttempts > MAX_LOGIN_HANDOFF_ATTEMPTS) {
            response = { success: false, pendingLogin: true, error: "쿠팡 광고센터 자동 로그인 전환이 반복되었습니다. 확인 탭에서 로그인 상태를 확인해주세요." };
            break;
          }
          try {
            await activeRun(runId, environmentId, producer);
            const authenticated = await waitForLoginHandoff(owned.tabId);
            owned = { ...owned, url: authenticated.url };
            if (!sameAbsoluteUrl(owned.url, target.url)) {
              owned = await windowResource.navigate(runId, target.url, { environmentId });
              await activeRun(runId, environmentId, producer);
              await windowResource.waitForTabComplete(owned.tabId);
            }
            await activeRun(runId, environmentId, producer);
            await bindTab(owned.tabId, environmentId);
            await wait(2500);
            await activeRun(runId, environmentId, producer);
            response = await sendWithReceiverRecovery(owned.tabId, runId, target.url, environmentId, mode, control, producer, extra);
          } catch (error) {
            response = { success: false, pendingLogin: true, error: errorMessage(error) };
            break;
          }
          const next = campaignSweepProgress(response);
          progress = mergeCampaignProgress(progress, next);
          resumeLimit = Math.max(resumeLimit, campaignResumeAttemptLimit(progress));
          continue;
        }
        await activeRun(runId, environmentId, producer);
        let resumeUrl;
        try {
          resumeUrl = resolveCampaignResumeUrl(response.resumeUrl, target.url);
        } catch (error) {
          response = { success: false, error: errorMessage(error), progress: response.progress || null };
          break;
        }
        owned = await windowResource.navigate(runId, resumeUrl, { environmentId });
        await activeRun(runId, environmentId, producer);
        await bindTab(owned.tabId, environmentId);
        await windowResource.waitForTabComplete(owned.tabId);
        await activeRun(runId, environmentId, producer);
        await wait(2500);
        await activeRun(runId, environmentId, producer);
        response = await sendWithReceiverRecovery(owned.tabId, runId, target.url, environmentId, mode, control, producer, extra);
        const next = campaignSweepProgress(response);
        if (progressed(progress, next)) {
          stalledTransitions.clear();
          stalledVisits = 0;
        } else {
          const key = transition(progress.position, next.position);
          const visits = (stalledTransitions.get(key) || 0) + 1;
          stalledTransitions.set(key, visits);
          stalledVisits = visits;
        }
        progress = mergeCampaignProgress(progress, next);
        resumeLimit = Math.max(resumeLimit, campaignResumeAttemptLimit(progress));
      }
      if (response?.resumeRequired) {
        response = {
          success: false,
          error: stalledVisits >= MAX_STALLED_TRANSITION_VISITS
            ? "광고 캠페인 수집이 같은 위치에서 반복되어 중단했습니다."
            : response.error || "광고 대시보드 복귀 재시도 한도를 초과했습니다.",
          progress: response.progress || null,
        };
      }
      const message = String(response?.error || response?.reason || "");
      const attentionRequired = response?.pendingLogin === true || /로그인|captcha|보안문자/i.test(message);
      return {
        success: !!response?.success,
        response: response || null,
        type: response?.type || "unknown",
        count: response?.count || 0,
        errorCode: response?.errorCode,
        attentionRequired,
        reason: attentionRequired ? (/captcha|보안문자/i.test(message) ? "captcha" : "marketplace_login") : null,
        progress: normalizeProgress(response?.progress),
        error: response?.error || response?.reason,
      };
    }

    async function publishProgress(runId, value) {
      if (!sessions || typeof sessions.progress !== "function") return;
      const previous = await sessions.get(runId).catch(() => null);
      const normalized = normalizeProgress(value, previous?.progress || {});
      if (normalized) await sessions.progress(runId, normalized);
    }

    // The source owner holds the collection window's turn for its whole
    // attempt, so a capture runs inside that turn instead of taking another.
    async function collectSingle({ environmentId, attemptId, control, producer, target, mode, extra = {}, receiptKey = null }) {
      let owned;
      let result;
      try {
        await activeRun(attemptId, environmentId, producer);
        owned = await getResource(attemptId, target.url, producer, environmentId);
        await writeStatus({ runId: attemptId, status: "running", current: 1, total: 1, currentTabId: owned.tabId, startedAt: Date.now() });
        result = await collectTarget(attemptId, target, environmentId, mode, control, producer, extra);
        if (result.progress) await publishProgress(attemptId, result.progress);
        await writeStatus({ runId: attemptId, status: result.attentionRequired ? "attention_required" : (result.success ? "running" : "error"), current: 1, total: 1, completed: result.success ? 1 : 0, failed: result.success ? 0 : 1, currentTabId: owned.tabId, error: result.success ? null : result.error });
        notify();
        return {
          ...result,
          runId: attemptId,
          receipt: receiptKey ? result.response?.[receiptKey] || null : null,
        };
      } catch (error) {
        if (error?.code === "USER_CANCELLED") {
          await writeStatus({ runId: attemptId, status: "cancelled", cancelled: true, endedAt: Date.now() });
          notify();
          return cancelledResult(attemptId);
        }
        if (error?.code === "SOURCE_OWNER_UNAVAILABLE" && owned) {
          await windowResource.close(attemptId).catch(() => undefined);
        }
        const message = errorMessage(error);
        if (owned) await writeStatus({ runId: attemptId, status: "error", current: 1, total: 1, completed: 0, failed: 1, currentTabId: owned.tabId, error: message });
        notify();
        throw error;
      }
    }

    async function collectCampaigns({ environmentId, attemptId, control }) {
      const manual = control?.plan?.captureMode === "manual_report";
      const targetUrl = manual ? control?.plan?.targetUrl : CAMPAIGN_URL;
      if (typeof targetUrl !== "string" || (manual && !validManualCampaignControl(control))) {
        throw new Error("광고 캠페인 target URL이 유효하지 않습니다.");
      }
      return collectSingle({
        environmentId,
        attemptId,
        control,
        producer: AD_SYNC_PRODUCER,
        target: { id: null, label: manual ? `광고 리포트 ${control.plan.startDate} ~ ${control.plan.endDate}` : "광고 캠페인", url: targetUrl },
        mode: manual ? "campaign_manual_report" : "campaign_sweep",
        receiptKey: "campaignReceipt",
      });
    }

    async function collectKeywords({ environmentId, attemptId, control }) {
      return collectSingle({
        environmentId,
        attemptId,
        control,
        producer: AD_KEYWORD_PRODUCER,
        target: { id: null, label: "광고 키워드", url: KEYWORD_URL },
        mode: "keyword_sweep",
        receiptKey: "keywordReceipt",
      });
    }

    async function collectProfitabilitySlice({ environmentId, attemptId, account, slice }) {
      const control = { account, slice };
      const result = await collectSingle({
        environmentId,
        attemptId,
        control,
        producer: AD_PROFITABILITY_PRODUCER,
        target: { id: null, label: "상품별 광고 보고서", url: PROFITABILITY_URL },
        mode: "profitability_report",
        receiptKey: "profitabilityReceipt",
      });
      if (result.attentionRequired) return { success: false, attentionRequired: true, reason: result.reason || "marketplace_login", error: result.error || "Coupang advertising login is required." };
      if (!result.success || !result.receipt) return { success: false, error: result.error || "Advertising profitability collection failed." };
      return { success: true, receipt: result.receipt };
    }

    async function cancelRun(input) {
      if (!input || typeof input !== "object" || Array.isArray(input) ||
        typeof input.attemptId !== "string" || !input.attemptId.trim()) {
        throw new Error("Collection attempt ID is required");
      }
      const runId = input.attemptId;
      if (cancelKey && chromeApi?.storage?.local) {
        await chromeApi.storage.local.set({ [cancelKey]: { cancelled: true, runId, requestedAt: Date.now() } });
      }
      return { success: true, cancelled: true, runId };
    }

    return Object.freeze({
      cancelRun,
      collectCampaigns,
      collectKeywords,
      collectProfitabilitySlice,
      reportProgress,
    });
  }

  root.KidItemAdCenterCollector = Object.freeze({
    create,
  });
})(globalThis);
