(function installAdAccountDailyKpiSourceOwner(root) {
  "use strict";

  const SOURCE_PATH = "/api/ads/account-daily-kpis/attempts";
  const PRODUCER = "advertising.ad_account_daily_kpi";
  const LEGACY_PARSER_VERSION = "ad-account-daily-kpi-v1";
  const PARSER_VERSION = "ad-account-daily-kpi-v2";
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const ADDITIVE_METRICS = [
    "adSpend",
    "adRevenue",
    "impressions",
    "clicks",
    "conversions",
    "orders",
  ];
  const NORMALIZED_KEYS = [
    "date",
    "adSpend",
    "adRevenue",
    "impressions",
    "clicks",
    "conversions",
    "orders",
    "roas",
    "ctr",
    "conversionRate",
    "observedMetrics",
    "rowCount",
  ];

  // Keep this byte-for-byte compatible with the server owner hash. Receipt
  // retries and terminal reconciliation must identify the exact JSON body,
  // including objects with numeric-looking keys and JSON-dropped undefineds.
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
      throw new Error("Invalid advertising account daily KPI source request");
    }
    return { attemptId: message.attemptId };
  }

  function attemptOf(control) {
    return control || null;
  }

  function safeControl(control) {
    if (!control || typeof control !== "object") return control;
    const { attemptToken: _privateToken, ...safe } = control;
    return safe;
  }

  function stateOf(control) {
    return attemptOf(control)?.state;
  }

  function wireAttempt(control) {
    return control;
  }

  function outcome(control) {
    const attempt = attemptOf(control) || control || {};
    return {
      success: attempt.state === "COMPLETE",
      attemptId: attempt.attemptId,
      terminalState: attempt.state,
      continuationRequired: attempt.state === "RUNNING",
      ...(attempt.errorCode ? { errorCode: attempt.errorCode } : {}),
      ...(attempt.errorMessage ? { error: attempt.errorMessage } : {}),
    };
  }

  function validDates(value) {
    return Array.isArray(value) && value.length > 0 &&
      value.every((date) => typeof date === "string" && DATE.test(date));
  }

  function receiptBySequence(control, sequence) {
    return (control?.receipts || []).find((receipt) => receipt.sequence === sequence) || null;
  }

  function updateLocalReceipt(control, receipt) {
    const current = control;
    if (!current || !receipt) return;
    const receipts = Array.isArray(control.receipts) ? control.receipts : [];
    if (!receipts.some((value) => value.sequence === receipt.sequence)) {
      receipts.push(receipt);
      receipts.sort((left, right) => left.sequence - right.sequence);
    }
    current.receipts = receipts;
    current.receiptCount = receipts.length;
    current.rowCount = receipts.reduce((sum, value) => sum + (Number(value.rowCount) || 0), 0);
  }

  function create(options) {
    const active = new Map();
    const wire = root.KidItemSourcingAttemptWire.create({
      chrome: options.chrome,
      sourcePath: SOURCE_PATH,
      requestFailureMessage: "광고 계정 일별 KPI owner 요청 실패",
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
        `${SOURCE_PATH}/${attemptId}/control`,
      ).catch((error) => {
        throw Object.assign(error, {
          code: !error.status || error.status >= 500
            ? "SOURCE_OWNER_UNAVAILABLE"
            : error.code,
        });
      });
      const attempt = value;
      const plan = attempt?.plan;
      if (attempt?.attemptId !== attemptId || !UUID.test(value?.attemptToken || "") ||
        !["RUNNING", "COMPLETE", "FAILED"].includes(attempt?.state) ||
        plan?.sourceType !== "coupang_ads_daily" ||
        ![LEGACY_PARSER_VERSION, PARSER_VERSION].includes(plan?.parserVersion) ||
        !UUID.test(attempt?.channelAccountId || "") || plan.channelAccountId !== attempt.channelAccountId ||
        typeof plan.expectedAdvertiserId !== "string" || !plan.expectedAdvertiserId.trim() ||
        !DATE.test(plan.coverageRangeStartDate || "") || !DATE.test(plan.coverageRangeEndDate || "") ||
        !validDates(plan.expectedDates) || !validDates(plan.businessDates) ||
        plan.businessDates.some((date) => !plan.expectedDates.includes(date)) ||
        (attempt.state === "RUNNING" && (!attempt.expiresAt || !Number.isFinite(Date.parse(attempt.expiresAt)))) ||
        (attempt.state !== "RUNNING" && attempt.expiresAt !== null &&
          !Number.isFinite(Date.parse(attempt.expiresAt))) ||
        !Array.isArray(value.receipts)) {
        throw new Error("광고 계정 일별 KPI owner 응답이 일치하지 않습니다");
      }
      const prior = active.get(environmentId)?.control;
      if (prior && attemptOf(prior)?.attemptId === attemptId &&
        (prior.attemptToken !== value.attemptToken ||
          stableStringify(attemptOf(prior)?.plan) !== stableStringify(plan))) {
        throw new Error("광고 계정 일별 KPI 동결 수집 허가가 변경되었습니다.");
      }
      return value;
    }

    async function finish(environmentId, control) {
      const attempt = attemptOf(control) || control;
      const work = active.get(environmentId);
      if (work?.attemptId === attempt?.attemptId) work.terminal = null;
      const session = await options.sessions.getOwned(attempt.attemptId, environmentId);
      if (attempt.state === "FAILED" && attempt.errorCode !== "USER_CANCELLED" && session?.attention) {
        return outcome(control);
      }
      await options.closeAttempt(environmentId, attempt.attemptId);
      await options.sessions.remove(attempt.attemptId);
      return outcome(control);
    }

    function terminal(environmentId, work, kind, body) {
      work.terminal ||= { kind, body };
      if (work.terminalPromise) return work.terminalPromise;
      work.terminalPromise = submitTerminal(environmentId, work)
        .finally(() => { work.terminalPromise = null; });
      return work.terminalPromise;
    }

    async function submitTerminal(environmentId, work) {
      try {
        work.control = await read(environmentId, work.attemptId);
        const attempt = attemptOf(work.control);
        if (attempt.state === "RUNNING" && Date.now() < Date.parse(attempt.expiresAt)) {
          await wire.terminal(config(environmentId), wireAttempt(work.control), {
            method: "POST",
            suffix: "/" + work.terminal.kind,
            body: work.terminal.body,
          }, undefined, work.terminal.body?.code === "USER_CANCELLED"
            ? {}
            : { shouldContinue: () => isActive(work.attemptId, environmentId) });
        }
      } catch {
        // Reconcile the same requested terminal operation from the owner below.
      }
      let observed;
      try {
        observed = await read(environmentId, work.attemptId);
      } catch {
        return {
          ...outcome(work.control || { state: "RUNNING", attemptId: work.attemptId }),
          continuationRequired: false,
          errorCode: "SOURCE_OWNER_UNAVAILABLE",
        };
      }
      if (stateOf(observed) === "RUNNING") {
        return { ...outcome(observed), continuationRequired: false };
      }
      work.terminal = null;
      return finish(environmentId, observed);
    }

    function validReceiptBody(body, plan) {
      const observedMetrics = body?.normalized?.observedMetrics;
      const hasObservedMetrics = Object.prototype.hasOwnProperty.call(
        body?.normalized || {},
        "observedMetrics",
      );
      const observedMetricsValid = observedMetrics && typeof observedMetrics === "object" &&
        !Array.isArray(observedMetrics) &&
        !Object.keys(observedMetrics).some((key) => !ADDITIVE_METRICS.includes(key)) &&
        ADDITIVE_METRICS.every((key) => observedMetrics[key] === true);
      const requiresObservedMetrics = plan?.parserVersion === PARSER_VERSION;
      if (!body || typeof body !== "object" || Array.isArray(body) ||
        !DATE.test(body.businessDate || "") || !Number.isFinite(Date.parse(body.observedAt)) ||
        !body.rawJson || typeof body.rawJson !== "object" || Array.isArray(body.rawJson) ||
        !body.normalized || typeof body.normalized !== "object" || Array.isArray(body.normalized) ||
        body.normalized.date !== body.businessDate ||
        Object.keys(body).some((key) => !["businessDate", "observedAt", "providerAdvertiserId", "rawJson", "normalized"].includes(key)) ||
        (body.providerAdvertiserId !== undefined && body.providerAdvertiserId !== plan.expectedAdvertiserId) ||
        Object.keys(body.normalized).some((key) => !NORMALIZED_KEYS.includes(key)) ||
        (requiresObservedMetrics && !observedMetricsValid) ||
        (hasObservedMetrics && !observedMetricsValid) ||
        ["adSpend", "adRevenue", "impressions", "clicks", "conversions", "orders"]
          .some((key) => typeof body.normalized[key] !== "number" || !Number.isFinite(body.normalized[key])) ||
        ["roas", "ctr", "conversionRate"]
          .some((key) => body.normalized[key] !== null &&
            (typeof body.normalized[key] !== "number" || !Number.isFinite(body.normalized[key]))) ||
        !Number.isInteger(body.normalized.rowCount) || body.normalized.rowCount < 0) {
        return false;
      }
      return plan.businessDates.includes(body.businessDate);
    }

    async function contentStep(message, sender) {
      if (!Number.isInteger(sender?.tab?.id) || (sender.frameId !== undefined && sender.frameId !== 0) ||
        new URL(sender.url || sender.tab.url).origin !== "https://advertising.coupang.com") {
        throw new Error("광고 계정 일별 KPI 발신 탭이 유효하지 않습니다.");
      }
      const environmentId = await options.environmentForTab(sender.tab.id);
      const work = active.get(environmentId);
      const session = await options.sessions.getOwned(message.attemptId, environmentId);
      if (!work || work.attemptId !== message.attemptId || work.terminal ||
        session?.producer !== PRODUCER) {
        throw new Error("광고 계정 일별 KPI 탭 소유권이 없습니다.");
      }
      if (!(await isActive(message.attemptId, environmentId))) {
        throw new Error("광고 계정 일별 KPI 수집이 중단되었습니다.");
      }
      if (await options.ownedTab(environmentId, message.attemptId) !== sender.tab.id) {
        throw new Error("광고 계정 일별 KPI 탭 소유권이 없습니다.");
      }
      const step = message.step;
      const fields = ["action", "attemptId", "step", ...(step === "receipt" ? ["body"] : [])];
      if (!["resume", "checkpoint", "receipt"].includes(step) ||
        Object.keys(message).some((key) => !fields.includes(key))) {
        throw new Error("광고 계정 일별 KPI 요청이 유효하지 않습니다.");
      }
      if (step === "resume") work.control = await read(environmentId, work.attemptId);
      const attempt = attemptOf(work.control);
      if (work.terminal || !attempt || attempt.state !== "RUNNING" ||
        Date.now() >= Date.parse(attempt.expiresAt)) {
        throw new Error("광고 계정 일별 KPI 시도가 종료되었습니다.");
      }
      if (step === "checkpoint") return { success: true };
      if (step === "resume") return { success: true, control: safeControl(work.control) };

      const body = message.body;
      if (!validReceiptBody(body, attempt.plan)) {
        throw new Error("광고 계정 일별 KPI receipt가 유효하지 않습니다.");
      }
      const sequence = attempt.plan.businessDates.indexOf(body.businessDate);
      const existing = receiptBySequence(work.control, sequence);
      if (existing && existing.checksum !== await sha256Hex(body)) {
        throw Object.assign(new Error("광고 계정 일별 KPI receipt가 이미 다른 본문으로 기록되었습니다."), {
          code: "SOURCE_OWNER_UNAVAILABLE",
        });
      }
      const expectedChecksum = await sha256Hex(body);
      let ack;
      try {
        ack = await wire.terminal(
          config(environmentId),
          wireAttempt(work.control),
          {
            method: "PUT",
            suffix: "/receipts/" + sequence,
            body,
          },
          undefined,
          { shouldContinue: () => isActive(work.attemptId, environmentId) },
        );
      } catch (error) {
        if (error.status && error.status < 500) throw error;
        work.control = await read(environmentId, work.attemptId);
        const receipt = receiptBySequence(work.control, sequence);
        if (!receipt || receipt.businessDate !== body.businessDate || receipt.checksum !== expectedChecksum) {
          throw Object.assign(error, { code: "SOURCE_OWNER_UNAVAILABLE" });
        }
        ack = receipt;
      }
      const receipt = ack?.receipt || (ack?.sequence !== undefined ? ack : null);
      if (!receipt || receipt.sequence !== sequence || receipt.businessDate !== body.businessDate ||
        receipt.checksum !== expectedChecksum) {
        throw Object.assign(new Error("광고 계정 일별 KPI receipt 응답이 일치하지 않습니다."), {
          code: "SOURCE_OWNER_UNAVAILABLE",
        });
      }
      updateLocalReceipt(work.control, receipt);
      const manifestChecksum = await sha256Hex({
        plan: attempt.plan,
        receipts: work.control.receipts,
      });
      attempt.manifestChecksum = manifestChecksum;
      return {
        success: true,
        receipt,
        manifestChecksum,
        control: safeControl(work.control),
      };
    }

    function handleMessage(message, sender, sendResponse) {
      if (message?.action !== "advertisingAccountDailyKpiSourceStep") return false;
      contentStep(message, sender)
        .then(sendResponse)
        .catch((error) => sendResponse({
          success: false,
          errorCode: error.code === "SOURCE_OWNER_UNAVAILABLE" ||
            (error.code === "SOURCE_OWNER_REQUEST_FAILED" && (!error.status || error.status >= 500))
            ? "SOURCE_OWNER_UNAVAILABLE"
            : "SOURCE_RECEIPT_REJECTED",
          error: error.message,
        }));
      return true;
    }

    async function execute(environmentId, attemptId) {
      const existingSession = await options.sessions.getOwned(attemptId, environmentId).catch(() => null);
      if (existingSession && !(await isActive(attemptId, environmentId))) return stoppedOutcome(attemptId);
      const control = await read(environmentId, attemptId);
      if (stateOf(control) !== "RUNNING") return finish(environmentId, control);
      if (Date.now() >= Date.parse(attemptOf(control).expiresAt)) {
        return finish(environmentId, control);
      }
      for (const previous of await options.sessions.list(environmentId)) {
        if (previous.producer !== PRODUCER || previous.attemptId === attemptId) continue;
        let owner;
        try { owner = await read(environmentId, previous.attemptId); }
        catch { continue; }
        if (stateOf(owner) === "RUNNING") throw new Error("다른 광고 계정 일별 KPI 수집이 진행 중입니다.");
        await finish(environmentId, owner);
      }
      const work = active.get(environmentId);
      work.control = control;
      if (work.terminal) return terminal(environmentId, work);
      await options.sessions.start({ attemptId, environmentId, producer: PRODUCER });
      if (!(await isActive(attemptId, environmentId))) return stoppedOutcome(attemptId);
      let collected;
      try {
        collected = await options.collect({
          environmentId,
          attemptId,
          control: safeControl(control),
        });
      } catch (error) {
        collected = { success: false, error: error.message, errorCode: error.code };
      }
      if (!(await isActive(attemptId, environmentId))) return stoppedOutcome(attemptId);
      if (work.terminal) return terminal(environmentId, work);
      let observed;
      try { observed = await read(environmentId, attemptId); }
      catch { return { ...outcome(control), errorCode: "SOURCE_OWNER_UNAVAILABLE" }; }
      if (stateOf(observed) !== "RUNNING") return finish(environmentId, observed);
      work.control = observed;
      const plan = attemptOf(observed).plan;
      const completeCoverage = attemptOf(observed).receiptCount === plan.businessDates.length &&
        observed.receipts.length === plan.businessDates.length;
      if (!collected?.success && collected?.errorCode !== "SOURCE_OWNER_UNAVAILABLE") {
        if (collected?.attentionRequired) await options.sessions.requireAttention(attemptId, {
          reason: collected.reason || "marketplace_login",
          message: collected.error || "광고센터 로그인이 필요합니다.",
        });
        return terminal(environmentId, work, "fail", wire.failure(
          { code: collected?.errorCode, message: collected?.error },
          "AD_ACCOUNT_DAILY_KPI_COLLECTION_FAILED",
          "광고 계정 일별 KPI 수집 실패",
        ));
      }
      if (collected?.success && completeCoverage) {
        return terminal(environmentId, work, "complete", {
          manifestChecksum: attemptOf(observed).manifestChecksum,
        });
      }
      await options.closeAttempt(environmentId, attemptId);
      return outcome(observed);
    }

    function run({ environmentId, attemptId }) {
      const running = active.get(environmentId);
      if (running) {
        if (running.attemptId !== attemptId) throw new Error("다른 광고 계정 일별 KPI 수집이 진행 중입니다.");
        if (running.promise) return running.promise;
      }
      const work = running || { attemptId };
      work.promise = Promise.resolve()
        .then(() => execute(environmentId, attemptId))
        .finally(() => {
          work.promise = null;
          if (active.get(environmentId) === work && !work.terminal) active.delete(environmentId);
        });
      active.set(environmentId, work);
      return work.promise;
    }

    async function cancel({ environmentId, attemptId }) {
      const running = active.get(environmentId);
      if (running && running.attemptId !== attemptId) throw new Error("다른 광고 계정 일별 KPI 수집이 진행 중입니다.");
      const work = running || { attemptId };
      active.set(environmentId, work);
      try {
        return await terminal(environmentId, work, "fail", {
          code: "USER_CANCELLED",
          message: "사용자가 광고 계정 일별 KPI 수집을 중단했습니다.",
        });
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
        try { owner = await read(environmentId, session.attemptId); }
        catch { continue; }
        if (stateOf(owner) !== "RUNNING") await finish(environmentId, owner);
      }
    }

    return Object.freeze({ run, recover, handleMessage, cancel });
  }

  root.KidItemAdAccountDailyKpiSourceOwner = Object.freeze({ create, parseAction });
})(globalThis);
