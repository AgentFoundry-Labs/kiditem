(function installOperationRuntimeClient(root) {
  "use strict";

  const ALARM_BASE = "kiditem-operation-runtime-claim";
  const CLAIM_PATH = "/api/operation-runtime/browser/claim";
  const HEARTBEAT_PATH = (runId) => `/api/operation-runtime/browser/runs/${encodeURIComponent(runId)}/heartbeat`;
  const REPORT_PATH = (runId) => `/api/operation-runtime/browser/runs/${encodeURIComponent(runId)}/report`;
  const ACTIVE_CLAIMS_STORAGE_KEY = "kiditem_operation_runtime_active_v1";
  const TERMINATED_ATTEMPTS_STORAGE_KEY = "kiditem_operation_runtime_terminated_v1";
  const MAX_RESUME_LEASE_MS = 90_000;
  const TRANSPORT_ERROR_CODES = new Set([
    "network_error",
    "request_timeout",
    "transport_unavailable",
    "ERR_NETWORK",
    "ECONNRESET",
    "ETIMEDOUT",
  ]);

  function boundedText(value, fallback, maximum) {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim();
    return normalized && normalized.length <= maximum ? normalized : fallback;
  }

  function normalizeOutcome(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { status: "succeeded", result: {} };
    }
    const status = value.status;
    if (status === "succeeded") {
      return {
        status,
        result: value.result && typeof value.result === "object" && !Array.isArray(value.result)
          ? value.result
          : {},
      };
    }
    if (status === "attention_required") {
      return {
        status,
        attentionReason: boundedText(value.attentionReason, "operator_action_required", 120),
      };
    }
    if (status === "failed") {
      return {
        status,
        errorCode: boundedText(value.errorCode, "browser_operation_failed", 120),
        errorMessage: boundedText(value.errorMessage, "Browser operation failed.", 2_000),
      };
    }
    throw new Error("invalid_operation_outcome");
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function validClaim(value) {
    return isRecord(value) &&
      typeof value.runId === "string" && value.runId.length > 0 &&
      typeof value.operationKey === "string" && value.operationKey.length > 0 &&
      typeof value.attemptToken === "string" && value.attemptToken.length > 0 &&
      Number.isFinite(Date.parse(String(value.leaseExpiresAt || ""))) &&
      Number.isFinite(Date.parse(String(value.deadlineAt || "")));
  }

  function isSameAttempt(active, claim) {
    return isRecord(active) && validClaim(active.claim) &&
      active.claim.runId === claim.runId &&
      active.claim.attemptToken === claim.attemptToken;
  }

  function isFutureTimestamp(value) {
    const timestamp = Date.parse(String(value || ""));
    return Number.isFinite(timestamp) && timestamp > Date.now();
  }

  function operationRuntimeError(message, status = null, failureKind = null) {
    const error = new Error(message);
    if (status !== null) error.status = status;
    error.code = message;
    if (failureKind) error.operationRuntimeFailureKind = failureKind;
    return error;
  }

  function classifyRuntimeRequestError(error) {
    const status = Number.isInteger(error?.status) ? error.status : null;
    const code = typeof error?.code === "string" && error.code.length <= 120
      ? error.code
      : null;
    if (
      status === 409 ||
      code === "operation_runtime_fence_lost" ||
      error?.operationRuntimeFailureKind === "fence"
    ) {
      return { kind: "fence", code: "operation_runtime_fence_lost", status: 409 };
    }
    if (status !== null || error?.operationRuntimeFailureKind === "deterministic") {
      return {
        kind: "deterministic",
        code: code || `operation_runtime_http_${status}`,
        status,
      };
    }
    if (
      error?.operationRuntimeFailureKind === "transport" ||
      TRANSPORT_ERROR_CODES.has(code) ||
      error?.name === "TypeError" ||
      error?.name === "AbortError" ||
      error?.name === "TimeoutError"
    ) {
      return { kind: "transport", code: code || "transport_unavailable", status: null };
    }
    return {
      kind: "deterministic",
      code: code || "operation_runtime_request_rejected",
      status: null,
    };
  }

  function isFenceError(error) {
    return classifyRuntimeRequestError(error).kind === "fence";
  }

  function boundedLeaseDuration(claim) {
    const remaining = Date.parse(claim.leaseExpiresAt) - Date.now();
    return Math.max(1_000, Math.min(MAX_RESUME_LEASE_MS, remaining));
  }

  function checkpointLeaseExpiry(claim, leaseDurationMs, renewed) {
    const serverLease = Date.parse(claim.leaseExpiresAt);
    const deadline = Date.parse(claim.deadlineAt);
    const estimatedLease = renewed ? Date.now() + leaseDurationMs : serverLease;
    return new Date(Math.min(estimatedLease, deadline));
  }

  function create(options) {
    if (!options?.chrome?.alarms || !options?.environmentContext || !options?.domains) {
      throw new Error("Operation runtime dependencies are required");
    }
    const chromeApi = options.chrome;
    const environmentContext = options.environmentContext;
    const domains = options.domains;
    const sessions = options.sessions || null;
    const runtimeId = boundedText(
      options.runtimeId || chromeApi.runtime?.id,
      "kiditem-os-browser-runtime-v1",
      120,
    );
    const activeTicks = new Set();
    const activeExecutions = new Set();
    let installed = false;

    async function readActiveClaims() {
      try {
        const stored = await chromeApi.storage?.local?.get(ACTIVE_CLAIMS_STORAGE_KEY);
        const claims = stored?.[ACTIVE_CLAIMS_STORAGE_KEY];
        return isRecord(claims) ? claims : {};
      } catch {
        return {};
      }
    }

    async function writeActiveClaims(claims) {
      try {
        await chromeApi.storage?.local?.set({ [ACTIVE_CLAIMS_STORAGE_KEY]: claims });
      } catch {
        // Persistence is a restart-recovery guard. A temporary storage error
        // must not prevent a browser operation that is already claimed.
      }
    }

    async function readTerminatedAttempts() {
      try {
        const stored = await chromeApi.storage?.local?.get(
          TERMINATED_ATTEMPTS_STORAGE_KEY,
        );
        const attempts = stored?.[TERMINATED_ATTEMPTS_STORAGE_KEY];
        return isRecord(attempts) ? attempts : {};
      } catch {
        return {};
      }
    }

    async function writeTerminatedAttempts(attempts) {
      try {
        await chromeApi.storage?.local?.set({
          [TERMINATED_ATTEMPTS_STORAGE_KEY]: attempts,
        });
      } catch {
        // The backend attempt token is still the durable fence. This marker
        // only prevents deterministic same-attempt replay across MV3 wakes.
      }
    }

    async function rememberTerminatedAttempt(environmentId, claim, failure) {
      const attempts = await readTerminatedAttempts();
      const activeClaims = await readActiveClaims();
      const active = activeClaims[environmentId];
      const matchesActiveAttempt = isRecord(active) && validClaim(active.claim) &&
        active.claim.runId === claim.runId &&
        active.claim.attemptToken === claim.attemptToken;
      const renewedLease = matchesActiveAttempt &&
        Number.isFinite(Date.parse(String(active.lastHeartbeatSucceededAt || ""))) &&
        Number.isFinite(Date.parse(String(active.resumeLeaseExpiresAt || "")))
        ? Date.parse(active.resumeLeaseExpiresAt)
        : Date.parse(claim.leaseExpiresAt);
      attempts[environmentId] = {
        runId: claim.runId,
        attemptToken: claim.attemptToken,
        expiresAt: new Date(Math.min(
          renewedLease,
          Date.parse(claim.deadlineAt),
        )).toISOString(),
        failureCode: boundedText(
          failure?.code,
          "operation_runtime_request_rejected",
          120,
        ),
      };
      await writeTerminatedAttempts(attempts);
    }

    async function isTerminatedAttempt(environmentId, claim) {
      const attempts = await readTerminatedAttempts();
      const terminated = attempts[environmentId];
      if (!isRecord(terminated)) return false;
      if (!isFutureTimestamp(terminated.expiresAt)) {
        delete attempts[environmentId];
        await writeTerminatedAttempts(attempts);
        return false;
      }
      return terminated.runId === claim.runId &&
        terminated.attemptToken === claim.attemptToken;
    }

    async function cancelOwnedSession(environmentId, claim) {
      if (!sessions) return;
      try {
        const owned = typeof sessions.getOwned === "function"
          ? await sessions.getOwned(claim.runId, environmentId)
          : null;
        if (!owned || typeof sessions.cancel !== "function") return;
        await sessions.cancel(claim.runId, { closeManagedTab: true });
      } catch {
        // Local cancellation is best effort; the server fence remains final.
      }
    }

    async function storeActiveClaim(
      environmentId,
      claim,
      progressState = {},
      renewed = false,
    ) {
      const claims = await readActiveClaims();
      const previous = claims[environmentId];
      const leaseDurationMs = Number.isFinite(previous?.leaseDurationMs)
        ? previous.leaseDurationMs
        : boundedLeaseDuration(claim);
      claims[environmentId] = {
        claim,
        progress: typeof progressState.progress === "number" &&
          progressState.progress >= 0 && progressState.progress <= 1
          ? progressState.progress
          : null,
        stage: boundedText(progressState.stage, null, 120),
        progressCurrent: Number.isInteger(progressState.progressCurrent) &&
          progressState.progressCurrent >= 0
          ? progressState.progressCurrent
          : null,
        progressTotal: Number.isInteger(progressState.progressTotal) &&
          progressState.progressTotal >= 0
          ? progressState.progressTotal
          : null,
        leaseDurationMs,
        lastHeartbeatSucceededAt: renewed ? new Date().toISOString() : null,
        resumeLeaseExpiresAt: checkpointLeaseExpiry(
          claim,
          leaseDurationMs,
          renewed,
        ).toISOString(),
      };
      await writeActiveClaims(claims);
    }

    async function clearActiveClaim(environmentId, claim) {
      const claims = await readActiveClaims();
      const current = claims[environmentId];
      if (!current || !validClaim(current.claim)) return;
      if (
        current.claim.runId !== claim.runId ||
        current.claim.attemptToken !== claim.attemptToken
      ) {
        return;
      }
      delete claims[environmentId];
      await writeActiveClaims(claims);
    }

    async function activeClaimFor(environmentId, terminateExpired = false) {
      const claims = await readActiveClaims();
      const active = claims[environmentId];
      if (!isRecord(active) || !validClaim(active.claim)) return null;
      const hasRenewalProof = Number.isFinite(active.leaseDurationMs) &&
        Number.isFinite(Date.parse(String(active.lastHeartbeatSucceededAt || "")));
      const localLease = active.resumeLeaseExpiresAt || active.claim.leaseExpiresAt;
      const plausibleLease = hasRenewalProof
        ? localLease
        : new Date(Math.min(
            Date.parse(localLease),
            Date.parse(active.claim.leaseExpiresAt),
          )).toISOString();
      if (
        isFutureTimestamp(plausibleLease) &&
        isFutureTimestamp(active.claim.deadlineAt)
      ) return active;
      await clearActiveClaim(environmentId, active.claim);
      if (terminateExpired) {
        await cancelOwnedSession(environmentId, active.claim);
      }
      return null;
    }

    async function requestJson(environmentId, path, body, signal) {
      const response = await environmentContext.authedFetch(environmentId, path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
      if (!response?.ok) {
        const status = Number.isInteger(response?.status) ? response.status : null;
        throw operationRuntimeError(
          status === 409
            ? "operation_runtime_fence_lost"
            : `operation_runtime_http_${status || "network"}`,
          status,
          status === 409 ? "fence" : "deterministic",
        );
      }
      if (response.status === 204) return null;
      const text = await response.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        throw operationRuntimeError(
          "operation_runtime_invalid_response",
          null,
          "deterministic",
        );
      }
    }

    async function report(environmentId, claim, payload, signal) {
      await requestJson(environmentId, REPORT_PATH(claim.runId), {
        attemptToken: claim.attemptToken,
        ...payload,
      }, signal);
    }

    function heartbeatIntervalMs(claim) {
      const expiresAt = Date.parse(claim.leaseExpiresAt || "");
      const remaining = Number.isFinite(expiresAt) ? expiresAt - Date.now() : 60_000;
      return Math.max(1_000, Math.floor(Math.max(3_000, remaining) / 3));
    }

    async function executeClaim(environmentId, claim, initialState = {}) {
      if (activeExecutions.has(environmentId)) return false;
      if (await isTerminatedAttempt(environmentId, claim)) return false;
      const handler = domains.runOperation(claim.operationKey);
      if (typeof handler !== "function") {
        try {
          await report(environmentId, claim, {
            status: "attention_required",
            attentionReason: "browser_operation_handler_missing",
          });
          await cancelOwnedSession(environmentId, claim);
          await clearActiveClaim(environmentId, claim);
        } catch (error) {
          const failure = classifyRuntimeRequestError(error);
          if (failure.kind === "transport") {
            const stillPlausible = await activeClaimFor(environmentId);
            if (!isSameAttempt(stillPlausible, claim)) {
              await clearActiveClaim(environmentId, claim);
              await cancelOwnedSession(environmentId, claim);
            }
          } else {
            await rememberTerminatedAttempt(environmentId, claim, failure);
            await clearActiveClaim(environmentId, claim);
            await cancelOwnedSession(environmentId, claim);
            console.warn(
              "[operation-runtime] missing-handler report rejected",
              failure.code,
            );
          }
        }
        return true;
      }

      activeExecutions.add(environmentId);
      const progressState = {
        progress: typeof initialState.progress === "number" &&
          initialState.progress >= 0 && initialState.progress <= 1
          ? initialState.progress
          : null,
        stage: boundedText(initialState.stage, null, 120),
        progressCurrent: Number.isInteger(initialState.progressCurrent) &&
          initialState.progressCurrent >= 0
          ? initialState.progressCurrent
          : null,
        progressTotal: Number.isInteger(initialState.progressTotal) &&
          initialState.progressTotal >= 0
          ? initialState.progressTotal
          : null,
      };
      const attemptController = new AbortController();
      const heartbeatRequestController = new AbortController();
      const pendingHeartbeats = new Set();
      let heartbeatStopped = false;
      let deadlineTimerId = null;
      let managedSessionCleanup = null;
      const cancelManagedSession = () => {
        if (managedSessionCleanup || !sessions) return managedSessionCleanup;
        managedSessionCleanup = cancelOwnedSession(environmentId, claim);
        return managedSessionCleanup;
      };
      const abortAttempt = (reason) => {
        if (!attemptController.signal.aborted) attemptController.abort(reason);
        if (!heartbeatRequestController.signal.aborted) {
          heartbeatRequestController.abort(reason);
        }
        void cancelManagedSession();
      };
      const deadlineRemaining = Date.parse(claim.deadlineAt) - Date.now();
      if (deadlineRemaining <= 0) {
        abortAttempt(operationRuntimeError("operation_deadline_exceeded"));
      } else {
        deadlineTimerId = setTimeout(() => {
          abortAttempt(operationRuntimeError("operation_deadline_exceeded"));
        }, deadlineRemaining);
      }

      const heartbeatBody = () => {
        const body = {
          attemptToken: claim.attemptToken,
          progress: progressState.progress,
        };
        if (progressState.stage !== null) body.stage = progressState.stage;
        if (progressState.progressCurrent !== null) {
          body.progressCurrent = progressState.progressCurrent;
        }
        if (progressState.progressTotal !== null) {
          body.progressTotal = progressState.progressTotal;
        }
        return body;
      };
      const sendHeartbeat = () => {
        if (heartbeatStopped || attemptController.signal.aborted) {
          return Promise.reject(
            attemptController.signal.reason ||
              operationRuntimeError("operation_runtime_heartbeat_stopped"),
          );
        }
        const pending = requestJson(
          environmentId,
          HEARTBEAT_PATH(claim.runId),
          heartbeatBody(),
          heartbeatRequestController.signal,
        ).then(async () => {
          if (!attemptController.signal.aborted) {
            await storeActiveClaim(environmentId, claim, progressState, true);
          }
        }).catch((error) => {
          if (isFenceError(error)) abortAttempt(error);
          throw error;
        });
        pendingHeartbeats.add(pending);
        void pending.finally(() => pendingHeartbeats.delete(pending)).catch(() => undefined);
        return pending;
      };
      const intervalId = setInterval(() => {
        void sendHeartbeat().catch(() => undefined);
      }, heartbeatIntervalMs(claim));
      const heartbeat = async (update) => {
        if (typeof update === "number" && update >= 0 && update <= 1) {
          progressState.progress = update;
        } else if (isRecord(update)) {
          if (typeof update.progress === "number" && update.progress >= 0 && update.progress <= 1) {
            progressState.progress = update.progress;
          }
          if (typeof update.stage === "string") {
            progressState.stage = boundedText(update.stage, progressState.stage, 120);
          }
          if (Number.isInteger(update.progressCurrent) && update.progressCurrent >= 0) {
            progressState.progressCurrent = update.progressCurrent;
          }
          if (Number.isInteger(update.progressTotal) && update.progressTotal >= 0) {
            progressState.progressTotal = update.progressTotal;
          }
        }
        await sendHeartbeat();
      };
      const stopHeartbeats = async () => {
        if (!heartbeatStopped) {
          heartbeatStopped = true;
          clearInterval(intervalId);
        }
        if (!heartbeatRequestController.signal.aborted) {
          heartbeatRequestController.abort(
            operationRuntimeError("operation_runtime_heartbeat_stopped"),
          );
        }
        await Promise.allSettled([...pendingHeartbeats]);
      };

      try {
        await storeActiveClaim(
          environmentId,
          claim,
          progressState,
          initialState.renewedCheckpoint === true,
        );
        let outcome;
        try {
          outcome = normalizeOutcome(await handler({
            environmentId,
            runId: claim.runId,
            attemptToken: claim.attemptToken,
            input: claim.input || {},
            signal: attemptController.signal,
            heartbeat,
          }));
        } catch (error) {
          if (isFenceError(error)) abortAttempt(error);
          outcome = {
            status: "failed",
            errorCode: "browser_operation_failed",
            errorMessage: "The browser operation could not be completed.",
          };
        }
        await stopHeartbeats();
        if (attemptController.signal.aborted) {
          await clearActiveClaim(environmentId, claim);
          return true;
        }
        try {
          await report(environmentId, claim, {
            ...outcome,
            progress: progressState.progress,
            ...(progressState.stage === null ? {} : { stage: progressState.stage }),
            ...(progressState.progressCurrent === null
              ? {}
              : { progressCurrent: progressState.progressCurrent }),
            ...(progressState.progressTotal === null
              ? {}
              : { progressTotal: progressState.progressTotal }),
          }, attemptController.signal);
          await clearActiveClaim(environmentId, claim);
        } catch (error) {
          const failure = classifyRuntimeRequestError(error);
          if (failure.kind === "transport") {
            const stillPlausible = await activeClaimFor(environmentId);
            if (!stillPlausible) await cancelManagedSession();
          } else {
            abortAttempt(error);
            await rememberTerminatedAttempt(environmentId, claim, failure);
            await clearActiveClaim(environmentId, claim);
            console.warn(
              "[operation-runtime] terminal report rejected",
              failure.code,
            );
          }
          // Only classified transport unavailability retains the checkpoint.
          // A later wake must heartbeat the same fenced attempt before replay.
        }
      } finally {
        await stopHeartbeats();
        if (deadlineTimerId !== null) clearTimeout(deadlineTimerId);
        if (managedSessionCleanup) await managedSessionCleanup;
        activeExecutions.delete(environmentId);
      }
      return true;
    }

    async function tick(environmentId) {
      if (activeTicks.has(environmentId) || activeExecutions.has(environmentId)) return false;
      activeTicks.add(environmentId);
      try {
        const payload = await requestJson(environmentId, CLAIM_PATH, {
          runtimeId,
          environmentId,
        });
        const claim = payload?.claim;
        if (!claim || typeof claim !== "object") return false;
        if (!validClaim(claim)) return false;
        if (
          !isFutureTimestamp(claim.leaseExpiresAt) ||
          !isFutureTimestamp(claim.deadlineAt)
        ) return false;
        await executeClaim(environmentId, claim);
        return true;
      } catch {
        // Network/auth recovery is owned by environment-context. An alarm will
        // try again; the backend lease and attempt token fence duplicate work.
        return false;
      } finally {
        activeTicks.delete(environmentId);
      }
    }

    async function resumeOrTick(environmentId) {
      if (activeTicks.has(environmentId) || activeExecutions.has(environmentId)) {
        return false;
      }
      const active = await activeClaimFor(environmentId, true);
      if (active) {
        const progressState = {
          progress: active.progress,
          stage: active.stage,
          progressCurrent: active.progressCurrent,
          progressTotal: active.progressTotal,
        };
        try {
          const body = {
            attemptToken: active.claim.attemptToken,
            progress: active.progress,
          };
          if (typeof active.stage === "string") body.stage = active.stage;
          if (Number.isInteger(active.progressCurrent)) {
            body.progressCurrent = active.progressCurrent;
          }
          if (Number.isInteger(active.progressTotal)) {
            body.progressTotal = active.progressTotal;
          }
          await requestJson(
            environmentId,
            HEARTBEAT_PATH(active.claim.runId),
            body,
          );
          await storeActiveClaim(
            environmentId,
            active.claim,
            progressState,
            true,
          );
          return executeClaim(environmentId, active.claim, {
            ...progressState,
            renewedCheckpoint: true,
          });
        } catch (error) {
          const failure = classifyRuntimeRequestError(error);
          if (failure.kind === "transport") {
            // The same attempt remains the only safe recovery owner while its
            // locally bounded lease/deadline are still plausible. Do not claim
            // another job merely because the network is temporarily offline.
            const stillPlausible = await activeClaimFor(environmentId);
            if (!stillPlausible) {
              await cancelOwnedSession(environmentId, active.claim);
            }
            return false;
          }
          // A deterministic or fenced response must not replay marketplace
          // work from a stale local checkpoint, even across an MV3 restart.
          await rememberTerminatedAttempt(environmentId, active.claim, failure);
          await clearActiveClaim(environmentId, active.claim);
          await cancelOwnedSession(environmentId, active.claim);
          console.warn(
            "[operation-runtime] checkpoint rejected",
            failure.code,
          );
          return false;
        }
      }
      return tick(environmentId);
    }

    function installAlarms() {
      for (const environmentId of environmentContext.environmentIds) {
        chromeApi.alarms.create(environmentContext.alarmName(ALARM_BASE, environmentId), {
          delayInMinutes: 0.5,
          periodInMinutes: 0.5,
        });
      }
    }

    function install() {
      if (installed) return;
      installed = true;
      installAlarms();
      for (const environmentId of environmentContext.environmentIds) {
        void resumeOrTick(environmentId);
      }
      chromeApi.alarms.onAlarm.addListener((alarm) => {
        const environmentId = environmentContext.parseAlarmName(ALARM_BASE, alarm?.name);
        if (environmentId) void resumeOrTick(environmentId);
      });
      chromeApi.runtime.onInstalled?.addListener(installAlarms);
      chromeApi.runtime.onStartup?.addListener(installAlarms);
    }

    return Object.freeze({ install, tick, wake: resumeOrTick });
  }

  root.KidItemOperationRuntimeClient = Object.freeze({ create });
})(globalThis);
