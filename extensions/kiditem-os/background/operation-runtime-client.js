(function installOperationRuntimeClient(root) {
  "use strict";

  const ALARM_BASE = "kiditem-operation-runtime-claim";
  const CLAIM_PATH = "/api/operation-runtime/browser/claim";
  const HEARTBEAT_PATH = (runId) => `/api/operation-runtime/browser/runs/${encodeURIComponent(runId)}/heartbeat`;
  const REPORT_PATH = (runId) => `/api/operation-runtime/browser/runs/${encodeURIComponent(runId)}/report`;
  const ACTIVE_CLAIMS_STORAGE_KEY = "kiditem_operation_runtime_active_v1";
  const RESUME_LEASE_MS = 90_000;

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
      typeof value.attemptToken === "string" && value.attemptToken.length > 0;
  }

  function isFutureTimestamp(value) {
    const timestamp = Date.parse(String(value || ""));
    return Number.isFinite(timestamp) && timestamp > Date.now();
  }

  function create(options) {
    if (!options?.chrome?.alarms || !options?.environmentContext || !options?.domains) {
      throw new Error("Operation runtime dependencies are required");
    }
    const chromeApi = options.chrome;
    const environmentContext = options.environmentContext;
    const domains = options.domains;
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

    async function storeActiveClaim(environmentId, claim, progress = null) {
      const claims = await readActiveClaims();
      claims[environmentId] = {
        claim,
        progress: typeof progress === "number" && progress >= 0 && progress <= 1
          ? progress
          : null,
        resumeLeaseExpiresAt: new Date(Date.now() + RESUME_LEASE_MS).toISOString(),
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

    async function activeClaimFor(environmentId) {
      const claims = await readActiveClaims();
      const active = claims[environmentId];
      if (!isRecord(active) || !validClaim(active.claim)) return null;
      const lease = active.resumeLeaseExpiresAt || active.claim.leaseExpiresAt;
      if (isFutureTimestamp(lease)) return active;
      await clearActiveClaim(environmentId, active.claim);
      return null;
    }

    async function requestJson(environmentId, path, body) {
      const response = await environmentContext.authedFetch(environmentId, path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response?.ok) {
        throw new Error(`operation_runtime_http_${response?.status || "network"}`);
      }
      if (response.status === 204) return null;
      const text = await response.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        throw new Error("operation_runtime_invalid_response");
      }
    }

    async function report(environmentId, claim, payload) {
      await requestJson(environmentId, REPORT_PATH(claim.runId), {
        attemptToken: claim.attemptToken,
        ...payload,
      });
    }

    function heartbeatIntervalMs(claim) {
      const expiresAt = Date.parse(claim.leaseExpiresAt || "");
      const remaining = Number.isFinite(expiresAt) ? expiresAt - Date.now() : 60_000;
      return Math.max(1_000, Math.floor(Math.max(3_000, remaining) / 3));
    }

    async function executeClaim(environmentId, claim, initialProgress = null) {
      if (activeExecutions.has(environmentId)) return false;
      const handler = domains.runOperation(claim.operationKey);
      if (typeof handler !== "function") {
        await report(environmentId, claim, {
          status: "attention_required",
          attentionReason: "browser_operation_handler_missing",
        });
        await clearActiveClaim(environmentId, claim);
        return true;
      }

      activeExecutions.add(environmentId);
      let latestProgress =
        typeof initialProgress === "number" && initialProgress >= 0 && initialProgress <= 1
          ? initialProgress
          : null;
      let heartbeatStopped = false;
      const sendHeartbeat = async () => {
        if (heartbeatStopped) return;
        try {
          await requestJson(environmentId, HEARTBEAT_PATH(claim.runId), {
            attemptToken: claim.attemptToken,
            progress: latestProgress,
          });
          await storeActiveClaim(environmentId, claim, latestProgress);
        } catch {
          // A fenced or unavailable lease is resolved by the terminal report; do
          // not retry the domain handler or leak its raw browser error.
        }
      };
      const intervalId = setInterval(() => { void sendHeartbeat(); }, heartbeatIntervalMs(claim));
      const heartbeat = async (progress) => {
        if (typeof progress === "number" && progress >= 0 && progress <= 1) {
          latestProgress = progress;
        }
        await sendHeartbeat();
      };

      try {
        await storeActiveClaim(environmentId, claim, latestProgress);
        let outcome;
        try {
          outcome = normalizeOutcome(await handler({
            environmentId,
            runId: claim.runId,
            attemptToken: claim.attemptToken,
            input: claim.input || {},
            heartbeat,
          }));
        } catch {
          outcome = {
            status: "failed",
            errorCode: "browser_operation_failed",
            errorMessage: "The browser operation could not be completed.",
          };
        }
        try {
          await report(environmentId, claim, { ...outcome, progress: latestProgress });
          await clearActiveClaim(environmentId, claim);
        } catch {
          // Keep the claim checkpoint. The next service-worker wake-up resumes
          // the exact fenced attempt instead of creating another provider job.
        }
      } finally {
        heartbeatStopped = true;
        clearInterval(intervalId);
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
        if (
          typeof claim.runId !== "string"
          || typeof claim.operationKey !== "string"
          || typeof claim.attemptToken !== "string"
        ) {
          return false;
        }
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
      const active = await activeClaimFor(environmentId);
      if (active) {
        try {
          await requestJson(environmentId, HEARTBEAT_PATH(active.claim.runId), {
            attemptToken: active.claim.attemptToken,
            progress: active.progress,
          });
          await storeActiveClaim(environmentId, active.claim, active.progress);
          return executeClaim(environmentId, active.claim, active.progress);
        } catch {
          // A terminal or fenced run must not replay marketplace work from a
          // stale local checkpoint. Drop it and ask the server for new work.
          await clearActiveClaim(environmentId, active.claim);
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

    return Object.freeze({ install, tick });
  }

  root.KidItemOperationRuntimeClient = Object.freeze({ create });
})(globalThis);
