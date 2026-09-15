(function installSellpiaManualMatchSourceOwner(root) {
  "use strict";

  const SOURCE_PATH = "/api/channels/product-mappings/sellpia-manual-match/attempts";
  const PRODUCER = "orders.sellpia_manual_match";
  const SOURCE_ORIGIN = "https://kiditem.sellpia.com";
  const SOURCE_PAGE_PATH = "/product_manual_match.html";
  const SOURCE_TYPE = "sellpia_product_manual_match";
  const PARSER_VERSION = "sellpia-manual-match-v1";
  const MAX_TARGETS = 20_000;
  const MAX_ROWS = 100_000;
  const POSTGRES_INTEGER_MAX = 2_147_483_647;
  const CODE_PATTERN = /^\d+(?:-\d+)*$/;
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function parseAction(message, action = "collectSellpiaManualMatch") {
    if (
      !message
      || message.action !== action
      || Object.keys(message).length !== 2
      || !UUID.test(message.attemptId || "")
    ) {
      throw new Error("Invalid Sellpia manual-match source request");
    }
    return { attemptId: message.attemptId };
  }

  function boundedText(value, fallback, maximum) {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim();
    return normalized && normalized.length <= maximum ? normalized : fallback;
  }

  function parsePlan(plan) {
    const targetCodes = plan?.targetCodes;
    if (
      plan?.sourceType !== SOURCE_TYPE
      || plan?.parserVersion !== PARSER_VERSION
      || plan?.sourceOrigin !== SOURCE_ORIGIN
      || plan?.sourcePath !== SOURCE_PAGE_PATH
      || !Number.isInteger(plan?.targetCount)
      || plan.targetCount < 0
      || plan.targetCount > MAX_TARGETS
      || !Array.isArray(targetCodes)
      || targetCodes.length !== plan.targetCount
      || targetCodes.length > MAX_TARGETS
      || targetCodes.some((code) => typeof code !== "string" || !CODE_PATTERN.test(code))
      || targetCodes.some((code, index) => index > 0 && code <= targetCodes[index - 1])
    ) {
      throw new Error("SELLPIA_MANUAL_MATCH_PLAN_INVALID");
    }
    return plan;
  }

  function parseAttempt(value, attemptId) {
    if (
      value?.attemptId !== attemptId
      || !UUID.test(attemptId)
      || !UUID.test(value?.attemptToken || "")
      || !["RUNNING", "COMPLETE", "FAILED"].includes(value?.state)
      || !Number.isFinite(Date.parse(value?.expiresAt || ""))
      || (value?.errorCode !== null && value?.errorCode !== undefined
        && typeof value.errorCode !== "string")
      || (value?.errorMessage !== null && value?.errorMessage !== undefined
        && typeof value.errorMessage !== "string")
    ) {
      throw new Error("SELLPIA_MANUAL_MATCH_ATTEMPT_INVALID");
    }
    parsePlan(value.plan);
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
        error: String(
          error?.message || "Sellpia manual-match source owner is unavailable.",
        ).slice(0, 300),
      },
    );
  }

  async function isLocallyActive(sessions, attemptId, environmentId, allowUnstarted = false) {
    // Do not treat the common adapter's false-for-missing result as a stop
    // fence. Fresh-attempt admission belongs to start/onStarted.
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
      error: "Sellpia manual-match collection was cancelled.",
    };
  }

  function config(options, environmentId) {
    return {
      apiBase: "",
      headers: { "Content-Type": "application/json" },
      request: (path, init) => options.request(environmentId, path, init),
    };
  }

  function collectionFor(options, environmentId, attemptId) {
    return {
      attemptId,
      environmentId,
      assertActive: () => isLocallyActive(options.sessions, attemptId, environmentId),
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

  function snapshotMatchesPlan(snapshot, plan) {
    if (
      !snapshot
      || typeof snapshot !== "object"
      || Array.isArray(snapshot)
      || snapshot.source !== SOURCE_TYPE
      || snapshot.version !== 1
      || snapshot.targetCount !== plan.targetCount
      || !Array.isArray(snapshot.targetCodes)
      || snapshot.targetCodes.length !== plan.targetCodes.length
      || snapshot.targetCodes.some((code, index) => code !== plan.targetCodes[index])
      || !Number.isInteger(snapshot.rowCount)
      || snapshot.rowCount < 0
      || snapshot.rowCount > MAX_ROWS
      || !Array.isArray(snapshot.rows)
      || snapshot.rows.length !== snapshot.rowCount
    ) return false;

    const targets = new Set(plan.targetCodes);
    return snapshot.rows.every((row) =>
      row
      && typeof row === "object"
      && !Array.isArray(row)
      && typeof row.productCode === "string"
      && targets.has(row.productCode)
      && typeof row.aliasTitle === "string"
      && row.aliasTitle.trim().length > 0
      && row.aliasTitle.length <= 500
      && Number.isInteger(row.itemCount)
      && row.itemCount >= 1
      && row.itemCount <= POSTGRES_INTEGER_MAX
      && (row.matchedType === "M" || row.matchedType === "P" || row.matchedType === "E")
      && Number.isInteger(row.evidenceCount)
      && row.evidenceCount >= 1
      && row.evidenceCount <= MAX_ROWS,
    );
  }

  function create(options) {
    const active = new Map();
    const wire = root.KidItemSourcingAttemptWire.create({
      chrome: options.chrome,
      sourcePath: SOURCE_PATH,
      requestFailureMessage: "Sellpia manual-match owner request failed",
    });

    async function read(environmentId, attemptId) {
      const value = await wire.requestJsonWithRetry(
        config(options, environmentId),
        `${SOURCE_PATH}/${encodeURIComponent(attemptId)}`,
        { method: "GET" },
      );
      return parseAttempt(value, attemptId);
    }

    async function finish(environmentId, attempt) {
      const session = await options.sessions.getOwned(attempt.attemptId, environmentId);
      if (
        attempt.state === "FAILED"
        && attempt.errorCode !== "COLLECTION_CANCELLED"
        && attempt.errorCode !== "USER_CANCELLED"
        && session?.attention
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
            cancelMessage: "Sellpia manual-match collection was cancelled.",
          };
      try {
        if (
          !(await isLocallyActive(options.sessions, work.attemptId, environmentId)) &&
          !cancellationOnly
        ) {
          work.terminal = null;
          return cancelled(work.attemptId);
        }
        work.control = await read(environmentId, work.attemptId);
        if (work.control.state !== "RUNNING") {
          work.terminal = null;
          return finish(environmentId, work.control);
        }
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
      // A stop that interrupted this request is the same lost local fence the
      // pre-checks handle: the attempt is still the operator's to end, so the
      // stored request must not survive for that stop to join.
      if (directError?.code === "COLLECTION_CANCELLED" && observed.state === "RUNNING") {
        work.terminal = null;
        return cancelled(work.attemptId);
      }
      if (observed.state !== "RUNNING") {
        work.terminal = null;
        return finish(environmentId, observed);
      }
      return unavailable(
        work.attemptId,
        directError || new Error("Sellpia manual-match terminal state is still running."),
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
      const attempt = await read(environmentId, attemptId);
      work.control = attempt;
      if (work.terminal) return requestTerminal(environmentId, work, work.terminal);
      if (attempt.state !== "RUNNING") return finish(environmentId, attempt);

      for (const previous of await options.sessions.list(environmentId)) {
        if (previous.producer !== PRODUCER || previous.attemptId === attemptId) continue;
        const previousAttempt = await read(environmentId, previous.attemptId);
        if (previousAttempt.state === "RUNNING") {
          throw new Error("Another Sellpia manual-match collection is running");
        }
        await finish(environmentId, previousAttempt);
      }

      if (!(await isLocallyActive(options.sessions, attemptId, environmentId, true))) {
        return cancelled(attemptId);
      }
      const started = await options.sessions.start({ environmentId, attemptId, producer: PRODUCER });
      if (started === null || started === false) return cancelled(attemptId);
      let collected;
      try {
        collected = await options.collect({
          ...collectionFor(options, environmentId, attemptId),
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

      // Keep the collected body in the in-memory work item until the terminal
      // request has reconciled the server state. A transient control-read
      // failure must not discard it or cause a second provider collection.
      work.control = { ...attempt, attemptToken: attempt.attemptToken };

      if (collected?.success !== true || !snapshotMatchesPlan(collected.snapshot, attempt.plan)) {
        if (
          collected?.pendingLogin === true
          || collected?.errorCode === "sellpia_manual_match_login_required"
          || collected?.attentionRequired === true
        ) {
          await options.sessions.requireAttention(attemptId, {
            reason: collected?.reason || "marketplace_login",
            message: collected?.error || "Sellpia login is required.",
          });
        }
        return requestTerminal(environmentId, work, {
          kind: "failure",
          body: {
            errorCode: boundedText(
              collected?.errorCode,
              collected?.success === true
                ? "SELLPIA_MANUAL_MATCH_PAYLOAD_INVALID"
                : "sellpia_manual_match_collection_failed",
              100,
            ),
            errorMessage: boundedText(
              collected?.error,
              collected?.success === true
                ? "Sellpia manual-match snapshot could not be uploaded."
                : "Sellpia manual-match collection failed.",
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
        label: "Sellpia 수동상품매칭 근거를 수집했습니다 · 저장 중",
      });
      return requestTerminal(environmentId, work, {
        kind: "complete",
        body: collected.snapshot,
      });
    }

    function run({ environmentId, attemptId }) {
      const current = active.get(environmentId);
      if (current) {
        if (current.attemptId !== attemptId) {
          return Promise.reject(new Error("Another Sellpia manual-match collection is running"));
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
        throw new Error("Another Sellpia manual-match collection is running");
      }
      const work = current || { attemptId, terminal: null, control: null };
      active.set(environmentId, work);
      try {
        // Join a terminal request that is already in flight. A completion that
        // wins the race ends the attempt and leaves this stop nothing to send.
        if (work.terminalPromise) await work.terminalPromise.catch(() => null);
        const attempt = await read(environmentId, attemptId);
        if (attempt.state !== "RUNNING") {
          // A request an unresolved terminal left behind can never reach a
          // terminal owner. Dropping it releases the local lock with this stop
          // instead of at the next service-worker boot.
          work.terminal = null;
          return finish(environmentId, attempt);
        }
        // The joined request left the attempt RUNNING, so this stop owns the
        // single /fail; replace the stored request rather than join it again.
        work.terminal = null;
        return requestTerminal(environmentId, work, {
          kind: "failure",
          body: {
            errorCode: "COLLECTION_CANCELLED",
            errorMessage: "Sellpia manual-match collection was cancelled.",
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

  root.KidItemSellpiaManualMatchSourceOwner = Object.freeze({ create, parseAction });
})(globalThis);
