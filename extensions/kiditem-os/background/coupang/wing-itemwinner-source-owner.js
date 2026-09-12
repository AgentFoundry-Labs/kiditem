(function installWingItemwinnerSourceOwner(root) {
  "use strict";

  const SOURCE_PATH = "/api/ads/wing-itemwinner";
  const PRODUCER = "dashboard.wing_kpi";
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
      throw new Error("Invalid Wing itemwinner source request");
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

  function explicitItemwinnerUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname.toLowerCase() === "wing.coupang.com" &&
        /item[-_]?winner|price/i.test(`${url.pathname}${url.hash}`);
    } catch {
      return false;
    }
  }

  function validCapture(body, plan) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return false;
    const allowed = ["providerVendorId", "observedAt", "data", "kpis", "url", "title", "timestamp"];
    if (Object.keys(body).some((key) => !allowed.includes(key))) return false;
    if (typeof body.providerVendorId !== "string" || !body.providerVendorId.trim() ||
      body.providerVendorId !== plan.expectedVendorId ||
      typeof body.observedAt !== "string" || !Number.isFinite(Date.parse(body.observedAt)) ||
      !Array.isArray(body.data) ||
      !body.data.every((row) => row && typeof row === "object" && !Array.isArray(row)) ||
      body.data.length > 100000 ||
      !body.kpis || typeof body.kpis !== "object" || Array.isArray(body.kpis) ||
      !explicitItemwinnerUrl(body.url) || typeof body.url !== "string" || body.url.length > 2048 ||
      body.url !== plan.targetUrl ||
      (body.title !== undefined && (typeof body.title !== "string" || body.title.length > 500)) ||
      (body.timestamp !== undefined && (typeof body.timestamp !== "string" || !Number.isFinite(Date.parse(body.timestamp))))) {
      return false;
    }
    return DATE.test(plan.businessDate);
  }

  function create(options) {
    const active = new Map();
    const wire = root.KidItemSourcingAttemptWire.create({
      chrome: options.chrome,
      // Terminal transport composes sourcePath/:attemptId/:terminalAction.
      // Reads stay explicit below because the status route is also under
      // /attempts, while the source status route is not.
      sourcePath: `${SOURCE_PATH}/attempts`,
      requestFailureMessage: "Wing 아이템위너 owner 요청 실패",
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
        `${SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}`,
      ).catch((error) => {
        throw Object.assign(error, {
          code: !error.status || error.status >= 500
            ? "SOURCE_OWNER_UNAVAILABLE"
            : error.code,
        });
      });
      const plan = value?.plan;
      if (value?.attemptId !== attemptId || !UUID.test(value.attemptToken || "") ||
        !["RUNNING", "COMPLETE", "FAILED"].includes(value.state) ||
        plan?.sourceType !== "coupang_wing_itemwinner" || plan?.parserVersion !== "wing-itemwinner-v1" ||
        plan?.pageType !== "itemwinner" || !UUID.test(value.channelAccountId || "") ||
        plan.channelAccountId !== value.channelAccountId || typeof plan.expectedVendorId !== "string" ||
        !plan.expectedVendorId.trim() || !DATE.test(plan.businessDate || "") ||
        !explicitItemwinnerUrl(plan.targetUrl) ||
        !value.expiresAt || !Number.isFinite(Date.parse(value.expiresAt))) {
        throw new Error("Wing 아이템위너 owner 응답이 일치하지 않습니다");
      }
      const prior = active.get(environmentId)?.control;
      if (prior?.attemptId === attemptId &&
        (prior.attemptToken !== value.attemptToken ||
          prior.expiresAt !== value.expiresAt ||
          stableStringify(prior.plan) !== stableStringify(plan))) {
        throw new Error("Wing 아이템위너 동결 수집 허가가 변경되었습니다.");
      }
      return value;
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

    function terminal(environmentId, work, kind, body, checksum) {
      work.terminal ||= { kind, body, checksum };
      if (work.terminalPromise) return work.terminalPromise;
      work.terminalPromise = submitTerminal(environmentId, work)
        .finally(() => { work.terminalPromise = null; });
      return work.terminalPromise;
    }

    async function submitTerminal(environmentId, work) {
      const terminalRequest = work.terminal;
      try {
        work.control = await read(environmentId, work.attemptId);
        if (work.control.state === "RUNNING" && Date.now() < Date.parse(work.control.expiresAt)) {
          await wire.terminal(config(environmentId), work.control, {
            method: "POST",
            suffix: terminalRequest.kind === "complete" ? "/complete" : "/fail",
            body: terminalRequest.body,
          }, undefined, terminalRequest.body?.code === "USER_CANCELLED"
            ? {}
            : { shouldContinue: () => isActive(work.attemptId, environmentId) });
        }
      } catch {
        // A lost acknowledgement is reconciled against the exact requested
        // terminal body below. No observed terminal state is guessed.
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
      if (observed.state === "RUNNING") {
        return { ...outcome(observed), continuationRequired: false, errorCode: "SOURCE_OWNER_UNAVAILABLE" };
      }
      if (observed.state === "FAILED" && terminalRequest.kind === "complete") {
        work.terminal = null;
        return finish(environmentId, observed);
      }
      if (terminalRequest.kind === "complete" &&
        (observed.state !== "COMPLETE" || observed.contentChecksum !== terminalRequest.checksum)) {
        return {
          ...outcome(observed),
          success: false,
          continuationRequired: false,
          errorCode: "SOURCE_OWNER_UNAVAILABLE",
          error: "Wing itemwinner completion acknowledgement did not match the capture body.",
        };
      }
      if (terminalRequest.kind === "fail" &&
        (observed.state !== "FAILED" || observed.errorCode !== terminalRequest.body.code ||
          observed.errorMessage !== terminalRequest.body.message)) {
        return {
          ...outcome(observed),
          success: false,
          continuationRequired: false,
          errorCode: "SOURCE_OWNER_UNAVAILABLE",
          error: "Wing itemwinner failure acknowledgement did not match the requested body.",
        };
      }
      work.terminal = null;
      return finish(environmentId, observed);
    }

    async function contentStep(message, sender) {
      if (!Number.isInteger(sender?.tab?.id) || (sender.frameId !== undefined && sender.frameId !== 0) ||
        new URL(sender.url || sender.tab.url).origin !== "https://wing.coupang.com") {
        throw new Error("Wing 아이템위너 발신 탭이 유효하지 않습니다.");
      }
      const environmentId = await options.environmentForTab(sender.tab.id);
      const work = active.get(environmentId);
      const session = await options.sessions.getOwned(message.attemptId, environmentId);
      if (!work || work.attemptId !== message.attemptId || work.terminal ||
        session?.producer !== PRODUCER) {
        throw new Error("Wing 아이템위너 탭 소유권이 없습니다.");
      }
      if (!(await isActive(message.attemptId, environmentId))) {
        throw new Error("Wing 아이템위너 수집이 중단되었습니다.");
      }
      if (await options.ownedTab(environmentId, message.attemptId) !== sender.tab.id) {
        throw new Error("Wing 아이템위너 탭 소유권이 없습니다.");
      }
      const step = message.step;
      const fields = ["action", "attemptId", "step", ...(step === "capture" ? ["body"] : [])];
      if (!["resume", "checkpoint", "capture"].includes(step) ||
        Object.keys(message).some((key) => !fields.includes(key))) {
        throw new Error("Wing 아이템위너 요청이 유효하지 않습니다.");
      }
      if (step === "resume") work.control = await read(environmentId, work.attemptId);
      if (!work.control || work.control.state !== "RUNNING" || Date.now() >= Date.parse(work.control.expiresAt)) {
        throw new Error("Wing 아이템위너 시도가 종료되었습니다.");
      }
      if (step === "checkpoint") return { success: true };
      if (step === "resume") return { success: true, control: safeControl(work.control) };

      const body = message.body;
      if (!validCapture(body, work.control.plan)) {
        throw new Error("Wing 아이템위너 capture가 유효하지 않습니다.");
      }
      const checksum = await sha256Hex(body);
      return terminal(environmentId, work, "complete", body, checksum)
        .then((result) => result.success
          ? { ...result, itemwinnerReceipt: { complete: true } }
          : result);
    }

    function handleMessage(message, sender, sendResponse) {
      if (message?.action !== "wingItemwinnerSourceStep") return false;
      contentStep(message, sender).then(sendResponse).catch((error) => sendResponse({
        success: false,
        errorCode: error.code === "SOURCE_OWNER_UNAVAILABLE" ||
          (error.code === "SOURCE_OWNER_REQUEST_FAILED" && (!error.status || error.status >= 500))
          ? "SOURCE_OWNER_UNAVAILABLE" : "SOURCE_RECEIPT_REJECTED",
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
        if (owner.state === "RUNNING") throw new Error("다른 Wing 아이템위너 수집이 진행 중입니다.");
        await finish(environmentId, owner);
      }
      const work = active.get(environmentId);
      work.control = control;
      await options.sessions.start({ attemptId, environmentId, producer: PRODUCER });
      if (!(await isActive(attemptId, environmentId))) return stoppedOutcome(attemptId);
      let collected;
      try {
        collected = await options.collect({ environmentId, attemptId, control: safeControl(control) });
      } catch (error) {
        collected = { success: false, error: error.message, errorCode: error.code };
      }
      if (work.terminal) return terminal(environmentId, work);
      let observed;
      try { observed = await read(environmentId, attemptId); }
      catch { return { ...outcome(control), continuationRequired: false, errorCode: "SOURCE_OWNER_UNAVAILABLE" }; }
      if (observed.state !== "RUNNING") return finish(environmentId, observed);
      work.control = observed;
      if (!(await isActive(attemptId, environmentId))) return stoppedOutcome(attemptId);
      if (!collected?.success && collected?.errorCode !== "SOURCE_OWNER_UNAVAILABLE") {
        if (collected?.attentionRequired) await options.sessions.requireAttention(attemptId, {
          reason: collected.reason || "marketplace_login",
          message: collected.error || "Wing 로그인이 필요합니다.",
        });
        return terminal(environmentId, work, "fail", wire.failure(
          { code: collected?.errorCode, message: collected?.error },
          "WING_ITEMWINNER_COLLECTION_FAILED",
          "Wing 아이템위너 수집 실패",
        ));
      }
      if (collected?.success) {
        return {
          ...outcome(observed),
          continuationRequired: false,
          errorCode: "SOURCE_OWNER_UNAVAILABLE",
          error: "Wing itemwinner capture returned before the owner became terminal.",
        };
      }
      return { ...outcome(observed), continuationRequired: false, errorCode: "SOURCE_OWNER_UNAVAILABLE" };
    }

    function run({ environmentId, attemptId }) {
      const running = active.get(environmentId);
      if (running) {
        if (running.attemptId !== attemptId) throw new Error("다른 Wing 아이템위너 수집이 진행 중입니다.");
        if (running.promise) return running.promise;
      }
      const work = running || { attemptId };
      work.promise = Promise.resolve().then(() => execute(environmentId, attemptId))
        .finally(() => {
          work.promise = null;
          if (active.get(environmentId) === work && !work.terminal) active.delete(environmentId);
        });
      active.set(environmentId, work);
      return work.promise;
    }

    async function cancel({ environmentId, attemptId }) {
      const running = active.get(environmentId);
      if (running && running.attemptId !== attemptId) throw new Error("다른 Wing 아이템위너 수집이 진행 중입니다.");
      const work = running || { attemptId };
      active.set(environmentId, work);
      try {
        return await terminal(environmentId, work, "fail", {
          code: "USER_CANCELLED",
          message: "사용자가 Wing 아이템위너 수집을 중단했습니다.",
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
        try { owner = await read(environmentId, session.attemptId); } catch { continue; }
        if (owner.state !== "RUNNING") await finish(environmentId, owner);
      }
    }

    return Object.freeze({ run, recover, handleMessage, cancel });
  }

  root.KidItemWingItemwinnerSourceOwner = Object.freeze({ create, parseAction });
})(globalThis);
