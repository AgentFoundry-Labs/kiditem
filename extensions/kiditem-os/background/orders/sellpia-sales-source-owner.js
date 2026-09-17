(function installSellpiaSalesSourceOwner(root) {
  "use strict";

  const SOURCE_PATH = "/api/sellpia-sales/attempts";
  const PRODUCER = "orders.sellpia_sales";
  const SOURCE_ORIGIN = "https://kiditem.sellpia.com";
  const SOURCE_ACCOUNT_KEY = "kiditem";
  const PARSER_VERSION = "sellpia-sales-v1";
  const SOURCE_TYPE = "sellpia_sales_daily";
  const MAX_DAYS = 100;
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function parseAction(message, action = "collectSellpiaSaleSummary") {
    if (
      !message ||
      message.action !== action ||
      Object.keys(message).length !== 2 ||
      !UUID.test(message.attemptId || "")
    ) {
      throw new Error("Invalid Sellpia sales source request");
    }
    return { attemptId: message.attemptId };
  }

  function boundedText(value, fallback, maximum) {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim();
    return normalized && normalized.length <= maximum ? normalized : fallback;
  }

  function normalizeFailureCode(value) {
    const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
    return /^[A-Z0-9_:-]{1,100}$/.test(normalized)
      ? normalized
      : "SELLPIA_SALES_COLLECTION_FAILED";
  }

  function isDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parts = value.split("-").map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return date.getUTCFullYear() === parts[0]
      && date.getUTCMonth() === parts[1] - 1
      && date.getUTCDate() === parts[2];
  }

  function nextDate(value) {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }

  function parseAttempt(value, attemptId, requireToken = false) {
    const plan = value?.plan;
    const range = plan?.range;
    const businessDates = plan?.businessDates;
    const validDates = Array.isArray(businessDates)
      && businessDates.length > 0
      && businessDates.length <= MAX_DAYS
      && businessDates.every(isDate)
      && businessDates[0] === range?.from
      && businessDates[businessDates.length - 1] === range?.to
      && businessDates.every((date, index) => index === 0 || date === nextDate(businessDates[index - 1]));
    const tokenValid = value?.attemptToken === undefined || UUID.test(value.attemptToken || "");
    if (
      value?.attemptId !== attemptId ||
      !UUID.test(attemptId) ||
      !tokenValid ||
      (requireToken && !UUID.test(value?.attemptToken || "")) ||
      !["RUNNING", "COMPLETE", "FAILED"].includes(value?.state) ||
      plan?.sourceType !== SOURCE_TYPE ||
      plan?.parserVersion !== PARSER_VERSION ||
      plan?.sourceOrigin !== SOURCE_ORIGIN ||
      plan?.sourcePath !== "/sale_summary.html?mode=main_link" ||
      plan?.sourceAccountKey !== SOURCE_ACCOUNT_KEY ||
      !isDate(range?.from) ||
      !isDate(range?.to) ||
      range.from > range.to ||
      !validDates ||
      !Number.isFinite(Date.parse(value?.expiresAt || "")) ||
      (value?.actualCutoffAt !== null &&
        !Number.isFinite(Date.parse(value?.actualCutoffAt || ""))) ||
      (value?.completedAt !== null &&
        !Number.isFinite(Date.parse(value?.completedAt || ""))) ||
      (value?.contentChecksum !== null &&
        !/^[0-9a-f]{64}$/i.test(value?.contentChecksum || "")) ||
      (value?.contentByteCount !== null &&
        (!Number.isInteger(value.contentByteCount) || value.contentByteCount < 0)) ||
      !Number.isInteger(value?.rowCount) ||
      value.rowCount < 0 ||
      !Number.isInteger(value?.sellerCount) ||
      value.sellerCount < 0 ||
      !Array.isArray(value?.businessDates) ||
      value.businessDates.some((date) => !isDate(date)) ||
      (value?.errorCode !== null && typeof value.errorCode !== "string") ||
      (value?.errorMessage !== null && typeof value.errorMessage !== "string")
    ) {
      throw new Error("SELLPIA_SALES_PLAN_INVALID");
    }
    if (value.state === "RUNNING" && Date.parse(value.expiresAt) <= Date.now()) {
      throw new Error("ATTEMPT_EXPIRED");
    }
    return value;
  }

  function outcome(attempt, extra = {}) {
    return {
      success: attempt?.state === "COMPLETE",
      attemptId: attempt?.attemptId,
      terminalState: attempt?.state,
      continuationRequired: attempt?.state === "RUNNING",
      ...(attempt?.state === "FAILED" && attempt.errorCode
        ? { errorCode: attempt.errorCode }
        : {}),
      ...(attempt?.state === "FAILED" && attempt.errorMessage
        ? { error: attempt.errorMessage }
        : {}),
      ...extra,
    };
  }

  function unavailable(attemptId, error) {
    return outcome(
      { attemptId, state: "RUNNING" },
      {
        continuationRequired: false,
        errorCode: "SOURCE_OWNER_UNAVAILABLE",
        error: String(error?.message || "Sellpia sales source owner is unavailable.").slice(0, 300),
      },
    );
  }

  async function isLocallyActive(sessions, attemptId, environmentId, allowUnstarted = false) {
    // A common isActive implementation intentionally returns false for a
    // missing session. Look up ownership first so a fresh owner can reach the
    // atomic start/onStarted admission path.
    if (typeof sessions.getOwned === "function") {
      let session;
      try {
        session = await sessions.getOwned(attemptId, environmentId);
      } catch {
        return false;
      }
      if (!session) return allowUnstarted;
      if (session.producer !== PRODUCER) return false;
    } else if (allowUnstarted) {
      return true;
    }
    if (typeof sessions.isActive !== "function") return true;
    try {
      return (await sessions.isActive(attemptId, environmentId, PRODUCER)) !== false;
    } catch {
      return false;
    }
  }

  function cancelled(attemptId) {
    return {
      success: false,
      attemptId,
      terminalState: "RUNNING",
      continuationRequired: false,
      errorCode: "COLLECTION_CANCELLED",
      error: "Sellpia sales collection was cancelled.",
    };
  }

  function config(options, environmentId) {
    return {
      apiBase: "",
      headers: { "Content-Type": "application/json" },
      request: (path, init) => options.request(environmentId, path, init),
    };
  }

  function collectionFor(options, environmentId, attemptId, assertActive) {
    return {
      attemptId,
      environmentId,
      assertActive,
      isActive: () => isLocallyActive(options.sessions, attemptId, environmentId),
      attachTab: (tab, attachment = {}) => options.sessions.attachTab(attemptId, {
        tabId: tab.id,
        windowId: tab.windowId,
        closeOnCancel: attachment.owned !== false,
      }),
      detachTab: (tab, attachment = {}) => options.sessions.detachTab(attemptId, {
        tabId: tab.id,
        closeManagedTab: attachment.owned !== false,
      }),
      progress: (progress) => options.sessions.progress(attemptId, progress),
    };
  }

  function normalizePayload(collected, plan) {
    const payload = collected?.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("SELLPIA_SALES_PAYLOAD_INVALID");
    }
    if (
      payload.range?.from !== plan.range.from ||
      payload.range?.to !== plan.range.to ||
      !Array.isArray(payload.sellers)
    ) {
      throw new Error("SELLPIA_SALES_SCOPE_MISMATCH");
    }
    const capturedAt = typeof payload.capturedAt === "string"
      ? payload.capturedAt
      : new Date().toISOString();
    return {
      range: { from: plan.range.from, to: plan.range.to },
      sellers: payload.sellers,
      ...(payload.provenance !== undefined ? { provenance: payload.provenance } : {}),
      capturedAt,
    };
  }

  function create(options) {
    const active = new Map();
    const wire = root.KidItemSourcingAttemptWire.create({
      chrome: options.chrome,
      sourcePath: SOURCE_PATH,
      requestFailureMessage: "Sellpia sales owner request failed",
    });

    async function read(environmentId, attemptId) {
      const value = await wire.requestJsonWithRetry(
        config(options, environmentId),
        `${SOURCE_PATH}/${encodeURIComponent(attemptId)}`,
        { method: "GET" },
      );
      return parseAttempt(value, attemptId);
    }

    async function readControl(environmentId, attemptId) {
      const value = await wire.requestJsonWithRetry(
        config(options, environmentId),
        `${SOURCE_PATH}/${encodeURIComponent(attemptId)}/control`,
        { method: "GET" },
      );
      return parseAttempt(value, attemptId, true);
    }

    async function finish(environmentId, attempt) {
      const session = await options.sessions.getOwned(attempt.attemptId, environmentId);
      if (
        attempt.state === "FAILED" &&
        attempt.errorCode !== "COLLECTION_CANCELLED" &&
        attempt.errorCode !== "USER_CANCELLED" &&
        session?.attention
      ) return outcome(attempt);
      if (session) {
        try {
          await options.sessions.cancel(attempt.attemptId, { closeManagedTab: true });
        } catch {
          // The owner is terminal; retain the result if Chrome cannot close a tab.
        }
      }
      return outcome(attempt);
    }

    async function submitFailure(environmentId, attempt, body, terminalOptions = {}) {
      return wire.terminal(
        config(options, environmentId),
        attempt,
        { method: "POST", suffix: "/fail", body },
        (value) => parseAttempt(value, attempt.attemptId),
        terminalOptions,
      );
    }

    async function submitComplete(environmentId, attempt, body, terminalOptions = {}) {
      return wire.terminal(
        config(options, environmentId),
        attempt,
        { method: "POST", suffix: "/complete", body },
        (value) => parseAttempt(value, attempt.attemptId),
        terminalOptions,
      );
    }

    async function terminal(environmentId, work) {
      const requested = work.terminal;
      let directError = null;
      const cancellationOnly =
        requested.kind === "failure" && requested.body?.errorCode === "COLLECTION_CANCELLED";
      const terminalOptions = cancellationOnly
        ? {}
        : {
            shouldContinue: () => isLocallyActive(
              options.sessions,
              work.attemptId,
              environmentId,
            ),
            cancelCode: "COLLECTION_CANCELLED",
            cancelMessage: "Sellpia sales collection was cancelled.",
          };
      try {
        if (
          !(await isLocallyActive(options.sessions, work.attemptId, environmentId)) &&
          !cancellationOnly
        ) {
          work.terminal = null;
          return cancelled(work.attemptId);
        }
        work.control = await readControl(environmentId, work.attemptId);
        if (
          !(await isLocallyActive(options.sessions, work.attemptId, environmentId)) &&
          !cancellationOnly
        ) {
          work.terminal = null;
          return cancelled(work.attemptId);
        }
        if (requested.kind === "complete") {
          await submitComplete(
            environmentId,
            work.control,
            requested.body,
            terminalOptions,
          );
        } else {
          await submitFailure(
            environmentId,
            work.control,
            requested.body,
            terminalOptions,
          );
        }
      } catch (error) {
        directError = error;
      }

      let observed;
      try {
        observed = await read(environmentId, work.attemptId);
      } catch (error) {
        return unavailable(work.attemptId, directError || error);
      }
      if (observed.state !== "RUNNING") {
        work.terminal = null;
        return finish(environmentId, observed);
      }
      return unavailable(
        work.attemptId,
        directError || new Error("Sellpia sales terminal state is still running."),
      );
    }

    function requestTerminal(environmentId, work, terminalRequest) {
      work.terminal ||= terminalRequest;
      if (work.terminalPromise) return work.terminalPromise;
      work.terminalPromise = terminal(environmentId, work)
        .finally(() => {
          work.terminalPromise = null;
          // An operator stop can settle after both the run and cancel returned.
          if (!work.promise && !work.terminal && active.get(environmentId) === work) {
            active.delete(environmentId);
          }
        });
      return work.terminalPromise;
    }

    async function execute(environmentId, attemptId, work) {
      let attempt = await readControl(environmentId, attemptId);
      work.control = attempt;
      if (work.terminal) return requestTerminal(environmentId, work, work.terminal);
      if (attempt.state !== "RUNNING") return finish(environmentId, attempt);

      for (const previous of await options.sessions.list(environmentId)) {
        if (previous.producer !== PRODUCER || previous.attemptId === attemptId) continue;
        const previousAttempt = await read(environmentId, previous.attemptId);
        if (previousAttempt.state === "RUNNING") {
          throw new Error("이전 셀피아 판매 현황 수집이 아직 진행 중입니다. 그 수집이 끝난 뒤 다시 시작해 주세요.");
        }
        await finish(environmentId, previousAttempt);
      }

      if (!(await isLocallyActive(options.sessions, attemptId, environmentId, true))) {
        return cancelled(attemptId);
      }
      const started = await options.sessions.start({ environmentId, attemptId, producer: PRODUCER });
      if (started === null || started === false) return cancelled(attemptId);
      const assertActive = async () => {
        if (work.terminal || work.attemptId !== attemptId) return false;
        if (!(await isLocallyActive(options.sessions, attemptId, environmentId))) return false;
        try {
          const session = await options.sessions.getOwned(attemptId, environmentId);
          if (!session || session.producer !== PRODUCER) return false;
          const current = await readControl(environmentId, attemptId);
          work.control = current;
          const expiresAt = Date.parse(current.expiresAt);
          return current.state === "RUNNING"
            && Number.isFinite(expiresAt)
            && expiresAt > Date.now();
        } catch {
          return false;
        }
      };
      let collected;
      try {
        collected = await options.collect({
          ...collectionFor(options, environmentId, attemptId, assertActive),
          plan: attempt.plan,
        });
      } catch (error) {
        collected = {
          success: false,
          errorCode: error?.code,
          error: error?.message,
        };
      }

      if (!(await isLocallyActive(options.sessions, attemptId, environmentId))) {
        const current = await read(environmentId, attemptId).catch(() => null);
        if (current && current.state !== "RUNNING") return finish(environmentId, current);
        return cancelled(attemptId);
      }

      let observed;
      try {
        observed = await read(environmentId, attemptId);
      } catch (error) {
        return unavailable(attemptId, error);
      }
      if (observed.state !== "RUNNING") return finish(environmentId, observed);
      work.control = { ...observed, attemptToken: attempt.attemptToken };

      if (collected?.success !== true || !collected?.payload) {
        if (
          collected?.pendingLogin === true ||
          collected?.errorCode === "sellpia_login_required" ||
          collected?.attentionRequired === true
        ) {
          await options.sessions.requireAttention(attemptId, {
            reason: collected?.reason || "marketplace_login",
            message: collected?.error || "Sellpia login is required.",
          });
        }
        return requestTerminal(environmentId, work, {
          kind: "failure",
          body: {
            errorCode: normalizeFailureCode(collected?.errorCode),
            errorMessage: boundedText(
              collected?.error,
              "Sellpia sales collection failed.",
              300,
            ),
          },
        });
      }

      let body;
      try {
        body = normalizePayload(collected, attempt.plan);
      } catch (error) {
        return requestTerminal(environmentId, work, {
          kind: "failure",
          body: {
            errorCode: "SELLPIA_SALES_PAYLOAD_INVALID",
            errorMessage: boundedText(
              error?.message,
              "Sellpia sales payload could not be uploaded.",
              300,
            ),
          },
        });
      }

      await options.sessions.progress(attemptId, {
        current: 1,
        total: 2,
        completed: 1,
        failed: 0,
        label: "Sellpia sales capture collected · publishing",
      });
      return requestTerminal(environmentId, work, { kind: "complete", body });
    }

    function run({ environmentId, attemptId }) {
      const current = active.get(environmentId);
      if (current) {
        if (current.attemptId !== attemptId) {
          return Promise.reject(new Error("이전 셀피아 판매 현황 수집이 아직 진행 중입니다. 그 수집이 끝난 뒤 다시 시작해 주세요."));
        }
        if (current.promise) return current.promise;
      }
      const work = current || { attemptId, terminal: null, control: null };
      work.promise = Promise.resolve()
        .then(() => execute(environmentId, attemptId, work))
        .finally(() => {
          work.promise = null;
          if (active.get(environmentId) === work && !work.terminal) active.delete(environmentId);
        });
      active.set(environmentId, work);
      return work.promise;
    }

    async function cancel({ environmentId, attemptId }) {
      const current = active.get(environmentId);
      if (current && current.attemptId !== attemptId) {
        throw new Error("이전 셀피아 판매 현황 수집이 아직 진행 중입니다. 그 수집이 끝난 뒤 다시 시작해 주세요.");
      }
      const work = current || { attemptId, terminal: null, control: null };
      active.set(environmentId, work);
      try {
        const attempt = await read(environmentId, attemptId);
        if (attempt.state !== "RUNNING") return finish(environmentId, attempt);
        return requestTerminal(environmentId, work, {
          kind: "failure",
          body: {
            errorCode: "COLLECTION_CANCELLED",
            errorMessage: "Sellpia sales collection was cancelled.",
          },
        });
      } finally {
        if (!work.promise && !work.terminal && active.get(environmentId) === work) {
          active.delete(environmentId);
        }
      }
    }

    async function recover(environmentId) {
      if (active.has(environmentId)) return;
      for (const session of await options.sessions.list(environmentId)) {
        if (session.producer !== PRODUCER) continue;
        const attempt = await read(environmentId, session.attemptId);
        if (attempt.state !== "RUNNING") await finish(environmentId, attempt);
      }
    }

    return Object.freeze({ run, recover, cancel });
  }

  root.KidItemSellpiaSalesSourceOwner = Object.freeze({ create, parseAction });
})(globalThis);
