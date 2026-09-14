(function installWingTrafficSourceOwner(root) {
  "use strict";

  const SOURCE_PATH = "/api/ads/traffic";
  const PRODUCER = "dashboard.wing_sales";
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;

  function canonicalize(value) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("invalid_canonical_json");
      return value;
    }
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, nested]) => [key, canonicalize(nested)]));
    }
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
    if (!message || message.action !== action || Object.keys(message).length !== 2 ||
      !UUID.test(message.attemptId || "")) {
      throw new Error("Invalid Wing traffic source request");
    }
    return { attemptId: message.attemptId };
  }

  function safeControl(control) {
    if (!control || typeof control !== "object") return control;
    const { attemptToken: _privateToken, ...safe } = control;
    return safe;
  }

  function outcome(control) {
    const attempt = control || {};
    return {
      success: attempt.state === "COMPLETE",
      attemptId: attempt.attemptId,
      terminalState: attempt.state,
      continuationRequired: attempt.state === "RUNNING",
      ...(attempt.errorCode ? { errorCode: attempt.errorCode } : {}),
      ...(attempt.errorMessage ? { error: attempt.errorMessage } : {}),
    };
  }

  function isPlainRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function expectedPageList(pageIndex) {
    return Array.from({ length: pageIndex }, (_, index) => index + 1);
  }

  function validProof(proof, pageIndex, dataLength) {
    if (!isPlainRecord(proof) || !Number.isInteger(proof.expectedPages) ||
      proof.expectedPages < pageIndex || proof.expectedPages > 100 ||
      !Array.isArray(proof.visitedPages) || proof.visitedPages.length !== pageIndex ||
      proof.visitedPages.some((page, index) => page !== index + 1) ||
      proof.verified !== true || typeof proof.terminalPageObserved !== "boolean" ||
      typeof proof.complete !== "boolean") return false;
    const final = pageIndex === proof.expectedPages;
    if (final !== proof.complete || final !== proof.terminalPageObserved) return false;
    if (proof.explicitEmpty === true && (dataLength > 0 || pageIndex !== 1 || proof.expectedPages !== 1)) return false;
    return Object.keys(proof).every((key) => [
      "expectedPages", "visitedPages", "terminalPageObserved", "verified", "complete", "explicitEmpty",
    ].includes(key));
  }

  function validReceipt(body, plan, expectedSequence) {
    if (!isPlainRecord(body) || Object.keys(body).some((key) => ![
      "key", "capturedAt", "url", "startDate", "endDate", "period", "pageIndex", "proof", "data", "kpis", "summary", "adSummary",
    ].includes(key))) return false;
    if (typeof body.key !== "string" || !body.key || body.key.length > 160 ||
      typeof body.capturedAt !== "string" || !Number.isFinite(Date.parse(body.capturedAt)) ||
      typeof body.url !== "string" || body.url.length > 2048 ||
      body.startDate !== plan.startDate || body.endDate !== plan.endDate ||
      body.period !== plan.periodDays || body.pageIndex !== expectedSequence + 1 ||
      !Array.isArray(body.data) || body.data.length > 5000 ||
      body.data.some((row) => !isPlainRecord(row)) || !validProof(body.proof, body.pageIndex, body.data.length)) return false;
    for (const key of ["kpis", "summary"]) if (body[key] !== undefined && !isPlainRecord(body[key])) return false;
    if (body.adSummary !== undefined && body.adSummary !== null && !isPlainRecord(body.adSummary)) return false;
    try {
      const url = new URL(body.url);
      if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "wing.coupang.com" ||
        !/business-insight\/sales-analysis/i.test(url.pathname)) return false;
    } catch {
      return false;
    }
    return true;
  }

  function completeCoverage(control) {
    const receipts = Array.isArray(control?.receipts) ? control.receipts : [];
    const expectedPages = receipts[0]?.expectedPages;
    return Number.isInteger(expectedPages) && expectedPages > 0 &&
      receipts.length === expectedPages &&
      receipts.every((receipt, index) => receipt.sequence === index && receipt.pageIndex === index + 1 &&
        receipt.expectedPages === expectedPages && receipt.terminalPageObserved === (index === expectedPages - 1));
  }

  function create(options) {
    const active = new Map();
    const wire = root.KidItemSourcingAttemptWire.create({
      chrome: options.chrome,
      // Terminal transport composes sourcePath/:attemptId/:terminalAction.
      // Reads remain explicit below because the source status route is not
      // nested under /attempts.
      sourcePath: `${SOURCE_PATH}/attempts`,
      requestFailureMessage: "Wing 트래픽 owner 요청 실패",
    });
    const config = (environmentId) => ({
      apiBase: "",
      headers: { "Content-Type": "application/json" },
      request: (path, init) => options.request(environmentId, path, init),
    });

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
      const value = await wire.requestJsonWithRetry(
        config(environmentId),
        `${SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}/control`,
      ).catch((error) => {
        throw Object.assign(error, {
          code: !error.status || error.status >= 500 ? "SOURCE_OWNER_UNAVAILABLE" : error.code,
        });
      });
      const plan = value?.plan;
      if (value?.attemptId !== attemptId || !UUID.test(value.attemptToken || "") ||
        !["RUNNING", "COMPLETE", "FAILED"].includes(value.state) ||
        plan?.sourceType !== "coupang_wing_traffic" || plan?.parserVersion !== "wing-traffic-v1" ||
        !UUID.test(value.channelAccountId || "") || plan.channelAccountId !== value.channelAccountId ||
        typeof plan.expectedAdvertiserId !== "string" || !plan.expectedAdvertiserId.trim() ||
        !DATE.test(plan.startDate || "") || !DATE.test(plan.endDate || "") ||
        !DATE.test(plan.businessDate || "") || !Number.isInteger(plan.periodDays) || plan.periodDays < 1 || plan.periodDays > 366 ||
        (plan.targetUrl !== null && (typeof plan.targetUrl !== "string" || !/^https?:\/\//i.test(plan.targetUrl))) ||
        !Number.isFinite(Date.parse(value.expiresAt)) || !Array.isArray(value.receipts)) {
        throw new Error("Wing 트래픽 owner 응답이 일치하지 않습니다");
      }
      const prior = active.get(environmentId)?.control;
      if (prior?.attemptId === attemptId &&
        (prior.attemptToken !== value.attemptToken || prior.expiresAt !== value.expiresAt ||
          stableStringify(prior.plan) !== stableStringify(plan))) {
        throw new Error("Wing 트래픽 동결 수집 허가가 변경되었습니다.");
      }
      return value;
    }

    async function finish(environmentId, control) {
      const work = active.get(environmentId);
      if (work?.attemptId === control.attemptId) work.terminal = null;
      const session = await options.sessions.getOwned(control.attemptId, environmentId);
      if (control.state === "FAILED" && control.errorCode !== "USER_CANCELLED" && session?.attention) return outcome(control);
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
      const request = work.terminal;
      try {
        work.control = await read(environmentId, work.attemptId);
        if (work.control.state === "RUNNING" && Date.now() < Date.parse(work.control.expiresAt)) {
          await wire.terminal(config(environmentId), work.control, {
            method: request.kind === "complete" ? "POST" : "POST",
            suffix: request.kind === "complete" ? "/complete" : "/fail",
            body: request.body,
          }, undefined, request.body?.code === "USER_CANCELLED"
            ? {}
            : { shouldContinue: () => isActive(work.attemptId, environmentId) });
        }
      } catch {
        // Reconcile the exact requested terminal body below.
      }
      let observed;
      try { observed = await read(environmentId, work.attemptId); }
      catch {
        return { ...outcome(work.control || { state: "RUNNING", attemptId: work.attemptId }), continuationRequired: false, errorCode: "SOURCE_OWNER_UNAVAILABLE" };
      }
      if (observed.state === "RUNNING") return { ...outcome(observed), continuationRequired: false, errorCode: "SOURCE_OWNER_UNAVAILABLE" };
      if (observed.state === "FAILED" && request.kind === "complete") {
        work.terminal = null;
        return finish(environmentId, observed);
      }
      if (request.kind === "complete" && observed.manifestChecksum !== request.body.manifestChecksum) {
        return { ...outcome(observed), success: false, continuationRequired: false, errorCode: "SOURCE_OWNER_UNAVAILABLE", error: "Wing traffic completion acknowledgement did not match the manifest." };
      }
      if (request.kind === "fail" && (observed.state !== "FAILED" || observed.errorCode !== request.body.code || observed.errorMessage !== request.body.message)) {
        return { ...outcome(observed), success: false, continuationRequired: false, errorCode: "SOURCE_OWNER_UNAVAILABLE", error: "Wing traffic failure acknowledgement did not match the requested body." };
      }
      work.terminal = null;
      return finish(environmentId, observed);
    }

    async function contentStep(message, sender) {
      if (!Number.isInteger(sender?.tab?.id) || (sender.frameId !== undefined && sender.frameId !== 0) ||
        new URL(sender.url || sender.tab.url).origin !== "https://wing.coupang.com") throw new Error("Wing 트래픽 발신 탭이 유효하지 않습니다.");
      const environmentId = await options.environmentForTab(sender.tab.id);
      const work = active.get(environmentId);
      const session = await options.sessions.getOwned(message.attemptId, environmentId);
      if (!work || work.attemptId !== message.attemptId || work.terminal || session?.producer !== PRODUCER) {
        throw new Error("Wing 트래픽 탭 소유권이 없습니다.");
      }
      if (!(await isActive(message.attemptId, environmentId))) throw new Error("Wing 트래픽 수집이 중단되었습니다.");
      if (await options.ownedTab(environmentId, message.attemptId) !== sender.tab.id) {
        throw new Error("Wing 트래픽 탭 소유권이 없습니다.");
      }
      const step = message.step;
      const fields = ["action", "attemptId", "step", ...(step === "receipt" ? ["body"] : [])];
      if (!["resume", "checkpoint", "receipt"].includes(step) || Object.keys(message).some((key) => !fields.includes(key))) throw new Error("Wing 트래픽 요청이 유효하지 않습니다.");
      if (step === "resume") work.control = await read(environmentId, work.attemptId);
      if (!work.control || work.control.state !== "RUNNING" || Date.now() >= Date.parse(work.control.expiresAt)) throw new Error("Wing 트래픽 시도가 종료되었습니다.");
      if (step === "checkpoint") return { success: true };
      if (step === "resume") return { success: true, control: safeControl(work.control) };
      const sequence = Number(message.body?.pageIndex) - 1;
      if (!Number.isSafeInteger(sequence) || sequence < 0 || !validReceipt(message.body, work.control.plan, sequence)) throw new Error("Wing 트래픽 receipt가 유효하지 않습니다.");
      const expectedChecksum = await sha256Hex(message.body);
      const existing = work.control.receipts.find((receipt) => receipt.sequence === sequence);
      if (existing && existing.checksum !== expectedChecksum) {
        throw Object.assign(new Error("Wing 트래픽 receipt가 이미 다른 본문으로 기록되었습니다."), { code: "SOURCE_OWNER_UNAVAILABLE" });
      }
      let ack;
      try {
        ack = await wire.terminal(config(environmentId), work.control, {
          method: "PUT", suffix: `/receipts/${sequence}`, body: message.body,
        });
      } catch (error) {
        if (error.status && error.status < 500) throw error;
        work.control = await read(environmentId, work.attemptId);
        const receipt = work.control.receipts.find((value) => value.sequence === sequence);
        if (!receipt || receipt.key !== message.body.key || receipt.checksum !== expectedChecksum) throw Object.assign(error, { code: "SOURCE_OWNER_UNAVAILABLE" });
        ack = receipt;
      }
      if (!ack || ack.sequence !== sequence || ack.key !== message.body.key || ack.checksum !== expectedChecksum) {
        throw Object.assign(new Error("Wing 트래픽 receipt 응답이 일치하지 않습니다."), { code: "SOURCE_OWNER_UNAVAILABLE" });
      }
      work.control = await read(environmentId, work.attemptId);
      const receipt = work.control.receipts.find((value) => value.sequence === sequence);
      if (!receipt || receipt.sequence !== sequence || receipt.key !== message.body.key || receipt.checksum !== expectedChecksum) {
        throw Object.assign(new Error("Wing 트래픽 receipt 상태가 일치하지 않습니다."), { code: "SOURCE_OWNER_UNAVAILABLE" });
      }
      return { success: true, trafficReceipt: receipt, manifestChecksum: work.control.manifestChecksum, control: safeControl(work.control) };
    }

    function handleMessage(message, sender, sendResponse) {
      if (message?.action !== "wingTrafficSourceStep") return false;
      contentStep(message, sender).then(sendResponse).catch((error) => sendResponse({
        success: false,
        errorCode: error.code === "SOURCE_OWNER_UNAVAILABLE" || (error.code === "SOURCE_OWNER_REQUEST_FAILED" && (!error.status || error.status >= 500)) ? "SOURCE_OWNER_UNAVAILABLE" : "SOURCE_RECEIPT_REJECTED",
        error: error.message,
      }));
      return true;
    }

    async function execute(environmentId, attemptId) {
      const existingSession = await options.sessions.getOwned(attemptId, environmentId).catch(() => null);
      if (existingSession && !(await isActive(attemptId, environmentId))) return stoppedOutcome(attemptId);
      const control = await read(environmentId, attemptId);
      if (control.state !== "RUNNING") return finish(environmentId, control);
      if (Date.now() >= Date.parse(control.expiresAt)) return finish(environmentId, control);
      for (const previous of await options.sessions.list(environmentId)) {
        if (previous.producer !== PRODUCER || previous.attemptId === attemptId) continue;
        let owner;
        try { owner = await read(environmentId, previous.attemptId); } catch { continue; }
        if (owner.state === "RUNNING") throw new Error("다른 Wing 트래픽 수집이 진행 중입니다.");
        await finish(environmentId, owner);
      }
      const work = active.get(environmentId);
      work.control = control;
      await options.sessions.start({ attemptId, environmentId, producer: PRODUCER });
      if (!(await isActive(attemptId, environmentId))) return stoppedOutcome(attemptId);
      let collected;
      try { collected = await options.collect({ environmentId, attemptId, control: safeControl(control) }); }
      catch (error) { collected = { success: false, error: error.message, errorCode: error.code }; }
      if (!(await isActive(attemptId, environmentId))) return stoppedOutcome(attemptId);
      if (work.terminal) return terminal(environmentId, work);
      let observed;
      try { observed = await read(environmentId, attemptId); }
      catch { return { ...outcome(control), continuationRequired: false, errorCode: "SOURCE_OWNER_UNAVAILABLE" }; }
      if (observed.state !== "RUNNING") return finish(environmentId, observed);
      work.control = observed;
      if (!collected?.success && collected?.errorCode !== "SOURCE_OWNER_UNAVAILABLE") {
        if (collected?.attentionRequired) await options.sessions.requireAttention(attemptId, { reason: collected.reason || "marketplace_login", message: collected.error || "Wing 로그인이 필요합니다." });
        return terminal(environmentId, work, "fail", wire.failure({ code: collected?.errorCode, message: collected?.error }, "WING_TRAFFIC_COLLECTION_FAILED", "Wing 트래픽 수집 실패"));
      }
      if (collected?.success && completeCoverage(observed)) return terminal(environmentId, work, "complete", { manifestChecksum: observed.manifestChecksum });
      if (collected?.success || collected?.errorCode === "INCOMPLETE_TRAFFIC_COVERAGE") {
        return terminal(environmentId, work, "fail", wire.failure({ code: "INCOMPLETE_TRAFFIC_COVERAGE", message: collected?.error || "Wing 트래픽 페이지네이션이 완료되지 않았습니다." }, "INCOMPLETE_TRAFFIC_COVERAGE", "Wing 트래픽 페이지네이션이 완료되지 않았습니다."));
      }
      return { ...outcome(observed), continuationRequired: false, errorCode: "SOURCE_OWNER_UNAVAILABLE" };
    }

    function run({ environmentId, attemptId }) {
      const running = active.get(environmentId);
      if (running) {
        if (running.attemptId !== attemptId) throw new Error("다른 Wing 트래픽 수집이 진행 중입니다.");
        if (running.promise) return running.promise;
      }
      const work = running || { attemptId };
      work.promise = Promise.resolve().then(() => takeWindowTurn(environmentId, () => execute(environmentId, attemptId))).finally(() => {
        work.promise = null;
        if (active.get(environmentId) === work && !work.terminal) active.delete(environmentId);
      });
      active.set(environmentId, work);
      return work.promise;
    }

    async function cancel({ environmentId, attemptId }) {
      const running = active.get(environmentId);
      if (running && running.attemptId !== attemptId) throw new Error("다른 Wing 트래픽 수집이 진행 중입니다.");
      const work = running || { attemptId };
      active.set(environmentId, work);
      try {
        return await terminal(environmentId, work, "fail", { code: "USER_CANCELLED", message: "사용자가 Wing 트래픽 수집을 중단했습니다." });
      } finally {
        if (!work.promise && !work.terminal && active.get(environmentId) === work) active.delete(environmentId);
      }
    }

    async function recover(environmentId) {
      if (active.has(environmentId)) return;
      for (const session of await options.sessions.list(environmentId)) {
        if (session.producer !== PRODUCER) continue;
        if (!(await isActive(session.attemptId, environmentId))) continue;
        let owner;
        try { owner = await read(environmentId, session.attemptId); } catch { continue; }
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

    // Completed, failed and expired attempts have ended; a session left behind
    // by one is a leftover for the next collection to clear.
    async function attemptEnded(environmentId, attemptId) {
      const control = await read(environmentId, attemptId);
      return control.state !== "RUNNING" || Date.now() >= Date.parse(control.expiresAt);
    }

    return Object.freeze({ run, recover, handleMessage, cancel, attemptEnded });
  }

  // Daily v2 deliberately lives beside the period-only v1 owner.  The two
  // actions are separate so a legacy and a daily content script cannot race
  // two responders on the same runtime message.
  const V2_ACTION = "wingTrafficSourceStepV2";
  const V2_PARSER_VERSION = "wing-traffic-daily-v2";
  const V2_FILTER_SCOPE = "ALL_NORMAL_RFM";
  const V2_PAGE_BASE = 100;
  const V2_MAX_PAGES = 100;
  const V2_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const V2_CHECKSUM = /^[a-f0-9]{64}$/;

  function v2Dates(plan) {
    if (!Array.isArray(plan?.expectedDates) || plan.expectedDates.length !== plan.periodDays ||
      plan.expectedDates.length < 1 || plan.expectedDates.length > 366 ||
      !v2Date(plan.startDate) || !v2Date(plan.endDate) ||
      plan.expectedDates.some((date) => !v2Date(date))) return null;
    const start = Date.parse(`${plan.startDate}T00:00:00Z`);
    return plan.expectedDates.every((date, index) => {
      const expected = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
      return date === expected;
    }) ? [...plan.expectedDates] : null;
  }

  function v2Date(value) {
    if (typeof value !== "string" || !V2_DATE.test(value)) return false;
    const timestamp = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
  }

  function v2Url(value) {
    if (typeof value !== "string" || value.length > 2048) return false;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname.toLowerCase() === "wing.coupang.com" &&
        url.pathname === "/tenants/business-insight/sales-analysis";
    } catch {
      return false;
    }
  }

  function v2AccountSummary(value) {
    if (!isPlainRecord(value) || Object.keys(value).some((key) => ![
      "visitors", "views", "cartAdds", "orders", "salesQty", "revenue", "providerConversionRate",
    ].includes(key)) ||
      !["visitors", "views", "cartAdds", "orders", "salesQty", "revenue"].every((key) =>
        Number.isSafeInteger(value[key])) ||
      (value.providerConversionRate !== null &&
        (typeof value.providerConversionRate !== "number" || !Number.isFinite(value.providerConversionRate)))) return false;
    return true;
  }

  function v2Proof(proof, pageIndex, dataLength) {
    if (!isPlainRecord(proof) || !Number.isSafeInteger(proof.expectedPages) ||
      proof.expectedPages < 1 || proof.expectedPages > V2_MAX_PAGES || pageIndex > proof.expectedPages ||
      !Array.isArray(proof.visitedPages) || proof.visitedPages.length !== pageIndex ||
      proof.visitedPages.some((page, index) => page !== index + 1) ||
      typeof proof.terminalPageObserved !== "boolean" || typeof proof.verified !== "boolean" ||
      typeof proof.complete !== "boolean" ||
      Object.keys(proof).some((key) => ![
        "expectedPages", "visitedPages", "terminalPageObserved", "verified", "complete", "explicitEmpty",
      ].includes(key))) return false;
    const terminal = pageIndex === proof.expectedPages;
    if (proof.terminalPageObserved !== terminal || proof.complete !== terminal || proof.verified !== true) return false;
    if (proof.explicitEmpty === true && (dataLength !== 0 || pageIndex !== 1 || proof.expectedPages !== 1)) return false;
    return true;
  }

  function v2ReceiptShape(body, plan) {
    const common = [
      "key", "capturedAt", "url", "startDate", "endDate", "period", "kind",
      "providerVendorId", "filterScope", "accountSummary", "accountSummaryRaw",
    ];
    if (!isPlainRecord(body) || Object.keys(body).some((key) => !common.includes(key) &&
      !["businessDate", "pageIndex", "proof", "data"].includes(key)) ||
      typeof body.key !== "string" || !body.key || body.key.length > 160 ||
      typeof body.capturedAt !== "string" || !Number.isFinite(Date.parse(body.capturedAt)) ||
      !v2Url(body.url) || body.providerVendorId !== plan.expectedAdvertiserId ||
      body.filterScope !== V2_FILTER_SCOPE) return null;
    const hasSummary = body.accountSummary !== undefined;
    const hasRaw = body.accountSummaryRaw !== undefined;
    if (hasSummary !== hasRaw || (hasSummary && (!v2AccountSummary(body.accountSummary) || !isPlainRecord(body.accountSummaryRaw)))) return null;
    const dates = v2Dates(plan);
    if (!dates) return null;
    if (body.kind === "daily_page") {
      if (typeof body.businessDate !== "string" || !dates.includes(body.businessDate) ||
        body.startDate !== body.businessDate || body.endDate !== body.businessDate || body.period !== 1 ||
        !Number.isSafeInteger(body.pageIndex) || body.pageIndex < 1 ||
        !Array.isArray(body.data) || body.data.length > 5000 || body.data.some((row) => !isPlainRecord(row)) ||
        !v2Proof(body.proof, body.pageIndex, body.data.length)) return null;
      const pageSummaryKeys = body.pageIndex === 1;
      if (pageSummaryKeys !== hasSummary) return null;
      const sequence = dates.indexOf(body.businessDate) * V2_PAGE_BASE + body.pageIndex - 1;
      return { kind: body.kind, sequence, businessDate: body.businessDate, pageIndex: body.pageIndex };
    }
    if (body.kind === "period_summary") {
      // The summary declares the dates this attempt confirmed, which are fewer
      // than the plan asked for whenever the provider has not published a later
      // day yet. Admit the same shape the owner does: a contiguous interval
      // inside the plan. Whether that interval is the set actually confirmed is
      // settled at the terminal submission, which is the only point that knows.
      const periodStart = dates.indexOf(body.startDate);
      const periodEnd = dates.indexOf(body.endDate);
      if (!hasSummary || periodStart < 0 || periodEnd < periodStart ||
        body.period !== periodEnd - periodStart + 1 ||
        body.businessDate !== undefined || body.pageIndex !== undefined || body.proof !== undefined || body.data !== undefined) return null;
      // The sequence stays keyed to the plan, never to the narrowed window: the
      // daily slots are numbered off the plan's full date vector, so a narrowed
      // period would land inside day `period`'s own page range.
      return { kind: body.kind, sequence: plan.periodDays * V2_PAGE_BASE };
    }
    return null;
  }

  // The server ACK is intentionally a smaller, discriminated shape than the
  // receipt input.  Raw provider summaries never come back through the ACK,
  // and each kind has its own coverage fields/fence.
  function v2AckShape(receipt, plan, expectedSequence = null) {
    if (!isPlainRecord(receipt) || typeof receipt.sequence !== "number" ||
      !Number.isSafeInteger(receipt.sequence) || receipt.sequence < 0 ||
      (expectedSequence !== null && receipt.sequence !== expectedSequence) ||
      typeof receipt.key !== "string" || !receipt.key || receipt.key.length > 160 ||
      typeof receipt.checksum !== "string" || !V2_CHECKSUM.test(receipt.checksum) ||
      typeof receipt.providerVendorId !== "string" || receipt.providerVendorId !== plan.expectedAdvertiserId ||
      receipt.filterScope !== V2_FILTER_SCOPE || typeof receipt.capturedAt !== "string" ||
      !Number.isFinite(Date.parse(receipt.capturedAt)) || !v2Url(receipt.url)) return null;
    if (receipt.kind === "daily_page") {
      const allowed = [
        "sequence", "kind", "key", "checksum", "providerVendorId", "filterScope", "capturedAt",
        "businessDate", "pageIndex", "expectedPages", "rowCount", "matchedCount", "unmatchedCount",
        "snapshotIds", "url", "startDate", "endDate", "terminalPageObserved",
      ];
      const dates = v2Dates(plan);
      if (Object.keys(receipt).some((key) => !allowed.includes(key)) ||
        !v2Date(receipt.businessDate) || !v2Date(receipt.startDate) || !v2Date(receipt.endDate) ||
        !dates?.includes(receipt.businessDate) ||
        receipt.startDate !== receipt.businessDate || receipt.endDate !== receipt.businessDate ||
        receipt.period !== undefined || !Number.isSafeInteger(receipt.pageIndex) || receipt.pageIndex < 1 ||
        receipt.pageIndex > V2_MAX_PAGES || !Number.isSafeInteger(receipt.expectedPages) ||
        receipt.expectedPages < 1 || receipt.expectedPages > V2_MAX_PAGES ||
        !Number.isSafeInteger(receipt.rowCount) || receipt.rowCount < 0 ||
        !Number.isSafeInteger(receipt.matchedCount) || receipt.matchedCount < 0 ||
        !Number.isSafeInteger(receipt.unmatchedCount) || receipt.unmatchedCount < 0 ||
        receipt.rowCount !== receipt.matchedCount + receipt.unmatchedCount ||
        !Array.isArray(receipt.snapshotIds) || receipt.snapshotIds.some((id) => !UUID.test(id)) ||
        receipt.snapshotIds.length !== receipt.rowCount || typeof receipt.terminalPageObserved !== "boolean" ||
        receipt.sequence !== dates.indexOf(receipt.businessDate) * V2_PAGE_BASE + receipt.pageIndex - 1) return null;
      return { kind: receipt.kind, sequence: receipt.sequence, businessDate: receipt.businessDate, pageIndex: receipt.pageIndex };
    }
    if (receipt.kind === "period_summary") {
      const allowed = [
        "sequence", "kind", "key", "checksum", "providerVendorId", "filterScope", "capturedAt",
        "startDate", "endDate", "period", "rowCount", "matchedCount", "unmatchedCount", "snapshotIds", "url",
      ];
      // Same confirmed-window rule as the receipt above: the ACK echoes the
      // window the summary declared, not the window that was requested.
      const dates = v2Dates(plan);
      const periodStart = dates ? dates.indexOf(receipt.startDate) : -1;
      const periodEnd = dates ? dates.indexOf(receipt.endDate) : -1;
      if (Object.keys(receipt).some((key) => !allowed.includes(key)) ||
        !v2Date(receipt.startDate) || !v2Date(receipt.endDate) ||
        periodStart < 0 || periodEnd < periodStart ||
        receipt.period !== periodEnd - periodStart + 1 ||
        !Number.isSafeInteger(receipt.period) || receipt.period < 1 || receipt.period > 366 ||
        receipt.rowCount !== 0 || receipt.matchedCount !== 0 || receipt.unmatchedCount !== 0 ||
        !Array.isArray(receipt.snapshotIds) || receipt.snapshotIds.length !== 0 ||
        receipt.sequence !== plan.periodDays * V2_PAGE_BASE) return null;
      return { kind: receipt.kind, sequence: receipt.sequence };
    }
    return null;
  }

  function v2ReceiptBySequence(control, sequence) {
    return (Array.isArray(control?.receipts) ? control.receipts : [])
      .find((receipt) => receipt.sequence === sequence) || null;
  }

  function v2Coverage(control) {
    const plan = control?.plan;
    const dates = v2Dates(plan);
    const receipts = Array.isArray(control?.receipts) ? control.receipts : [];
    if (!dates) return false;
    const period = receipts.find((receipt) => receipt.kind === "period_summary" &&
      receipt.sequence === plan.periodDays * V2_PAGE_BASE);
    if (!period) return false;
    // The summary declares the window this attempt confirmed, and coverage is
    // complete when every date in *that* window is complete. Requiring the whole
    // plan refused every window whose last day the provider had not published
    // yet — the ordinary case, since Wing's traffic runs a day behind its sales —
    // and discarded every measured day along with it. Same rule the owner
    // applies at the terminal submission: a contiguous interval inside the plan.
    const periodStart = dates.indexOf(period.startDate);
    const periodEnd = dates.indexOf(period.endDate);
    if (periodStart < 0 || periodEnd < periodStart) return false;
    let expectedReceiptCount = 1;
    for (let dayIndex = periodStart; dayIndex <= periodEnd; dayIndex += 1) {
      const daily = receipts.filter((receipt) => receipt.kind === "daily_page" && receipt.businessDate === dates[dayIndex]);
      const expectedPages = daily[0]?.expectedPages;
      if (!Number.isSafeInteger(expectedPages) || expectedPages < 1 || expectedPages > V2_MAX_PAGES ||
        daily.length !== expectedPages) return false;
      expectedReceiptCount += expectedPages;
      for (let pageIndex = 1; pageIndex <= expectedPages; pageIndex += 1) {
        const receipt = daily.find((value) => value.pageIndex === pageIndex);
        if (!receipt || receipt.sequence !== dayIndex * V2_PAGE_BASE + pageIndex - 1 ||
          receipt.expectedPages !== expectedPages || receipt.terminalPageObserved !== (pageIndex === expectedPages)) return false;
      }
    }
    // This also rules out a page for a date outside the declared window, which
    // the owner rejects as a scope conflict: a half-collected day has to stay
    // incomplete rather than quietly become an absent one.
    return receipts.length === expectedReceiptCount;
  }

  function createV2(options) {
    const active = new Map();
    const wire = root.KidItemSourcingAttemptWire.create({
      chrome: options.chrome,
      sourcePath: `${SOURCE_PATH}/attempts`,
      requestFailureMessage: "Wing 트래픽 일별 owner 요청 실패",
    });
    const config = (environmentId) => ({
      apiBase: "",
      headers: { "Content-Type": "application/json" },
      request: (path, init) => options.request(environmentId, path, init),
    });

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
      const value = await wire.requestJsonWithRetry(
        config(environmentId),
        `${SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}/control`,
      ).catch((error) => {
        throw Object.assign(error, {
          code: !error.status || error.status >= 500 ? "SOURCE_OWNER_UNAVAILABLE" : error.code,
        });
      });
      const plan = value?.plan;
      const dates = v2Dates(plan);
      if (value?.attemptId !== attemptId || !UUID.test(value.attemptToken || "") ||
        !["RUNNING", "COMPLETE", "FAILED"].includes(value.state) ||
        plan?.sourceType !== "coupang_wing_traffic" || plan?.parserVersion !== V2_PARSER_VERSION ||
        !UUID.test(value.channelAccountId || "") || plan.channelAccountId !== value.channelAccountId ||
        typeof plan.expectedAdvertiserId !== "string" || !plan.expectedAdvertiserId.trim() ||
        typeof plan.providerVendorId !== "string" || plan.providerVendorId !== plan.expectedAdvertiserId ||
        !v2Date(plan.startDate) || !v2Date(plan.endDate) ||
        !v2Date(plan.businessDate) || plan.businessDate !== plan.endDate ||
        !Number.isSafeInteger(plan.periodDays) || plan.periodDays < 1 || plan.periodDays > 366 ||
        plan.filterScope !== V2_FILTER_SCOPE || !dates ||
        (plan.targetUrl !== null && (typeof plan.targetUrl !== "string" || !/^https?:\/\//i.test(plan.targetUrl))) ||
        !Number.isFinite(Date.parse(value.expiresAt)) || !Array.isArray(value.receipts) ||
        value.receipts.some((receipt) => !v2AckShape(receipt, plan))) {
        const error = new Error(plan?.parserVersion === "wing-traffic-v1"
          ? "Wing 트래픽 legacy v1 계획은 v2 owner에서 처리할 수 없습니다."
          : "Wing 트래픽 일별 owner 응답이 일치하지 않습니다");
        error.code = plan?.parserVersion === "wing-traffic-v1" ? "WING_TRAFFIC_LEGACY_PLAN" : "SOURCE_OWNER_REQUEST_FAILED";
        throw error;
      }
      const prior = active.get(environmentId)?.control;
      if (prior?.attemptId === attemptId &&
        (prior.attemptToken !== value.attemptToken || stableStringify(prior.plan) !== stableStringify(plan))) {
        throw new Error("Wing 트래픽 일별 동결 수집 허가가 변경되었습니다.");
      }
      return value;
    }

    async function finish(environmentId, control) {
      const work = active.get(environmentId);
      if (work?.attemptId === control.attemptId) work.terminal = null;
      const session = await options.sessions.getOwned(control.attemptId, environmentId);
      if (control.state === "FAILED" && control.errorCode !== "USER_CANCELLED" && session?.attention) return outcome(control);
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
      const request = work.terminal;
      try {
        work.control = await read(environmentId, work.attemptId);
        if (work.control.state === "RUNNING" && Date.now() < Date.parse(work.control.expiresAt)) {
          await wire.terminal(config(environmentId), work.control, {
            method: "POST", suffix: request.kind === "complete" ? "/complete" : "/fail", body: request.body,
          }, undefined, request.body?.code === "USER_CANCELLED"
            ? {}
            : { shouldContinue: () => isActive(work.attemptId, environmentId) });
        }
      } catch (error) {
        if (error?.code === "WING_TRAFFIC_LEGACY_PLAN") throw error;
      }
      let observed;
      try { observed = await read(environmentId, work.attemptId); }
      catch (error) {
        if (error?.code === "WING_TRAFFIC_LEGACY_PLAN") throw error;
        return { ...outcome(work.control || { state: "RUNNING", attemptId: work.attemptId }), continuationRequired: false, errorCode: "SOURCE_OWNER_UNAVAILABLE" };
      }
      if (observed.state === "RUNNING") return { ...outcome(observed), continuationRequired: false, errorCode: "SOURCE_OWNER_UNAVAILABLE" };
      if (observed.state === "FAILED" && request.kind === "complete") {
        work.terminal = null;
        return finish(environmentId, observed);
      }
      if (request.kind === "complete" && observed.manifestChecksum !== request.body.manifestChecksum) {
        return { ...outcome(observed), success: false, continuationRequired: false, errorCode: "SOURCE_OWNER_UNAVAILABLE", error: "Wing traffic completion acknowledgement did not match the manifest." };
      }
      if (request.kind === "fail" && (observed.state !== "FAILED" || observed.errorCode !== request.body.code || observed.errorMessage !== request.body.message)) {
        return { ...outcome(observed), success: false, continuationRequired: false, errorCode: "SOURCE_OWNER_UNAVAILABLE", error: "Wing traffic failure acknowledgement did not match the requested body." };
      }
      work.terminal = null;
      return finish(environmentId, observed);
    }

    async function contentStep(message, sender) {
      if (!Number.isInteger(sender?.tab?.id) || (sender.frameId !== undefined && sender.frameId !== 0) ||
        new URL(sender.url || sender.tab.url).origin !== "https://wing.coupang.com") throw new Error("Wing 트래픽 발신 탭이 유효하지 않습니다.");
      const environmentId = await options.environmentForTab(sender.tab.id);
      const work = active.get(environmentId);
      const session = await options.sessions.getOwned(message.attemptId, environmentId);
      if (!work || work.attemptId !== message.attemptId || work.terminal || session?.producer !== PRODUCER) {
        throw new Error("Wing 트래픽 탭 소유권이 없습니다.");
      }
      if (!(await isActive(message.attemptId, environmentId))) throw new Error("Wing 트래픽 수집이 중단되었습니다.");
      if (await options.ownedTab(environmentId, message.attemptId) !== sender.tab.id) {
        throw new Error("Wing 트래픽 탭 소유권이 없습니다.");
      }
      const step = message.step;
      const fields = ["action", "attemptId", "step", ...(step === "receipt" ? ["body"] : [])];
      if (!["resume", "checkpoint", "receipt"].includes(step) || Object.keys(message).some((key) => !fields.includes(key))) throw new Error("Wing 트래픽 요청이 유효하지 않습니다.");
      if (step === "resume") work.control = await read(environmentId, work.attemptId);
      if (!work.control || work.control.state !== "RUNNING" || Date.now() >= Date.parse(work.control.expiresAt)) throw new Error("Wing 트래픽 시도가 종료되었습니다.");
      if (step === "checkpoint") return { success: true };
      if (step === "resume") return { success: true, control: safeControl(work.control) };
      const body = message.body;
      const shape = v2ReceiptShape(body, work.control.plan);
      if (!shape) throw new Error("Wing 트래픽 일별 receipt가 유효하지 않습니다.");
      const expectedChecksum = await sha256Hex(body);
      const existing = v2ReceiptBySequence(work.control, shape.sequence);
      if (existing && existing.checksum !== expectedChecksum) {
        throw Object.assign(new Error("Wing 트래픽 receipt가 이미 다른 본문으로 기록되었습니다."), { code: "SOURCE_OWNER_UNAVAILABLE" });
      }
      if (existing && existing.checksum === expectedChecksum && existing.capturedAt === body.capturedAt) {
        if (!v2AckShape(existing, work.control.plan, shape.sequence)) {
          throw Object.assign(new Error("Wing 트래픽 일별 receipt 상태가 유효하지 않습니다."), { code: "SOURCE_OWNER_UNAVAILABLE" });
        }
        return { success: true, trafficReceipt: existing, manifestChecksum: work.control.manifestChecksum, control: safeControl(work.control) };
      }
      let ack;
      try {
        ack = await wire.terminal(config(environmentId), work.control, {
          method: "PUT", suffix: `/receipts/${shape.sequence}`, body,
        });
      } catch (error) {
        if (error.status && error.status < 500) throw error;
        work.control = await read(environmentId, work.attemptId);
        const receipt = v2ReceiptBySequence(work.control, shape.sequence);
        if (!receipt || receipt.checksum !== expectedChecksum || receipt.capturedAt !== body.capturedAt ||
          !v2AckShape(receipt, work.control.plan, shape.sequence)) throw Object.assign(error, { code: "SOURCE_OWNER_UNAVAILABLE" });
        ack = receipt;
      }
      const receipt = ack?.receipt || (ack?.sequence !== undefined ? ack : null);
      if (!receipt || receipt.sequence !== shape.sequence || receipt.kind !== shape.kind || receipt.checksum !== expectedChecksum ||
        receipt.capturedAt !== body.capturedAt || !v2AckShape(receipt, work.control.plan, shape.sequence)) {
        throw Object.assign(new Error("Wing 트래픽 일별 receipt 응답이 일치하지 않습니다."), { code: "SOURCE_OWNER_UNAVAILABLE" });
      }
      work.control = await read(environmentId, work.attemptId);
      const observed = v2ReceiptBySequence(work.control, shape.sequence);
      if (!observed || observed.checksum !== expectedChecksum || observed.capturedAt !== body.capturedAt ||
        !v2AckShape(observed, work.control.plan, shape.sequence)) throw Object.assign(new Error("Wing 트래픽 일별 receipt 상태가 일치하지 않습니다."), { code: "SOURCE_OWNER_UNAVAILABLE" });
      return { success: true, trafficReceipt: observed, manifestChecksum: work.control.manifestChecksum, control: safeControl(work.control) };
    }

    function handleMessage(message, sender, sendResponse) {
      if (message?.action !== V2_ACTION) return false;
      contentStep(message, sender).then(sendResponse).catch((error) => sendResponse({
        success: false,
        errorCode: error.code === "SOURCE_OWNER_UNAVAILABLE" || (error.code === "SOURCE_OWNER_REQUEST_FAILED" && (!error.status || error.status >= 500)) ? "SOURCE_OWNER_UNAVAILABLE" : "SOURCE_RECEIPT_REJECTED",
        error: error.message,
      }));
      return true;
    }

    async function execute(environmentId, attemptId) {
      const existingSession = await options.sessions.getOwned(attemptId, environmentId).catch(() => null);
      if (existingSession && !(await isActive(attemptId, environmentId))) return stoppedOutcome(attemptId);
      const control = await read(environmentId, attemptId);
      if (control.state !== "RUNNING") return finish(environmentId, control);
      if (Date.now() >= Date.parse(control.expiresAt)) return finish(environmentId, control);
      for (const previous of await options.sessions.list(environmentId)) {
        if (previous.producer !== PRODUCER || previous.attemptId === attemptId) continue;
        let owner;
        try { owner = await read(environmentId, previous.attemptId); } catch (error) {
          if (error?.code === "WING_TRAFFIC_LEGACY_PLAN") continue;
          continue;
        }
        if (owner.state === "RUNNING") throw new Error("다른 Wing 트래픽 수집이 진행 중입니다.");
        await finish(environmentId, owner);
      }
      const work = active.get(environmentId);
      work.control = control;
      await options.sessions.start({ attemptId, environmentId, producer: PRODUCER });
      if (!(await isActive(attemptId, environmentId))) return stoppedOutcome(attemptId);
      let collected;
      try { collected = await options.collect({ environmentId, attemptId, control: safeControl(control) }); }
      catch (error) { collected = { success: false, error: error.message, errorCode: error.code }; }
      if (!(await isActive(attemptId, environmentId))) return stoppedOutcome(attemptId);
      if (work.terminal) return terminal(environmentId, work);
      let observed;
      try { observed = await read(environmentId, attemptId); }
      catch (error) {
        if (error?.code === "WING_TRAFFIC_LEGACY_PLAN") throw error;
        return { ...outcome(control), continuationRequired: false, errorCode: "SOURCE_OWNER_UNAVAILABLE" };
      }
      if (observed.state !== "RUNNING") return finish(environmentId, observed);
      work.control = observed;
      if (!collected?.success && collected?.errorCode !== "SOURCE_OWNER_UNAVAILABLE") {
        if (collected?.attentionRequired) await options.sessions.requireAttention(attemptId, { reason: collected.reason || "marketplace_login", message: collected.error || "Wing 로그인이 필요합니다." });
        return terminal(environmentId, work, "fail", wire.failure({ code: collected?.errorCode, message: collected?.error }, "WING_TRAFFIC_COLLECTION_FAILED", "Wing 트래픽 수집 실패"));
      }
      if (collected?.success && v2Coverage(observed)) return terminal(environmentId, work, "complete", { manifestChecksum: observed.manifestChecksum });
      if (collected?.success || collected?.errorCode === "INCOMPLETE_TRAFFIC_COVERAGE") {
        return terminal(environmentId, work, "fail", wire.failure({ code: "INCOMPLETE_TRAFFIC_COVERAGE", message: collected?.error || "Wing 트래픽 일별 페이지네이션이 완료되지 않았습니다." }, "INCOMPLETE_TRAFFIC_COVERAGE", "Wing 트래픽 일별 페이지네이션이 완료되지 않았습니다."));
      }
      return { ...outcome(observed), continuationRequired: false, errorCode: "SOURCE_OWNER_UNAVAILABLE" };
    }

    function run({ environmentId, attemptId }) {
      const running = active.get(environmentId);
      if (running) {
        if (running.attemptId !== attemptId) throw new Error("다른 Wing 트래픽 수집이 진행 중입니다.");
        if (running.promise) return running.promise;
      }
      const work = running || { attemptId };
      work.promise = Promise.resolve().then(() => takeWindowTurn(environmentId, () => execute(environmentId, attemptId))).finally(() => {
        work.promise = null;
        if (active.get(environmentId) === work && !work.terminal) active.delete(environmentId);
      });
      active.set(environmentId, work);
      return work.promise;
    }

    async function cancel({ environmentId, attemptId }) {
      const running = active.get(environmentId);
      if (running && running.attemptId !== attemptId) throw new Error("다른 Wing 트래픽 수집이 진행 중입니다.");
      const work = running || { attemptId };
      active.set(environmentId, work);
      try { return await terminal(environmentId, work, "fail", { code: "USER_CANCELLED", message: "사용자가 Wing 트래픽 수집을 중단했습니다." }); }
      finally { if (!work.promise && !work.terminal && active.get(environmentId) === work) active.delete(environmentId); }
    }

    async function recover(environmentId) {
      if (active.has(environmentId)) return;
      for (const session of await options.sessions.list(environmentId)) {
        if (session.producer !== PRODUCER) continue;
        if (!(await isActive(session.attemptId, environmentId))) continue;
        let owner;
        try { owner = await read(environmentId, session.attemptId); } catch (error) {
          if (error?.code === "WING_TRAFFIC_LEGACY_PLAN") continue;
          continue;
        }
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

    // Completed, failed and expired attempts have ended; a session left behind
    // by one is a leftover for the next collection to clear.
    async function attemptEnded(environmentId, attemptId) {
      const control = await read(environmentId, attemptId);
      return control.state !== "RUNNING" || Date.now() >= Date.parse(control.expiresAt);
    }

    return Object.freeze({ run, recover, handleMessage, cancel, attemptEnded });
  }

  root.KidItemWingTrafficSourceOwner = Object.freeze({ create, parseAction });
  root.KidItemWingTrafficSourceOwnerV2 = Object.freeze({ create: createV2, parseAction });
})(globalThis);
