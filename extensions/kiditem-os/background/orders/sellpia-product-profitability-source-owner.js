(function installSellpiaProductProfitabilitySourceOwner(root) {
  "use strict";

  const SOURCE_PATH = "/api/sellpia-product-sales/attempts";
  const SOURCE_STATUS_SUFFIX = "/status";
  const PRODUCER = "orders.sellpia_product_profitability";
  const PARSER_VERSION = "sellpia-profitability-v2";
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function parseAction(message, action = "collectSellpiaProductProfit") {
    if (
      !message ||
      message.action !== action ||
      Object.keys(message).length !== 2 ||
      !UUID.test(message.attemptId || "")
    ) {
      throw new Error("Invalid Sellpia profitability source request");
    }
    return { attemptId: message.attemptId };
  }

  function boundedText(value, fallback, maximum) {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim();
    return normalized && normalized.length <= maximum ? normalized : fallback;
  }

  function isDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parts = value.split("-").map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return date.getUTCFullYear() === parts[0]
      && date.getUTCMonth() === parts[1] - 1
      && date.getUTCDate() === parts[2];
  }

  function parsePlan(value) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !isDate(value.from) ||
      !isDate(value.to) ||
      value.from > value.to ||
      !Array.isArray(value.coveredMonths) ||
      value.coveredMonths.length < 1 ||
      value.coveredMonths.length > 15 ||
      value.coveredMonths.some((month) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    ) {
      throw new Error("SELLPIA_PROFITABILITY_PLAN_INVALID");
    }
    return {
      from: value.from,
      to: value.to,
      coveredMonths: [...value.coveredMonths],
    };
  }

  function parseAttempt(value, attemptId, requireToken = false) {
    const attemptToken = value?.attemptToken;
    if (
      !value ||
      value.attemptId !== attemptId ||
      !UUID.test(attemptId) ||
      (attemptToken !== undefined && !UUID.test(attemptToken || "")) ||
      (requireToken && !UUID.test(attemptToken || "")) ||
      !["RUNNING", "COMPLETE", "FAILED"].includes(value.state) ||
      !Number.isFinite(Date.parse(value.expiresAt || "")) ||
      (value.errorCode !== null && value.errorCode !== undefined && typeof value.errorCode !== "string") ||
      (value.errorMessage !== null && value.errorMessage !== undefined && typeof value.errorMessage !== "string")
    ) {
      throw new Error("SELLPIA_PROFITABILITY_ATTEMPT_INVALID");
    }
    const plan = parsePlan(value.plan);
    if (value.state === "RUNNING" && Date.parse(value.expiresAt) <= Date.now()) {
      throw new Error("ATTEMPT_EXPIRED");
    }
    return { ...value, plan };
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
        error: String(error?.message || "Sellpia profitability source owner is unavailable.").slice(0, 300),
      },
    );
  }

  async function isLocallyActive(sessions, attemptId, environmentId, allowUnstarted = false) {
    // The common fence reports false for a missing session. Distinguish that
    // fresh state from a persisted stopped session before consulting isActive.
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
      error: "Sellpia profitability collection was cancelled.",
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

  function normalizePayload(collected, plan, attemptToken) {
    const payload = collected?.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("SELLPIA_PROFITABILITY_PAYLOAD_INVALID");
    }
    if (
      payload.range?.from !== plan.from ||
      payload.range?.to !== plan.to ||
      payload.parserVersion !== PARSER_VERSION ||
      !payload.provenance ||
      payload.provenance.source !== "sellpia_stat_prd_profit" ||
      payload.provenance.costBasis !== "ORDER_TIME_SUPPLY_COST" ||
      payload.provenance.vatIncluded !== true ||
      !Array.isArray(payload.products)
    ) {
      throw new Error("SELLPIA_PROFITABILITY_PAYLOAD_INVALID");
    }
    return {
      attemptToken,
      parserVersion: PARSER_VERSION,
      providerBackedEmptyProof: payload.products.length === 0,
      coveredMonths: [...plan.coveredMonths],
      provenance: payload.provenance,
      products: payload.products,
    };
  }

  function create(options) {
    if (
      typeof options?.request !== "function" ||
      typeof options?.collect !== "function" ||
      !options?.sessions
    ) {
      throw new Error("Sellpia profitability source-owner dependencies are required.");
    }
    const active = new Map();
    const wire = root.KidItemSourcingAttemptWire.create({
      chrome: options.chrome,
      sourcePath: SOURCE_PATH,
      requestFailureMessage: "Sellpia profitability owner request failed",
    });

    async function readControl(environmentId, attemptId) {
      const value = await wire.requestJsonWithRetry(
        config(options, environmentId),
        `${SOURCE_PATH}/${encodeURIComponent(attemptId)}`,
        { method: "GET" },
      );
      return parseAttempt(value, attemptId, true);
    }

    async function readStatus(environmentId, attemptId) {
      const value = await wire.requestJsonWithRetry(
        config(options, environmentId),
        `${SOURCE_PATH}/${encodeURIComponent(attemptId)}${SOURCE_STATUS_SUFFIX}`,
        { method: "GET" },
      );
      return parseAttempt(value, attemptId);
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
          // The source attempt is terminal; retain the result if cleanup races.
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
        { method: "POST", suffix: "", body },
        (value) => parseAttempt(value, attempt.attemptId),
        terminalOptions,
      );
    }

    function isRecoverableMissingLocalSession(environmentId, session, error) {
      return error?.status === 404
        && session?.environmentId === environmentId
        && session?.producer === PRODUCER;
    }

    async function terminal(environmentId, work) {
      const requested = work.terminal;
      let directError = null;
      let directAttempt = null;
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
            cancelMessage: "Sellpia profitability collection was cancelled.",
          };
      try {
        if (
          !(await isLocallyActive(options.sessions, work.attemptId, environmentId)) &&
          !cancellationOnly
        ) {
          work.terminal = null;
          return cancelled(work.attemptId);
        }
        if (!work.control) {
          throw new Error("SELLPIA_PROFITABILITY_ATTEMPT_CONTROL_UNAVAILABLE");
        }
        if (
          !(await isLocallyActive(options.sessions, work.attemptId, environmentId)) &&
          !cancellationOnly
        ) {
          work.terminal = null;
          return cancelled(work.attemptId);
        }
        if (requested.kind === "complete") {
          directAttempt = await submitComplete(
            environmentId,
            work.control,
            requested.body,
            terminalOptions,
          );
        } else {
          directAttempt = await submitFailure(
            environmentId,
            work.control,
            requested.body,
            terminalOptions,
          );
        }
      } catch (error) {
        directError = error;
      }

      // A successful terminal response is authoritative. A follow-up status
      // read is only reconciliation for a lost/failed terminal response; it
      // must not turn a committed COMPLETE into SOURCE_OWNER_UNAVAILABLE.
      if (directAttempt && directAttempt.state !== "RUNNING") {
        work.terminal = null;
        return finish(environmentId, directAttempt);
      }

      let observed;
      try {
        observed = await readStatus(environmentId, work.attemptId);
      } catch (error) {
        return unavailable(work.attemptId, directError || error);
      }
      if (observed.state !== "RUNNING") {
        work.terminal = null;
        return finish(environmentId, observed);
      }
      return unavailable(
        work.attemptId,
        directError || new Error("Sellpia profitability terminal state is still running."),
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
      const attempt = await readControl(environmentId, attemptId);
      work.control = attempt;
      if (work.terminal) return requestTerminal(environmentId, work, work.terminal);
      if (attempt.state !== "RUNNING") return finish(environmentId, attempt);

      for (const previous of await options.sessions.list(environmentId)) {
        if (previous.producer !== PRODUCER || previous.attemptId === attemptId) continue;
        let previousAttempt;
        try {
          previousAttempt = await readStatus(environmentId, previous.attemptId);
        } catch (error) {
          if (!isRecoverableMissingLocalSession(environmentId, previous, error)) {
            return unavailable(attemptId, error);
          }
          await options.sessions.cancel(previous.attemptId, { closeManagedTab: true });
          continue;
        }
        if (previousAttempt.state === "RUNNING") {
          throw new Error("이전 셀피아 상품 손익 수집이 아직 진행 중입니다. 그 수집이 끝난 뒤 다시 시작해 주세요.");
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
        const current = await readStatus(environmentId, attemptId).catch(() => null);
        if (current && current.state !== "RUNNING") return finish(environmentId, current);
        return cancelled(attemptId);
      }

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
        work.control = attempt;
        return requestTerminal(environmentId, work, {
          kind: "failure",
          body: {
            attemptToken: attempt.attemptToken,
            errorCode: boundedText(
              collected?.errorCode,
              "sellpia_profitability_collection_failed",
              100,
            ),
            errorMessage: boundedText(
              collected?.error,
              "Sellpia profitability collection failed.",
              300,
            ),
          },
        });
      }

      let body;
      try {
        body = normalizePayload(collected, attempt.plan, attempt.attemptToken);
      } catch (error) {
        work.control = attempt;
        return requestTerminal(environmentId, work, {
          kind: "failure",
          body: {
            attemptToken: attempt.attemptToken,
            errorCode: "SELLPIA_PROFITABILITY_PAYLOAD_INVALID",
            errorMessage: boundedText(
              error?.message,
              "Sellpia profitability payload could not be uploaded.",
              300,
            ),
          },
        });
      }

      work.control = attempt;
      try {
        await options.sessions.progress(attemptId, {
          current: 1,
          total: 2,
          completed: 1,
          failed: 0,
          label: "Sellpia profitability capture collected · publishing",
        });
      } catch {
        // Progress is best-effort UI state; still submit the captured body.
      }
      // Request completion only after progress, so a stop that lands during the
      // update still reaches the owner.
      return requestTerminal(environmentId, work, { kind: "complete", body });
    }

    function run({ environmentId, attemptId }) {
      const current = active.get(environmentId);
      if (current) {
        if (current.attemptId !== attemptId) {
          return Promise.reject(new Error("이전 셀피아 상품 손익 수집이 아직 진행 중입니다. 그 수집이 끝난 뒤 다시 시작해 주세요."));
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
        throw new Error("이전 셀피아 상품 손익 수집이 아직 진행 중입니다. 그 수집이 끝난 뒤 다시 시작해 주세요.");
      }
      const work = current || { attemptId, terminal: null, control: null };
      active.set(environmentId, work);
      try {
        const attempt = await readControl(environmentId, attemptId);
        if (attempt.state !== "RUNNING") return finish(environmentId, attempt);
        work.control = attempt;
        return requestTerminal(environmentId, work, {
          kind: "failure",
          body: {
            attemptToken: attempt.attemptToken,
            errorCode: "COLLECTION_CANCELLED",
            errorMessage: "Sellpia profitability collection was cancelled.",
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
        let attempt;
        try {
          attempt = await readStatus(environmentId, session.attemptId);
        } catch (error) {
          if (!isRecoverableMissingLocalSession(environmentId, session, error)) {
            throw error;
          }
          await options.sessions.cancel(session.attemptId, { closeManagedTab: true });
          continue;
        }
        if (attempt.state !== "RUNNING") await finish(environmentId, attempt);
      }
    }

    return Object.freeze({ run, recover, cancel });
  }

  root.KidItemSellpiaProductProfitabilitySourceOwner = Object.freeze({ create, parseAction });
})(globalThis);
