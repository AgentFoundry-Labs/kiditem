(function installOperationRuntimeClient(root) {
  "use strict";

  const ALARM_BASE = "kiditem-operation-runtime-claim";
  const CLAIM_PATH = "/api/operation-runtime/browser/claim";
  const HEARTBEAT_PATH = (runId) => `/api/operation-runtime/browser/runs/${encodeURIComponent(runId)}/heartbeat`;
  const REPORT_PATH = (runId) => `/api/operation-runtime/browser/runs/${encodeURIComponent(runId)}/report`;

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
    let installed = false;

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

    async function executeClaim(environmentId, claim) {
      const handler = domains.runOperation(claim.operationKey);
      if (typeof handler !== "function") {
        await report(environmentId, claim, {
          status: "attention_required",
          attentionReason: "browser_operation_handler_missing",
        });
        return;
      }

      let latestProgress = null;
      let heartbeatStopped = false;
      const sendHeartbeat = async () => {
        if (heartbeatStopped) return;
        try {
          await requestJson(environmentId, HEARTBEAT_PATH(claim.runId), {
            attemptToken: claim.attemptToken,
            progress: latestProgress,
          });
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
        const outcome = normalizeOutcome(await handler({
          environmentId,
          runId: claim.runId,
          attemptToken: claim.attemptToken,
          input: claim.input || {},
          heartbeat,
        }));
        await report(environmentId, claim, { ...outcome, progress: latestProgress });
      } catch {
        await report(environmentId, claim, {
          status: "failed",
          errorCode: "browser_operation_failed",
          errorMessage: "The browser operation could not be completed.",
          progress: latestProgress,
        }).catch(() => undefined);
      } finally {
        heartbeatStopped = true;
        clearInterval(intervalId);
      }
    }

    async function tick(environmentId) {
      if (activeTicks.has(environmentId)) return false;
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

    function installAlarms() {
      for (const environmentId of environmentContext.environmentIds) {
        chromeApi.alarms.create(environmentContext.alarmName(ALARM_BASE, environmentId), {
          delayInMinutes: 1,
          periodInMinutes: 1,
        });
      }
    }

    function install() {
      if (installed) return;
      installed = true;
      installAlarms();
      chromeApi.alarms.onAlarm.addListener((alarm) => {
        const environmentId = environmentContext.parseAlarmName(ALARM_BASE, alarm?.name);
        if (environmentId) void tick(environmentId);
      });
      chromeApi.runtime.onInstalled?.addListener(installAlarms);
      chromeApi.runtime.onStartup?.addListener(installAlarms);
    }

    return Object.freeze({ install, tick });
  }

  root.KidItemOperationRuntimeClient = Object.freeze({ create });
})(globalThis);
