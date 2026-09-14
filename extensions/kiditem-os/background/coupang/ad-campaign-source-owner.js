(function installAdCampaignSourceOwner(root) {
  "use strict";
  const SOURCE_PATH = "/api/ads/ad-campaigns/attempts";
  const PRODUCER = "advertising.ad_sync";
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;

  function canonicalize(value) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("invalid_canonical_json");
      return value;
    }
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, nested]) => [key, canonicalize(nested)]));
    throw new Error("invalid_canonical_json");
  }

  function stableStringify(value) {
    return JSON.stringify(canonicalize(JSON.parse(JSON.stringify(value))));
  }

  async function sha256Hex(value) {
    const bytes = new root.TextEncoder().encode(stableStringify(value));
    const digest = await root.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function parseAction(message, action) {
    if (!message || message.action !== action || Object.keys(message).length !== 2 || !UUID.test(message.attemptId || "")) {
      throw new Error("Invalid advertising campaign source request");
    }
    return { attemptId: message.attemptId };
  }

  function create(options) {
    const active = new Map();
    const wire = root.KidItemSourcingAttemptWire.create({ chrome: options.chrome, sourcePath: SOURCE_PATH,
      requestFailureMessage: "광고 캠페인 owner 요청 실패" });
    const config = environmentId => ({ apiBase: "", headers: { "Content-Type": "application/json" },
      request: (path, init) => options.request(environmentId, path, init) });

    async function isActive(attemptId, environmentId) {
      if (typeof options.sessions.isActive === "function") {
        return options.sessions.isActive(attemptId, environmentId, PRODUCER);
      }
      const session = await options.sessions.getOwned(attemptId, environmentId).catch(() => null);
      return session?.producer === PRODUCER;
    }

    function stoppedOutcome(attemptId) {
      return {
        success: false,
        attemptId,
        terminalState: "RUNNING",
        continuationRequired: false,
        cancellationPending: true,
      };
    }

    async function read(environmentId, attemptId) {
      const value = await wire.requestJsonWithRetry(config(environmentId), `${SOURCE_PATH}/${attemptId}/control`)
        .catch(error => { throw Object.assign(error, { code: !error.status || error.status >= 500 ? "SOURCE_OWNER_UNAVAILABLE" : error.code }); });
      const plan = value?.plan;
      const manual = plan?.captureMode === "manual_report";
      const validManual = manual &&
        (plan.period === "1d" || plan.period === "7d") &&
        typeof plan.targetUrl === "string" && plan.targetUrl.length <= 2048 &&
        validAdvertisingDashboardUrl(plan.targetUrl) &&
        Array.isArray(plan.businessDates) && plan.businessDates.length === 1 &&
        DATE.test(plan.startDate || "") && DATE.test(plan.endDate || "") &&
        plan.businessDates[0] === plan.endDate &&
        dateSpan(plan.startDate, plan.endDate) === (plan.period === "1d" ? 1 : 7);
      const validSweep = plan?.captureMode === "campaign_sweep" &&
        Array.isArray(plan.businessDates) && plan.businessDates.length === 31 &&
        DATE.test(plan.startDate || "") && DATE.test(plan.endDate || "") &&
        dateSpan(plan.startDate, plan.endDate) === 31;
      if (value?.attemptId !== attemptId || !UUID.test(value.attemptToken || "") ||
        !["RUNNING", "COMPLETE", "FAILED"].includes(value.state) ||
        plan?.sourceType !== "coupang_ad_campaign" || plan?.parserVersion !== "ad-campaign-v1" ||
        (!validManual && !validSweep) || typeof plan?.expectedAdvertiserId !== "string" || !plan.expectedAdvertiserId.trim() ||
        value.channelAccountId !== value.plan.channelAccountId || !UUID.test(value.channelAccountId || "") ||
        !Number.isFinite(Date.parse(value.expiresAt)) || !Array.isArray(value.receipts) || !Array.isArray(value.pages) || !Array.isArray(value.campaigns)) {
        throw new Error("광고 캠페인 owner 응답이 일치하지 않습니다");
      }
      const prior = active.get(environmentId)?.control;
      if (prior?.attemptId === attemptId && (prior.attemptToken !== value.attemptToken ||
        prior.expiresAt !== value.expiresAt || JSON.stringify(prior.plan) !== JSON.stringify(value.plan))) {
        throw new Error("광고 캠페인 동결 수집 허가가 변경되었습니다.");
      }
      return value;
    }

    function safeControl(control) {
      const { attemptToken: _privateToken, ...safe } = control;
      return safe;
    }

    function outcome(control) {
      return { success: control.state === "COMPLETE", attemptId: control.attemptId,
        terminalState: control.state, continuationRequired: control.state === "RUNNING",
        ...(control.errorCode ? { errorCode: control.errorCode } : {}),
        ...(control.errorMessage ? { error: control.errorMessage } : {}) };
    }

    async function finish(environmentId, control) {
      const work = active.get(environmentId);
      if (work?.attemptId === control.attemptId) work.terminal = null;
      const session = await options.sessions.getOwned(control.attemptId, environmentId);
      if (control.state === "FAILED" && control.errorCode !== "USER_CANCELLED" && session?.attention) {
        return outcome(control);
      }
      await options.closeAttempt(environmentId, control.attemptId);
      await options.sessions.remove(control.attemptId);
      return outcome(control);
    }

    function terminal(environmentId, work, kind, body) {
      work.terminal ||= { kind, body };
      if (work.terminalPromise) return work.terminalPromise;
      work.terminalPromise = submitTerminal(environmentId, work).finally(() => { work.terminalPromise = null; });
      return work.terminalPromise;
    }

    async function submitTerminal(environmentId, work) {
      try {
        work.control = await read(environmentId, work.attemptId);
        if (work.control.state === "RUNNING" && Date.now() < Date.parse(work.control.expiresAt)) {
          await wire.terminal(config(environmentId), work.control,
            { method: "POST", suffix: "/" + work.terminal.kind, body: work.terminal.body },
            undefined,
            work.terminal.body?.code === "USER_CANCELLED"
              ? {}
              : { shouldContinue: () => isActive(work.attemptId, environmentId) });
        }
      } catch { /* Reconcile an uncertain acknowledgement without changing its intent. */ }
      let observed;
      try { observed = await read(environmentId, work.attemptId); }
      catch { return { ...outcome(work.control || { state: "RUNNING", attemptId: work.attemptId }), continuationRequired: false, errorCode: "SOURCE_OWNER_UNAVAILABLE" }; }
      if (observed.state === "RUNNING") return { ...outcome(observed), continuationRequired: false };
      work.terminal = null;
      return finish(environmentId, observed);
    }

    async function contentStep(message, sender) {
      if (!Number.isInteger(sender?.tab?.id) || (sender.frameId !== undefined && sender.frameId !== 0) ||
        new URL(sender.url || sender.tab.url).origin !== "https://advertising.coupang.com") throw new Error("광고 캠페인 발신 탭이 유효하지 않습니다.");
      const environmentId = await options.environmentForTab(sender.tab.id);
      const work = active.get(environmentId);
      const session = await options.sessions.getOwned(message.attemptId, environmentId);
      if (!work || work.attemptId !== message.attemptId || work.terminal || session?.producer !== PRODUCER) {
        throw new Error("광고 캠페인 탭 소유권이 없습니다.");
      }
      if (!(await isActive(message.attemptId, environmentId))) throw new Error("광고 캠페인 수집이 중단되었습니다.");
      if (await options.ownedTab(environmentId, message.attemptId) !== sender.tab.id) {
        throw new Error("광고 캠페인 탭 소유권이 없습니다.");
      }
      const step = message.step;
      const fields = ["action", "attemptId", "step", ...(step === "receipt" ? ["body"] : [])];
      if (!["resume", "checkpoint", "receipt"].includes(step) || Object.keys(message).some(key => !fields.includes(key))) {
        throw new Error("광고 캠페인 요청이 유효하지 않습니다.");
      }
      if (step === "resume") work.control = await read(environmentId, work.attemptId);
      if (work.terminal || work.control.state !== "RUNNING" || Date.now() >= Date.parse(work.control.expiresAt)) throw new Error("광고 캠페인 시도가 종료되었습니다.");
      if (step === "checkpoint") return { success: true };
      if (step === "resume") return { success: true, control: safeControl(work.control) };
      const body = message.body;
      const bodyFields = {
        dashboard_page: ["pageIndex", "totalPages", "verified", "explicitEmpty", "campaigns"],
        campaign: ["campaignKey", "campaignId", "mode", "payload"],
        campaign_day: ["campaignKey", "businessDate", "payload", "proof"],
        auxiliary_keywords: ["campaignKey", "adGroupId", "groupPlan", "groupResult"],
        manual_report: ["period", "startDate", "endDate", "payload"],
      }[body?.kind];
      if (!bodyFields || typeof body.key !== "string" || !body.key || !Number.isFinite(Date.parse(body.capturedAt)) ||
        body.advertiserId !== work.control.plan.expectedAdvertiserId ||
        Object.keys(body).some(key => !["kind", "key", "advertiserId", "capturedAt", ...bodyFields].includes(key))) {
        throw new Error("광고 캠페인 receipt가 유효하지 않습니다.");
      }
      if (work.control.plan.captureMode === "manual_report" &&
        (body.kind !== "manual_report" || body.period !== work.control.plan.period ||
          body.startDate !== work.control.plan.startDate || body.endDate !== work.control.plan.endDate ||
          !body.payload || body.payload.startDate !== work.control.plan.startDate ||
          body.payload.endDate !== work.control.plan.endDate || body.payload.url !== work.control.plan.targetUrl)) {
        throw new Error("광고 캠페인 manual report 범위가 동결 허가와 일치하지 않습니다.");
      }
      if (work.control.plan.captureMode !== "manual_report" && body.kind === "manual_report") {
        throw new Error("광고 캠페인 sweep에는 manual report receipt를 보낼 수 없습니다.");
      }
      const existing = work.control.receipts.find(receipt => receipt.key === body.key);
      const sequence = existing?.sequence ?? work.control.receipts.length;
      const expectedChecksum = await sha256Hex(body);
      let ack;
      try {
        ack = await wire.terminal(
          config(environmentId),
          work.control,
          { method: "PUT", suffix: "/receipts/" + sequence, body },
          undefined,
          { shouldContinue: () => isActive(work.attemptId, environmentId) },
        );
      } catch (error) {
        if (error.status && error.status < 500) throw error;
        work.control = await read(environmentId, work.attemptId);
        const receipt = work.control.receipts.find(value => value.sequence === sequence && value.key === body.key && value.kind === body.kind);
        if (!receipt || receipt.checksum !== expectedChecksum) throw Object.assign(error, { code: "SOURCE_OWNER_UNAVAILABLE" });
        ack = { ...work.control, receipt };
      }
      if (ack?.attemptId !== work.attemptId || !["RUNNING", "COMPLETE", "FAILED"].includes(ack.state)) throw new Error("광고 캠페인 receipt 응답이 일치하지 않습니다.");
      const { receipt, ...attempt } = ack;
      work.control = { ...work.control, ...attempt };
      if (ack.state !== "RUNNING") throw Object.assign(new Error(ack.errorMessage || "광고 캠페인 시도가 종료되었습니다."), { code: ack.errorCode });
      if (!receipt || receipt.sequence !== sequence || receipt.key !== body.key || receipt.kind !== body.kind || receipt.checksum !== expectedChecksum) {
        throw Object.assign(new Error("광고 캠페인 receipt 응답이 일치하지 않습니다."), { code: "SOURCE_OWNER_UNAVAILABLE" });
      }
      if (!work.control.receipts.some(value => value.sequence === sequence)) {
        work.control.receipts.push(receipt);
        if (body.kind === "dashboard_page") work.control.pages.push(body);
        if (body.kind === "campaign") {
          const { payload: _rows, ...campaign } = body;
          work.control.campaigns.push(campaign);
        }
      }
      return { success: true, receipt, manifestChecksum: ack.manifestChecksum };
    }

    function handleMessage(message, sender, sendResponse) {
      if (message?.action !== "advertisingCampaignSourceStep") return false;
      contentStep(message, sender).then(sendResponse).catch(error => sendResponse({ success: false,
        errorCode: error.code === "SOURCE_OWNER_UNAVAILABLE" || error.code === "SOURCE_OWNER_REQUEST_FAILED" && (!error.status || error.status >= 500)
          ? "SOURCE_OWNER_UNAVAILABLE" : "SOURCE_RECEIPT_REJECTED",
        error: error.message }));
      return true;
    }

    async function execute(environmentId, attemptId) {
      const existingSession = await options.sessions.getOwned(attemptId, environmentId).catch(() => null);
      if (existingSession && !(await isActive(attemptId, environmentId))) return stoppedOutcome(attemptId);
      const control = await read(environmentId, attemptId);
      if (control.state !== "RUNNING") return finish(environmentId, control);
      if (Date.now() >= Date.parse(control.expiresAt)) throw new Error("광고 캠페인 수집 허가가 만료되었습니다.");
      for (const previous of await options.sessions.list(environmentId)) {
        if (previous.producer !== PRODUCER || previous.attemptId === attemptId) continue;
        if (!(await attemptEnded(environmentId, previous.attemptId))) throw new Error("다른 광고 캠페인 수집이 진행 중입니다.");
        await options.closeAttempt(environmentId, previous.attemptId);
        await options.sessions.remove(previous.attemptId);
      }
      const work = active.get(environmentId);
      work.control = control;
      if (work.terminal) return terminal(environmentId, work);
      await options.sessions.start({ attemptId, environmentId, producer: PRODUCER });
      if (!(await isActive(attemptId, environmentId))) return stoppedOutcome(attemptId);
      let collected;
      try { collected = await options.collect({ environmentId, attemptId, control: safeControl(control) }); }
      catch (error) { collected = { success: false, error: error.message, errorCode: error.code }; }
      if (!(await isActive(attemptId, environmentId))) return stoppedOutcome(attemptId);
      if (work.terminal) return terminal(environmentId, work);
      let observed;
      try { observed = await read(environmentId, attemptId); }
      catch { return { ...outcome(control), errorCode: "SOURCE_OWNER_UNAVAILABLE" }; }
      if (observed.state !== "RUNNING") return finish(environmentId, observed);
      work.control = observed;
      if (!collected?.success && collected?.errorCode !== "SOURCE_OWNER_UNAVAILABLE") {
        if (collected?.attentionRequired) await options.sessions.requireAttention(attemptId, {
          reason: collected.reason || "marketplace_login", message: collected.error || "광고센터 로그인이 필요합니다.",
        });
        return terminal(environmentId, work, "fail", wire.failure(
          { code: collected?.errorCode, message: collected?.error }, "AD_CAMPAIGN_COLLECTION_FAILED", "광고 캠페인 수집 실패"));
      }
      if (collected?.success && collected.receipt?.complete) {
        return terminal(environmentId, work, "complete", { manifestChecksum: observed.manifestChecksum });
      }
      await options.closeAttempt(environmentId, attemptId);
      return outcome(observed);
    }

    function run({ environmentId, attemptId }) {
      const running = active.get(environmentId);
      if (running) {
        if (running.attemptId !== attemptId) throw new Error("다른 광고 캠페인 수집이 진행 중입니다.");
        if (running.promise) return running.promise;
      }
      const work = running || { attemptId };
      work.promise = Promise.resolve().then(() => takeWindowTurn(environmentId, () => execute(environmentId, attemptId)))
        .finally(() => {
          work.promise = null;
          // A settled run releases the environment even when its terminal report
          // was not acknowledged. Only a terminal report still in flight keeps
          // it; a server attempt that is still running is refused by the next
          // run's previous-session check.
          if (active.get(environmentId) === work && !work.terminalPromise) active.delete(environmentId);
        });
      active.set(environmentId, work);
      return work.promise;
    }

    async function cancel({ environmentId, attemptId }) {
      const running = active.get(environmentId);
      if (running && running.attemptId !== attemptId) throw new Error("다른 광고 캠페인 수집이 진행 중입니다.");
      const work = running || { attemptId };
      active.set(environmentId, work);
      try {
        return await terminal(environmentId, work, "fail", { code: "USER_CANCELLED", message: "사용자가 광고 캠페인 수집을 중단했습니다." });
      } finally {
        if (!work.promise && !work.terminalPromise && active.get(environmentId) === work) active.delete(environmentId);
      }
    }

    async function recover(environmentId) {
      if (active.has(environmentId)) return;
      for (const session of await options.sessions.list(environmentId)) {
        if (session.producer !== PRODUCER) continue;
        if (!(await isActive(session.attemptId, environmentId))) continue;
        const owner = await read(environmentId, session.attemptId);
        if (owner.state !== "RUNNING") await finish(environmentId, owner);
      }
    }
    // A run holds the environment's collection window from its first read until
    // its outcome is reported and its window and session are released.
    function takeWindowTurn(environmentId, operation) {
      return typeof options.takeWindowTurn === "function"
        ? options.takeWindowTurn(environmentId, operation)
        : operation();
    }

    // Completed, failed and expired attempts have ended, and so has one the owner
    // no longer knows (404); a session left behind by any of them is a leftover
    // for the next collection to clear. Any other read failure stays unknown.
    async function attemptEnded(environmentId, attemptId) {
      let control;
      try {
        control = await read(environmentId, attemptId);
      } catch (error) {
        if (error?.status === 404) return true;
        throw error;
      }
      return control.state !== "RUNNING" || Date.now() >= Date.parse(control.expiresAt);
    }

    return Object.freeze({ run, recover, handleMessage, cancel, attemptEnded });
  }

  function validAdvertisingDashboardUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname.toLowerCase() === "advertising.coupang.com" &&
        /\/marketing\/dashboard\/sales/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  function dateSpan(startDate, endDate) {
    const start = Date.parse(`${startDate}T00:00:00Z`);
    const end = Date.parse(`${endDate}T00:00:00Z`);
    return Number.isFinite(start) && Number.isFinite(end)
      ? Math.round((end - start) / 86_400_000) + 1
      : 0;
  }

  root.KidItemAdCampaignSourceOwner = Object.freeze({ create, parseAction });
})(globalThis);
