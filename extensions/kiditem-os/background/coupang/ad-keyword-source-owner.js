(function installAdKeywordSourceOwner(root) {
  "use strict";
  const SOURCE_PATH = "/api/ads/ad-keywords/attempts";
  const PRODUCER = "advertising.ad_keyword";
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function parseAction(message, action) {
    if (!message || message.action !== action || Object.keys(message).length !== 2 || !UUID.test(message.attemptId || "")) {
      throw new Error("Invalid advertising keyword source request");
    }
    return { attemptId: message.attemptId };
  }

  function create(options) {
    const active = new Map();
    const wire = root.KidItemSourcingAttemptWire.create({ chrome: options.chrome, sourcePath: SOURCE_PATH,
      requestFailureMessage: "광고 키워드 owner 요청 실패" });
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
      const value = await wire.requestJsonWithRetry(config(environmentId), `${SOURCE_PATH}/${attemptId}/control`);
      if (value?.attemptId !== attemptId || !UUID.test(value.attemptToken || "") ||
        !["RUNNING", "COMPLETE", "FAILED"].includes(value.state) ||
        value.plan?.sourceType !== "coupang_ad_keyword" || value.plan?.parserVersion !== "ad-keyword-v1" ||
        value.plan?.windowDays !== 7 || typeof value.plan?.expectedAdvertiserId !== "string" || !value.plan.expectedAdvertiserId.trim() ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value.plan?.startDate || "") ||
        Date.parse(value.plan?.endDate) - Date.parse(value.plan?.startDate) !== 6 * 86_400_000 ||
        value.channelAccountId !== value.plan.channelAccountId || !UUID.test(value.channelAccountId || "") ||
        !Number.isFinite(Date.parse(value.expiresAt)) || !Array.isArray(value.queue)) {
        throw new Error("광고 키워드 owner 응답이 일치하지 않습니다");
      }
      const prior = active.get(environmentId)?.control;
      if (prior?.attemptId === attemptId && (prior.attemptToken !== value.attemptToken ||
        prior.expiresAt !== value.expiresAt || JSON.stringify(prior.plan) !== JSON.stringify(value.plan))) {
        throw new Error("광고 키워드 동결 수집 허가가 변경되었습니다.");
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
        new URL(sender.url || sender.tab.url).origin !== "https://advertising.coupang.com") throw new Error("광고 키워드 발신 탭이 유효하지 않습니다.");
      const environmentId = await options.environmentForTab(sender.tab.id);
      const work = active.get(environmentId);
      const session = await options.sessions.getOwned(message.attemptId, environmentId);
      if (!work || work.attemptId !== message.attemptId || work.terminal || session?.producer !== PRODUCER) {
        throw new Error("광고 키워드 탭 소유권이 없습니다.");
      }
      if (!(await isActive(message.attemptId, environmentId))) throw new Error("광고 키워드 수집이 중단되었습니다.");
      if (await options.ownedTab(environmentId, message.attemptId) !== sender.tab.id) {
        throw new Error("광고 키워드 탭 소유권이 없습니다.");
      }
      const step = message.step;
      const group = step === "group_plan" || step === "group_result";
      const allowed = ["action", "attemptId", "step", ...(step === "checkpoint" ? [] : ["body"]), ...(group ? ["sequence"] : [])];
      if (!["checkpoint", "roster", "group_plan", "group_result"].includes(step) ||
        Object.keys(message).some(key => !allowed.includes(key)) ||
        (group && (!Number.isSafeInteger(message.sequence) || message.sequence < 0))) throw new Error("광고 키워드 receipt가 유효하지 않습니다.");
      if (step !== "checkpoint") work.control = await read(environmentId, work.attemptId);
      if (work.terminal || work.control.state !== "RUNNING" || Date.now() >= Date.parse(work.control.expiresAt)) throw new Error("광고 키워드 시도가 종료되었습니다.");
      if (step === "checkpoint") return { success: true };
      const fields = step === "roster" ? ["advertiserId", "campaigns", "pages"]
        : step === "group_plan" ? ["advertiserId", "adsArrayObserved", "adGroupName", "enumeratedAdCount", "ads"]
        : ["advertiserId", "capturedAt", "ads", "rows"];
      if (!message.body || typeof message.body !== "object" || Array.isArray(message.body) ||
        Object.keys(message.body).some(key => !fields.includes(key)) ||
        fields.some(key => !(key in message.body)) ||
        message.body.advertiserId !== work.control.plan.expectedAdvertiserId ||
        (group && !work.control.queue.some(unit => unit.sequence === message.sequence))) throw new Error("광고 키워드 계정 또는 그룹이 일치하지 않습니다.");
      const suffix = step === "roster" ? "/roster" : `/groups/${message.sequence}/${step === "group_plan" ? "plan" : "result"}`;
      await wire.terminal(
        config(environmentId),
        work.control,
        { method: "PUT", suffix, body: message.body },
        undefined,
        { shouldContinue: () => isActive(message.attemptId, environmentId) },
      );
      work.control = await read(environmentId, work.attemptId);
      return { success: true, control: safeControl(work.control) };
    }

    function handleMessage(message, sender, sendResponse) {
      if (message?.action !== "advertisingKeywordSourceStep") return false;
      contentStep(message, sender).then(sendResponse).catch(error => sendResponse({ success: false,
        errorCode: error.code === "SOURCE_OWNER_REQUEST_FAILED" && (!error.status || error.status >= 500)
          ? "SOURCE_OWNER_UNAVAILABLE" : "SOURCE_RECEIPT_REJECTED",
        error: error.message }));
      return true;
    }

    async function execute(environmentId, attemptId) {
      const existingSession = await options.sessions.getOwned(attemptId, environmentId).catch(() => null);
      if (existingSession && !(await isActive(attemptId, environmentId))) return stoppedOutcome(attemptId);
      const control = await read(environmentId, attemptId);
      if (control.state !== "RUNNING") return finish(environmentId, control);
      if (Date.now() >= Date.parse(control.expiresAt)) throw new Error("광고 키워드 수집 허가가 만료되었습니다.");
      for (const previous of await options.sessions.list(environmentId)) {
        if (previous.producer !== PRODUCER || previous.attemptId === attemptId) continue;
        const owner = await read(environmentId, previous.attemptId);
        if (owner.state === "RUNNING") throw new Error("다른 광고 키워드 수집이 진행 중입니다.");
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
          { code: collected?.errorCode, message: collected?.error }, "AD_KEYWORD_COLLECTION_FAILED", "광고 키워드 수집 실패"));
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
        if (running.attemptId !== attemptId) throw new Error("다른 광고 키워드 수집이 진행 중입니다.");
        if (running.promise) return running.promise;
      }
      const work = running || { attemptId };
      work.promise = Promise.resolve().then(() => execute(environmentId, attemptId))
        .finally(() => { work.promise = null; if (active.get(environmentId) === work && !work.terminal) active.delete(environmentId); });
      active.set(environmentId, work);
      return work.promise;
    }

    async function cancel({ environmentId, attemptId }) {
      const running = active.get(environmentId);
      if (running && running.attemptId !== attemptId) throw new Error("다른 광고 키워드 수집이 진행 중입니다.");
      const work = running || { attemptId };
      active.set(environmentId, work);
      try {
        return await terminal(environmentId, work, "fail", { code: "USER_CANCELLED", message: "사용자가 광고 키워드 수집을 중단했습니다." });
      } finally {
        if (!work.promise && !work.terminal && active.get(environmentId) === work) active.delete(environmentId);
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
    return Object.freeze({ run, recover, handleMessage, cancel });
  }
  root.KidItemAdKeywordSourceOwner = Object.freeze({ create, parseAction });
})(globalThis);
