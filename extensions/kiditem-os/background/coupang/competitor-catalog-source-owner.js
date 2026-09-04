(function installCompetitorCatalogSourceOwner(root) {
  "use strict";

  const PRODUCER = "advertising.competitor_catalog";
  const MAX_TARGETS = 20;
  const TERMINAL_RETRIES = 3;

  function ownerError(code, message, status = null) {
    const error = new Error(message);
    error.code = code;
    if (status !== null) error.status = status;
    return error;
  }

  function text(value, code) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw ownerError(code, code);
    }
    return value.trim();
  }

  function responseBody(response) {
    return response?.json?.().catch(() => null) ?? Promise.resolve(null);
  }

  function normalizedInput(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw ownerError("INVALID_COMPETITOR_CATALOG_SCOPE", "Invalid competitor catalog scope.");
    }
    if (value.target === "all" && Object.keys(value).length === 1) {
      return { target: "all" };
    }
    if (
      value.target === "seller_id"
      && Object.keys(value).length === 2
      && typeof value.sellerId === "string"
      && /^[A-Za-z0-9_-]{1,80}$/.test(value.sellerId.trim())
    ) {
      return { target: "seller_id", sellerId: value.sellerId.trim() };
    }
    throw ownerError("INVALID_COMPETITOR_CATALOG_SCOPE", "Invalid competitor catalog scope.");
  }

  function sameInput(left, right) {
    return left.target === right.target
      && (left.target === "all" || left.sellerId === right.sellerId);
  }

  function targetFrom(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const sellerId = typeof value.sellerId === "string" ? value.sellerId.trim() : "";
    const sellerName = typeof value.sellerName === "string" ? value.sellerName.trim() : "";
    const sellerStoreUrl = typeof value.sellerStoreUrl === "string" ? value.sellerStoreUrl.trim() : "";
    const keyword = typeof value.keyword === "string" ? value.keyword.trim() : "";
    if (
      !/^[A-Za-z0-9_-]{1,80}$/.test(sellerId)
      || !sellerName || sellerName.length > 300
      || !sellerStoreUrl || sellerStoreUrl.length > 2000
      || !keyword || keyword.length > 100
    ) return null;
    try {
      const url = new URL(sellerStoreUrl);
      if (url.protocol !== "https:" || url.hostname !== "shop.coupang.com") return null;
    } catch {
      return null;
    }
    return { sellerId, sellerName, sellerStoreUrl, keyword };
  }

  function planFrom(value, expectedInput = null) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw ownerError("INVALID_COMPETITOR_CATALOG_PLAN", "Advertising owner returned an invalid competitor catalog plan.");
    }
    const attemptId = text(value.attemptId, "INVALID_COMPETITOR_CATALOG_PLAN");
    const attemptToken = text(value.attemptToken, "INVALID_COMPETITOR_CATALOG_PLAN");
    const state = text(value.state, "INVALID_COMPETITOR_CATALOG_PLAN");
    const expiresAt = text(value.expiresAt, "INVALID_COMPETITOR_CATALOG_PLAN");
    const input = normalizedInput(value.input);
    if (
      !["RUNNING", "COMPLETE", "FAILED"].includes(state)
      || !Number.isFinite(Date.parse(expiresAt))
      || (expectedInput && !sameInput(input, expectedInput))
      || !Array.isArray(value.targets)
      || value.targets.length > MAX_TARGETS
    ) {
      throw ownerError("INVALID_COMPETITOR_CATALOG_PLAN", "Advertising owner returned an invalid competitor catalog plan.");
    }
    const sellerIds = new Set();
    const targets = value.targets.map((target) => {
      const parsed = targetFrom(target);
      if (!parsed || sellerIds.has(parsed.sellerId)) {
        throw ownerError("INVALID_COMPETITOR_CATALOG_PLAN", "Advertising owner returned an invalid competitor catalog plan.");
      }
      sellerIds.add(parsed.sellerId);
      return parsed;
    });
    if (input.target === "seller_id" && (targets.length !== 1 || targets[0].sellerId !== input.sellerId)) {
      throw ownerError("INVALID_COMPETITOR_CATALOG_PLAN", "Advertising owner returned an invalid competitor catalog plan.");
    }
    return { attemptId, attemptToken, state, expiresAt, input, targets };
  }

  function terminalReplayResult(plan) {
    if (plan.state === "COMPLETE") {
      return { success: true, attemptId: plan.attemptId, terminalState: "COMPLETE" };
    }
    return {
      success: false,
      attemptId: plan.attemptId,
      terminalState: "FAILED",
      retryRequired: true,
      errorCode: "COMPETITOR_CATALOG_RETRY_REQUIRED",
      error: "The previous competitor catalog attempt failed. Start a new retry from KidItem.",
    };
  }

  function failureFrom(error, fallbackCode, fallbackMessage) {
    const code = typeof error?.code === "string" && error.code.trim()
      ? error.code.trim().slice(0, 100)
      : fallbackCode;
    const message = String(error?.message || fallbackMessage).trim().slice(0, 300) || fallbackMessage;
    return { code, message };
  }

  function create(options) {
    if (
      typeof options?.request !== "function"
      || typeof options?.collectTarget !== "function"
      || typeof options?.sessions?.start !== "function"
      || typeof options?.sessions?.cancel !== "function"
    ) {
      throw new Error("Competitor catalog source-owner dependencies are required.");
    }
    const request = options.request;
    const sessions = options.sessions;
    const activeExecutions = new Map();

    function launch(environmentId, work) {
      let tracked;
      tracked = Promise.resolve()
        .then(work)
        .finally(() => {
          if (activeExecutions.get(environmentId) === tracked) activeExecutions.delete(environmentId);
        });
      activeExecutions.set(environmentId, tracked);
      return tracked;
    }

    async function requestJson(environmentId, path, init) {
      const response = await request(environmentId, path, init);
      const body = await responseBody(response);
      if (!response?.ok) {
        throw ownerError(
          "COMPETITOR_CATALOG_OWNER_REQUEST_FAILED",
          body?.message || `Competitor catalog owner request failed (${response?.status || 0}).`,
          response?.status || null,
        );
      }
      return body;
    }

    async function begin(environmentId, input) {
      const scope = normalizedInput(input?.input);
      const plan = planFrom(await requestJson(
        environmentId,
        "/api/ads/competitor-catalogs/attempts",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": text(input?.idempotencyKey, "INVALID_IDEMPOTENCY_KEY"),
          },
          body: JSON.stringify(scope),
        },
      ), scope);
      if (plan.state === "RUNNING") {
        await sessions.start({ attemptId: plan.attemptId, environmentId, producer: PRODUCER });
      }
      return plan;
    }

    async function readAttemptControl(environmentId, attemptId, input) {
      try {
        const plan = planFrom(await requestJson(
          environmentId,
          `/api/ads/competitor-catalogs/attempts/${encodeURIComponent(text(attemptId, "INVALID_COMPETITOR_CATALOG_ATTEMPT"))}`,
          { method: "GET" },
        ), input);
        if (
          plan.attemptId !== attemptId
          || (plan.state === "RUNNING" && Date.parse(plan.expiresAt) <= Date.now())
        ) return null;
        return plan;
      } catch (error) {
        if (error?.status === 404 || error?.status === 409) return null;
        throw error;
      }
    }

    async function rehydrate(environmentId, input, includeAttention = false) {
      const persisted = (await sessions.list(environmentId)).filter(
        (session) => session?.producer === PRODUCER && (includeAttention || !session.attention),
      );
      if (persisted.length > 1) {
        throw ownerError(
          "COMPETITOR_CATALOG_ATTEMPT_CORRELATION_CONFLICT",
          "More than one competitor catalog attempt is stored for this environment.",
        );
      }
      const session = persisted[0];
      if (!session) return null;
      const plan = await readAttemptControl(environmentId, session.attemptId, input);
      if (plan) return plan;
      await sessions.remove(session.attemptId);
      return null;
    }

    async function sendTerminalRequest(environmentId, plan, { method, suffix, body }) {
      const path = `/api/ads/competitor-catalogs/attempts/${encodeURIComponent(plan.attemptId)}${suffix}`;
      const payload = JSON.stringify(body);
      for (let attempt = 0; attempt < TERMINAL_RETRIES; attempt += 1) {
        try {
          await requestJson(environmentId, path, {
            method,
            headers: {
              "Content-Type": "application/json",
              "x-source-attempt-token": plan.attemptToken,
            },
            body: payload,
          });
          return;
        } catch (error) {
          const retryable = !Number.isInteger(error?.status) || error.status >= 500;
          if (!retryable || attempt === TERMINAL_RETRIES - 1) throw error;
        }
      }
    }

    async function terminalSubmit(environmentId, plan, catalogs) {
      await sendTerminalRequest(environmentId, plan, {
        method: "PUT",
        suffix: "",
        body: { catalogs },
      });
    }

    async function terminalFail(environmentId, plan, error) {
      const failure = failureFrom(
        error,
        "COMPETITOR_CATALOG_COLLECTION_FAILED",
        "Competitor catalog collection failed.",
      );
      await sendTerminalRequest(environmentId, plan, {
        method: "POST",
        suffix: "/fail",
        body: failure,
      });
      return failure;
    }

    async function clearTerminalAttempt(environmentId, attemptId, tabId) {
      try {
        await options.closeAttempt?.(environmentId, attemptId, tabId);
      } catch {
        // The server owner has the terminal result; failed tab cleanup must
        // not retain a token or reopen canonical work.
      }
      await sessions.remove(attemptId);
    }

    async function execute(environmentId, plan) {
      let completed = 0;
      let collectionTabId = null;
      try {
        const catalogs = [];
        for (const target of plan.targets) {
          if (!(await sessions.get(plan.attemptId))) {
            throw ownerError("COLLECTION_CANCELLED", "Competitor catalog collection was cancelled by the user.");
          }
          await sessions.progress(plan.attemptId, {
            current: completed,
            total: plan.targets.length,
            completed,
            failed: 0,
            label: target.sellerName || target.sellerId,
          });
          let collected;
          try {
            collected = await options.collectTarget({
              environmentId,
              attemptId: plan.attemptId,
              target,
              collectionTabId,
            });
          } catch (error) {
            throw ownerError(
              "COMPETITOR_CATALOG_TARGET_COLLECTION_FAILED",
              "Competitor catalog collection did not prove every frozen seller target.",
            );
          }
          if (Number.isInteger(collected?.tabId)) collectionTabId = collected.tabId;
          if (collected?.attentionRequired) {
            const message = String(collected.error || "Coupang seller catalog needs attention.").trim()
              || "Coupang seller catalog needs attention.";
            await sessions.requireAttention(plan.attemptId, {
              reason: collected.reason || "marketplace_login",
              message,
            });
            return {
              success: false,
              terminalState: "RUNNING",
              attentionRequired: true,
              attemptId: plan.attemptId,
              completedTargetCount: completed,
              error: message,
            };
          }
          if (collected?.cancelled) {
            throw ownerError("COLLECTION_CANCELLED", "Competitor catalog collection was cancelled by the user.");
          }
          if (collected?.success !== true || !collected.catalog) {
            throw ownerError(
              "COMPETITOR_CATALOG_TARGET_COLLECTION_FAILED",
              "Competitor catalog collection did not prove every frozen seller target.",
            );
          }
          catalogs.push(collected.catalog);
          completed += 1;
          await sessions.progress(plan.attemptId, {
            current: completed,
            total: plan.targets.length,
            completed,
            failed: 0,
            label: target.sellerName || target.sellerId,
          });
        }
        if (!(await sessions.get(plan.attemptId))) {
          throw ownerError("COLLECTION_CANCELLED", "Competitor catalog collection was cancelled by the user.");
        }
        if (catalogs.length !== plan.targets.length) {
          throw ownerError(
            "COMPETITOR_CATALOG_TARGET_COLLECTION_FAILED",
            "Competitor catalog collection did not prove every frozen seller target.",
          );
        }
        await terminalSubmit(environmentId, plan, catalogs);
        await clearTerminalAttempt(environmentId, plan.attemptId, collectionTabId);
        return {
          success: true,
          attemptId: plan.attemptId,
          terminalState: "COMPLETE",
          capturedTargetCount: catalogs.length,
        };
      } catch (error) {
        let terminalState = "RUNNING";
        let failure = failureFrom(
          error,
          "COMPETITOR_CATALOG_COLLECTION_FAILED",
          "Competitor catalog collection failed.",
        );
        try {
          failure = await terminalFail(environmentId, plan, error);
          terminalState = "FAILED";
          await clearTerminalAttempt(environmentId, plan.attemptId, collectionTabId);
        } catch {
          // Preserve the bounded local correlation for recovery. It can only
          // read/replay this server attempt, never invent a replacement.
        }
        return {
          success: false,
          attemptId: plan.attemptId,
          terminalState,
          ...(terminalState === "FAILED" ? { retryRequired: true } : {}),
          errorCode: failure.code,
          error: failure.message,
        };
      }
    }

    async function run(input) {
      const environmentId = text(input?.environmentId, "INVALID_COLLECTION_ENVIRONMENT");
      const scope = normalizedInput(input?.input);
      const active = activeExecutions.get(environmentId);
      if (active) {
        const result = await active;
        return result === null ? run(input) : result;
      }
      return launch(environmentId, async () => {
        const plan = await rehydrate(environmentId, scope, true) || await begin(environmentId, input);
        return plan.state === "RUNNING" ? execute(environmentId, plan) : terminalReplayResult(plan);
      });
    }

    async function cancel(input) {
      const environmentId = text(input?.environmentId, "INVALID_COLLECTION_ENVIRONMENT");
      const attemptId = text(input?.attemptId, "INVALID_COMPETITOR_CATALOG_ATTEMPT");
      const session = await sessions.get(attemptId);
      if (!session || session.producer !== PRODUCER) {
        return { success: true, cancelled: false, attemptId };
      }
      if (session.environmentId !== environmentId) {
        throw ownerError(
          "COMPETITOR_CATALOG_ATTEMPT_ENVIRONMENT_MISMATCH",
          "Competitor catalog attempt belongs to another environment.",
        );
      }
      const cancelled = await sessions.cancel(attemptId, {
        closeManagedTab: true,
        ownerFailure: async () => {
          const plan = await readAttemptControl(environmentId, attemptId, null);
          if (plan?.state === "RUNNING") {
            await terminalFail(
              environmentId,
              plan,
              ownerError("COLLECTION_CANCELLED", "Competitor catalog collection was cancelled by the user."),
            );
          }
          return { accepted: true };
        },
      });
      return { success: true, cancelled: Boolean(cancelled), attemptId };
    }

    async function recover(environmentId) {
      const normalizedEnvironmentId = text(environmentId, "INVALID_COLLECTION_ENVIRONMENT");
      const active = activeExecutions.get(normalizedEnvironmentId);
      if (active) return active;
      return launch(normalizedEnvironmentId, async () => {
        const persisted = (await sessions.list(normalizedEnvironmentId)).filter(
          (session) => session?.producer === PRODUCER && !session.attention,
        );
        if (persisted.length === 0) return null;
        if (persisted.length > 1) {
          throw ownerError(
            "COMPETITOR_CATALOG_ATTEMPT_CORRELATION_CONFLICT",
            "More than one competitor catalog attempt is stored for this environment.",
          );
        }
        const plan = await readAttemptControl(normalizedEnvironmentId, persisted[0].attemptId, null);
        if (!plan) {
          await sessions.remove(persisted[0].attemptId);
          return null;
        }
        return plan.state === "RUNNING" ? execute(normalizedEnvironmentId, plan) : terminalReplayResult(plan);
      });
    }

    return Object.freeze({ cancel, recover, run });
  }

  root.KidItemCompetitorCatalogSourceOwner = Object.freeze({ create });
})(globalThis);
