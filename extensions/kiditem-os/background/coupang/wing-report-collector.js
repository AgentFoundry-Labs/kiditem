(function installWingReportCollector(root) {
  "use strict";

  const WING_TRAFFIC_URL = "https://wing.coupang.com/tenants/business-insight/sales-analysis";
  const WING_ITEMWINNER_PATH = "/tenants/seller-price-management";
  const WING_TRAFFIC_PRODUCER = "dashboard.wing_sales";
  const WING_ITEMWINNER_PRODUCER = "dashboard.wing_kpi";
  const NORMAL_TARGET_SETTLE_MS = 4000;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;

  function errorMessage(error) {
    const message = error instanceof Error && error.message
      ? error.message
      : String(error || "").trim();
    return (message || "Wing collection failed").slice(0, 500);
  }

  function safeWingUrl(value) {
    try {
      const raw = String(value || "");
      const authority = /^https:\/\/([^\/?#]*)/i.exec(raw)?.[1] || "";
      const url = new URL(raw);
      if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "wing.coupang.com" ||
        url.username || url.password || url.port || authority.includes("@") || authority.includes(":")) return null;
      return url;
    } catch {
      return null;
    }
  }

  function isWingUrl(value, pathPattern) {
    const url = safeWingUrl(value);
    return !!url && pathPattern.test(url.pathname);
  }

  function trafficUrl(control) {
    const plan = control?.plan || {};
    const target = plan.targetUrl ||
      `${WING_TRAFFIC_URL}?start_date=${plan.startDate}&end_date=${plan.endDate}`;
    let url;
    try {
      url = new URL(target);
    } catch {
      throw new Error("Wing 매출분석 URL이 유효하지 않습니다.");
    }
    if (!isWingUrl(target, /\/tenants\/business-insight\/sales-analysis$/i)) {
      throw new Error("Wing 매출분석 페이지가 아닙니다.");
    }
    const start = url.searchParams.get("start_date") || url.searchParams.get("startDate");
    const end = url.searchParams.get("end_date") || url.searchParams.get("endDate");
    if (!DATE.test(start || "") || !DATE.test(end || "") ||
      (DATE.test(plan.startDate || "") && start !== plan.startDate) ||
      (DATE.test(plan.endDate || "") && end !== plan.endDate)) {
      throw new Error("Wing 매출분석 날짜 범위가 owner 허용 범위를 벗어났습니다.");
    }
    return url.href;
  }

  function itemwinnerUrl(control) {
    const target = control?.plan?.targetUrl;
    if (!isWingUrl(target, new RegExp(`${WING_ITEMWINNER_PATH.replaceAll("/", "\\/")}$`, "i"))) {
      throw new Error("Wing 아이템위너 페이지가 아닙니다.");
    }
    return safeWingUrl(target).href;
  }

  function wingLoginUrl(value) {
    const url = safeWingUrl(value);
    return !!url && /\/login|\/auth|\/oauth/i.test(url.pathname);
  }

  function attentionFrom(response) {
    const message = String(response?.error || response?.reason || "");
    return response?.pendingLogin === true || /로그인|captcha|보안문자/i.test(message);
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
    if (!windowResource || !sessions) throw new Error("Wing collector dependencies are required");

    async function storageGet(key) {
      if (!key || !chromeApi?.storage?.local) return null;
      const stored = await chromeApi.storage.local.get(key);
      return stored?.[key] || null;
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
        session.environmentId !== environmentId || session.producer !== producer) return null;
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

    async function isCancelled(attemptId, environmentId, producer) {
      try {
        await activeRun(attemptId, environmentId, producer, { clearPrior: false });
        return false;
      } catch (error) {
        return error?.code === "USER_CANCELLED" || error?.code === "SOURCE_OWNER_UNAVAILABLE";
      }
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

    async function getResource(attemptId, url, producer, environmentId) {
      await activeRun(attemptId, environmentId, producer);
      const current = await windowResource.reattach(attemptId).catch(() => null);
      let adoptedPrevious = false;
      const resource = await windowResource.getOrCreate(attemptId, url, {
        reuse: async ({ previousRunId, previousSession }) => {
          if (!previousSession?.attention || previousSession.environmentId !== environmentId || previousSession.producer !== producer) return false;
          const previousRecord = await windowResource.reattach(previousRunId).catch(() => null);
          const previousTab = previousRecord
            ? await windowResource.getTab(previousRecord.tabId).catch(() => null)
            : null;
          const closePrevious = wingLoginUrl(previousTab?.url);
          adoptedPrevious = !closePrevious;
          return { reuse: true, closePrevious };
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

    async function capture({ attemptId, environmentId, control, producer, target, mode, receiptKey, resourceRef }) {
      let owned = await getResource(attemptId, target.url, producer, environmentId);
      if (resourceRef) resourceRef.value = owned;
      await writeStatus({ runId: attemptId, status: "running", current: 1, total: 1, currentTabId: owned.tabId, startedAt: Date.now() });
      let response;
      try {
        await activeRun(attemptId, environmentId, producer);
        owned = await windowResource.navigate(attemptId, target.url, { environmentId });
      } catch (error) {
        if (!windowResource.isMissingCollectionTab?.(error)) throw error;
        await activeRun(attemptId, environmentId, producer);
        owned = await windowResource.navigate(attemptId, target.url, { environmentId });
      }
      await activeRun(attemptId, environmentId, producer);
      await bindTab(owned.tabId, environmentId);
      await windowResource.waitForTabComplete(owned.tabId);
      await activeRun(attemptId, environmentId, producer);
      await wait(NORMAL_TARGET_SETTLE_MS);
      await activeRun(attemptId, environmentId, producer);
      const message = {
        action: "manualSync",
        collectionRunId: attemptId,
        collectionAttempt: 1,
        environmentId,
        syncMode: mode,
        ...(mode === "wing_traffic" ? { wingTrafficControl: control } : { wingItemwinnerControl: control }),
      };
      try {
        response = await windowResource.sendMessageWhenReady(owned.tabId, message);
      } catch (error) {
        if (windowResource.isMissingMessageReceiver?.(error)) {
          await activeRun(attemptId, environmentId, producer);
          await windowResource.reloadTab(owned.tabId);
          await windowResource.waitForTabComplete(owned.tabId);
          await activeRun(attemptId, environmentId, producer);
          await wait(2500);
          await activeRun(attemptId, environmentId, producer);
          response = await windowResource.sendMessageWhenReady(owned.tabId, message);
        } else {
          response = { success: false, error: errorMessage(error), errorCode: "SOURCE_OWNER_UNAVAILABLE" };
        }
      }
      await activeRun(attemptId, environmentId, producer);
      const attentionRequired = attentionFrom(response);
      const success = response?.success === true;
      await writeStatus({ runId: attemptId, status: attentionRequired ? "attention_required" : success ? "running" : "error", current: 1, total: 1, completed: success ? 1 : 0, failed: success ? 0 : 1, currentTabId: owned.tabId, error: success ? null : response?.error || null });
      notify();
      return {
        success,
        response: response || null,
        receipt: receiptKey ? response?.[receiptKey] || null : null,
        attentionRequired,
        reason: attentionRequired ? (/captcha|보안문자/i.test(String(response?.error || "")) ? "captcha" : "marketplace_login") : null,
        errorCode: response?.errorCode,
        error: response?.error || response?.reason,
        runId: attemptId,
      };
    }

    // Source owners hold the collection window's turn for their whole attempt,
    // so these captures run inside that turn instead of taking another.
    async function collectTraffic({ environmentId, attemptId, control }) {
      const resourceRef = { value: null };
      try {
        return await capture({
          environmentId,
          attemptId,
          control,
          producer: WING_TRAFFIC_PRODUCER,
          target: { url: trafficUrl(control) },
          mode: "wing_traffic",
          receiptKey: "trafficReceipt",
          resourceRef,
        });
      } catch (error) {
        if (error?.code !== "USER_CANCELLED" && error?.code !== "SOURCE_OWNER_UNAVAILABLE") throw error;
        if (error?.code === "SOURCE_OWNER_UNAVAILABLE") {
          if (resourceRef.value) await windowResource.close(attemptId).catch(() => undefined);
          throw error;
        }
        await writeStatus({ runId: attemptId, status: "cancelled", cancelled: true, endedAt: Date.now() });
        notify();
        return cancelledResult(attemptId);
      }
    }

    async function collectItemwinner({ environmentId, attemptId, control }) {
      const resourceRef = { value: null };
      try {
        return await capture({
          environmentId,
          attemptId,
          control,
          producer: WING_ITEMWINNER_PRODUCER,
          target: { url: itemwinnerUrl(control) },
          mode: "wing_itemwinner",
          receiptKey: "itemwinnerReceipt",
          resourceRef,
        });
      } catch (error) {
        if (error?.code !== "USER_CANCELLED" && error?.code !== "SOURCE_OWNER_UNAVAILABLE") throw error;
        if (error?.code === "SOURCE_OWNER_UNAVAILABLE") {
          if (resourceRef.value) await windowResource.close(attemptId).catch(() => undefined);
          throw error;
        }
        await writeStatus({ runId: attemptId, status: "cancelled", cancelled: true, endedAt: Date.now() });
        notify();
        return cancelledResult(attemptId);
      }
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

    return Object.freeze({ cancelRun, collectItemwinner, collectTraffic });
  }

  root.KidItemWingReportCollector = Object.freeze({ create });
})(globalThis);
