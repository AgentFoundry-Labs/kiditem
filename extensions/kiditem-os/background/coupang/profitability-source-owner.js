(function installProfitabilitySourceOwner(root) {
  "use strict";

  const PRODUCER = "advertising.profitability_import";

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

  function nonnegativeInteger(value, code) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw ownerError(code, code);
    }
    return value;
  }

  function stableStringify(value) {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value) ?? "null";
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    }
    return `{${Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(",")}}`;
  }

  function compareLowercase(left, right) {
    const a = left.toLowerCase();
    const b = right.toLowerCase();
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function canonicalRows(value) {
    if (!Array.isArray(value)) {
      throw ownerError("INVALID_PROFITABILITY_RECEIPT", "Profitability receipt rows are required.");
    }
    const seen = new Set();
    const rows = value.map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw ownerError("INVALID_PROFITABILITY_RECEIPT", "Profitability receipt row is invalid.");
      }
      const normalized = {
        businessDate: text(row.businessDate, "INVALID_PROFITABILITY_RECEIPT"),
        externalOptionId: text(row.externalOptionId, "INVALID_PROFITABILITY_RECEIPT"),
        adSpend: nonnegativeInteger(row.adSpend, "INVALID_PROFITABILITY_RECEIPT"),
        impressions: nonnegativeInteger(row.impressions, "INVALID_PROFITABILITY_RECEIPT"),
        clicks: nonnegativeInteger(row.clicks, "INVALID_PROFITABILITY_RECEIPT"),
        orders: nonnegativeInteger(row.orders, "INVALID_PROFITABILITY_RECEIPT"),
        conversions: nonnegativeInteger(row.conversions, "INVALID_PROFITABILITY_RECEIPT"),
        adRevenue: nonnegativeInteger(row.adRevenue, "INVALID_PROFITABILITY_RECEIPT"),
      };
      const identity = `${normalized.businessDate}\u0000${normalized.externalOptionId}`;
      if (seen.has(identity)) {
        throw ownerError("INVALID_PROFITABILITY_RECEIPT", "Profitability receipt contains duplicate provider rows.");
      }
      seen.add(identity);
      return normalized;
    });
    return rows.sort((left, right) =>
      compareLowercase(left.businessDate, right.businessDate) ||
      compareLowercase(left.externalOptionId, right.externalOptionId) ||
      left.adSpend - right.adSpend ||
      left.adRevenue - right.adRevenue ||
      left.impressions - right.impressions ||
      left.clicks - right.clicks ||
      left.orders - right.orders ||
      left.conversions - right.conversions,
    );
  }

  async function sha256Hex(value) {
    const bytes = new TextEncoder().encode(stableStringify(value));
    const digest = await root.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function planFrom(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw ownerError("INVALID_PROFITABILITY_PLAN", "Advertising owner returned an invalid plan.");
    }
    const plan = {
      attemptId: text(value.attemptId, "INVALID_PROFITABILITY_PLAN"),
      attemptToken: text(value.attemptToken, "INVALID_PROFITABILITY_PLAN"),
      expiresAt: text(value.expiresAt, "INVALID_PROFITABILITY_PLAN"),
      accounts: Array.isArray(value.accounts) ? value.accounts : null,
    };
    if (!plan.accounts || !Number.isFinite(Date.parse(plan.expiresAt))) {
      throw ownerError("INVALID_PROFITABILITY_PLAN", "Advertising owner returned an invalid plan.");
    }
    plan.accounts = plan.accounts.map((account) => {
      if (!account || typeof account !== "object" || Array.isArray(account)) {
        throw ownerError("INVALID_PROFITABILITY_PLAN", "Advertising account plan is invalid.");
      }
      const slices = Array.isArray(account.slices) ? account.slices : null;
      if (!slices) {
        throw ownerError("INVALID_PROFITABILITY_PLAN", "Advertising account slice plan is invalid.");
      }
      return {
        externalAccountId: text(account.externalAccountId, "INVALID_PROFITABILITY_PLAN"),
        expectedAdvertiserId: text(account.expectedAdvertiserId, "INVALID_PROFITABILITY_PLAN"),
        slices: slices.map((slice) => {
          if (!slice || typeof slice !== "object" || Array.isArray(slice)) {
            throw ownerError("INVALID_PROFITABILITY_PLAN", "Advertising slice plan is invalid.");
          }
          if (!Array.isArray(slice.businessDates)) {
            throw ownerError("INVALID_PROFITABILITY_PLAN", "Advertising slice plan is invalid.");
          }
          return {
            sliceId: text(slice.sliceId, "INVALID_PROFITABILITY_PLAN"),
            from: text(slice.from, "INVALID_PROFITABILITY_PLAN"),
            to: text(slice.to, "INVALID_PROFITABILITY_PLAN"),
            businessDates: slice.businessDates.map((date) =>
              text(date, "INVALID_PROFITABILITY_PLAN")),
          };
        }),
      };
    });
    return plan;
  }

  async function responseBody(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  function create(options) {
    if (typeof options?.request !== "function" ||
      typeof options?.collectSlice !== "function" ||
      !options?.sessions) {
      throw new Error("Profitability source-owner dependencies are required.");
    }
    const request = options.request;
    const sessions = options.sessions;
    const activeExecutions = new Map();

    async function isActive(attemptId, environmentId) {
      if (typeof sessions.isActive === "function") {
        return sessions.isActive(attemptId, environmentId, PRODUCER);
      }
      const session = await sessions.get(attemptId).catch(() => null);
      return session?.environmentId === environmentId && session.producer === PRODUCER;
    }

    function cancellationError() {
      const error = ownerError("COLLECTION_CANCELLED", "Advertising profitability collection was cancelled.");
      error.cancellationPending = true;
      return error;
    }

    function stoppedOutcome(attemptId, completedSliceCount = 0) {
      return {
        success: false,
        attemptId,
        completedSliceCount,
        cancellationPending: true,
        errorCode: "COLLECTION_CANCELLED",
      };
    }

    function launch(environmentId, work) {
      let tracked;
      tracked = Promise.resolve()
        .then(work)
        .finally(() => {
          if (activeExecutions.get(environmentId) === tracked) {
            activeExecutions.delete(environmentId);
          }
        });
      activeExecutions.set(environmentId, tracked);
      return tracked;
    }

    async function requestJson(environmentId, path, init) {
      const response = await request(environmentId, path, init);
      const body = await responseBody(response);
      if (!response?.ok) {
        throw ownerError(
          "ADVERTISING_OWNER_REQUEST_FAILED",
          body?.message || `Advertising owner request failed (${response?.status || 0}).`,
          response?.status || null,
        );
      }
      return body;
    }

    async function begin(environmentId, idempotencyKey) {
      const plan = planFrom(await requestJson(
        environmentId,
        "/api/ads/profitability-imports",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": text(idempotencyKey, "INVALID_IDEMPOTENCY_KEY"),
          },
          body: "{}",
        },
      ));
      await sessions.start({
        attemptId: plan.attemptId,
        environmentId,
        producer: PRODUCER,
      });
      return plan;
    }

    async function readAttemptControl(environmentId, attemptId) {
      try {
        const plan = planFrom(await requestJson(
          environmentId,
          `/api/ads/profitability-imports/${encodeURIComponent(text(attemptId, "INVALID_PROFITABILITY_ATTEMPT"))}`,
          { method: "GET" },
        ));
        if (plan.attemptId !== attemptId || Date.parse(plan.expiresAt) <= Date.now()) {
          return null;
        }
        return plan;
      } catch (error) {
        if (error?.status === 404 || error?.status === 409) return null;
        throw error;
      }
    }

    async function rehydrate(environmentId, includeAttention = false) {
      const persisted = (await sessions.list(environmentId))
        .filter((session) =>
          session?.producer === PRODUCER && (includeAttention || !session.attention));
      if (persisted.length > 1) {
        throw ownerError(
          "ADVERTISING_ATTEMPT_CORRELATION_CONFLICT",
          "More than one Advertising profitability attempt is stored for this environment.",
        );
      }
      const session = persisted[0];
      if (!session) return null;
      if (typeof sessions.isActive === "function" &&
        !(await sessions.isActive(session.attemptId, environmentId, PRODUCER))) return null;
      const plan = await readAttemptControl(environmentId, session.attemptId);
      if (plan) return plan;
      await sessions.remove(session.attemptId);
      return null;
    }

    async function upload(environmentId, plan, account, slice, sequence, receipt) {
      const rows = canonicalRows(receipt?.rows);
      const providerAdvertiserId = text(
        receipt?.providerAdvertiserId,
        "INVALID_PROFITABILITY_RECEIPT",
      );
      if (providerAdvertiserId !== account.expectedAdvertiserId) {
        throw ownerError(
          "ADVERTISER_IDENTITY_MISMATCH",
          "The visible Coupang advertiser does not match the server-planned account.",
        );
      }
      const body = {
        sequence,
        checksum: await sha256Hex(rows),
        providerAdvertiserId,
        reportId: text(receipt?.reportId, "INVALID_PROFITABILITY_RECEIPT"),
        campaignCount: nonnegativeInteger(receipt?.campaignCount, "INVALID_PROFITABILITY_RECEIPT"),
        expectedRowCount: nonnegativeInteger(receipt?.expectedRowCount, "INVALID_PROFITABILITY_RECEIPT"),
        collectedRowCount: nonnegativeInteger(receipt?.collectedRowCount, "INVALID_PROFITABILITY_RECEIPT"),
        responseBytes: nonnegativeInteger(receipt?.responseBytes, "INVALID_PROFITABILITY_RECEIPT"),
        rows,
      };
      const path =
        `/api/ads/profitability-imports/${encodeURIComponent(plan.attemptId)}` +
        `/slices/${encodeURIComponent(slice.sliceId)}`;
      const payload = JSON.stringify(body);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (!(await isActive(plan.attemptId, environmentId))) throw cancellationError();
        try {
          await requestJson(environmentId, path, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "x-source-attempt-token": plan.attemptToken,
            },
            body: payload,
          });
          return;
        } catch (error) {
          const retryable = !Number.isInteger(error?.status) || error.status >= 500;
          if (!retryable || attempt === 2) throw error;
        }
      }
    }

    async function fail(environmentId, plan, error) {
      const code = typeof error?.code === "string" && error.code.trim()
        ? error.code.trim().slice(0, 100)
        : "ADVERTISING_PROFITABILITY_COLLECTION_FAILED";
      const message = String(
        error?.message || "Advertising profitability collection failed.",
      ).trim().slice(0, 300) || "Advertising profitability collection failed.";
      await requestJson(
        environmentId,
        `/api/ads/profitability-imports/${encodeURIComponent(plan.attemptId)}/fail`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-source-attempt-token": plan.attemptToken,
          },
          body: JSON.stringify({ code, message }),
        },
      );
      return { code, message };
    }

    async function clearTerminalAttempt(environmentId, attemptId) {
      try {
        await options.closeAttempt?.(environmentId, attemptId);
      } catch {
        // The owner has already accepted a terminal outcome. Do not retain a
        // stale correlation session solely because best-effort tab cleanup
        // was interrupted.
      }
      await sessions.remove(attemptId);
    }

    async function execute(environmentId, plan) {
      let completed = 0;
      try {
        const total = plan.accounts.reduce((count, account) => count + account.slices.length, 0);
        for (const account of plan.accounts) {
          for (const slice of account.slices) {
            if (!(await isActive(plan.attemptId, environmentId))) return stoppedOutcome(plan.attemptId, completed);
            const active = await sessions.get(plan.attemptId);
            if (!active) {
              throw ownerError("COLLECTION_CANCELLED", "Advertising profitability collection was cancelled.");
            }
            await sessions.progress(plan.attemptId, {
              current: completed,
              total,
              completed,
              failed: 0,
              label: account.externalAccountId,
            });
            const collected = await options.collectSlice({
              environmentId,
              attemptId: plan.attemptId,
              account,
              slice,
            });
            if (!(await isActive(plan.attemptId, environmentId))) return stoppedOutcome(plan.attemptId, completed);
            if (collected?.attentionRequired) {
              const message = String(
                collected.error || "Coupang advertising needs attention.",
              ).trim() || "Coupang advertising needs attention.";
              await sessions.requireAttention(plan.attemptId, {
                reason: collected.reason || "unknown",
                message,
              });
              return {
                success: false,
                attentionRequired: true,
                attemptId: plan.attemptId,
                completedSliceCount: completed,
                error: message,
              };
            }
            if (collected?.success !== true || !collected.receipt) {
              throw ownerError(
                collected?.errorCode || "ADVERTISING_PROFITABILITY_COLLECTION_FAILED",
                collected?.error || "Advertising profitability collection failed.",
              );
            }
            await upload(environmentId, plan, account, slice, completed, collected.receipt);
            if (!(await isActive(plan.attemptId, environmentId))) return stoppedOutcome(plan.attemptId, completed);
            completed += 1;
            await sessions.progress(plan.attemptId, {
              current: completed,
              total,
              completed,
              failed: 0,
              label: account.externalAccountId,
            });
          }
        }
        if (!(await isActive(plan.attemptId, environmentId))) return stoppedOutcome(plan.attemptId, completed);
        await requestJson(
          environmentId,
          `/api/ads/profitability-imports/${encodeURIComponent(plan.attemptId)}/complete`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-source-attempt-token": plan.attemptToken,
            },
            body: "{}",
          },
        );
        await clearTerminalAttempt(environmentId, plan.attemptId);
        return { success: true, attemptId: plan.attemptId, completedSliceCount: completed };
      } catch (error) {
        if (error?.cancellationPending) return stoppedOutcome(plan.attemptId, completed);
        let failure = {
          code: typeof error?.code === "string"
            ? error.code
            : "ADVERTISING_PROFITABILITY_COLLECTION_FAILED",
          message: error?.message || "Advertising profitability collection failed.",
        };
        try {
          failure = await fail(environmentId, plan, error);
          await clearTerminalAttempt(environmentId, plan.attemptId);
        } catch {
          // Keep the bounded correlation session so a later worker start can
          // rehydrate the same server-issued attempt and report its outcome.
        }
        return {
          success: false,
          attemptId: plan.attemptId,
          completedSliceCount: completed,
          errorCode: failure.code,
          error: failure.message,
        };
      }
    }

    async function run(input) {
      const environmentId = text(input?.environmentId, "INVALID_COLLECTION_ENVIRONMENT");
      const active = activeExecutions.get(environmentId);
      if (active) {
        const result = await active;
        return result === null ? run(input) : result;
      }
      return launch(environmentId, () => takeWindowTurn(environmentId, async () => {
        const plan = await rehydrate(environmentId, true) ||
          await begin(environmentId, input?.idempotencyKey);
        return execute(environmentId, plan);
      }));
    }

    async function cancel(input) {
      const environmentId = text(input?.environmentId, "INVALID_COLLECTION_ENVIRONMENT");
      const attemptId = text(input?.attemptId, "INVALID_PROFITABILITY_ATTEMPT");
      const session = await sessions.get(attemptId);
      if (!session || session.producer !== PRODUCER) {
        return { success: true, cancelled: false, attemptId };
      }
      if (session.environmentId !== environmentId) {
        throw ownerError(
          "ADVERTISING_ATTEMPT_ENVIRONMENT_MISMATCH",
          "Advertising profitability attempt belongs to another environment.",
        );
      }
      const plan = await readAttemptControl(environmentId, attemptId);
      if (plan) {
        await fail(
          environmentId,
          plan,
          ownerError(
            "COLLECTION_CANCELLED",
            "Advertising profitability collection was cancelled by the user.",
          ),
        );
      }
      await clearTerminalAttempt(environmentId, attemptId);
      return { success: true, cancelled: true, attemptId };
    }

    async function recover(environmentId) {
      const normalizedEnvironmentId = text(
        environmentId,
        "INVALID_COLLECTION_ENVIRONMENT",
      );
      const active = activeExecutions.get(normalizedEnvironmentId);
      if (active) return active;
      return launch(normalizedEnvironmentId, () => takeWindowTurn(normalizedEnvironmentId, async () => {
        const plan = await rehydrate(normalizedEnvironmentId);
        return plan ? execute(normalizedEnvironmentId, plan) : null;
      }));
    }

    // A run holds the environment's collection window from its first read until
    // its outcome is reported and its window and session are released.
    function takeWindowTurn(environmentId, operation) {
      return typeof options.takeWindowTurn === "function"
        ? options.takeWindowTurn(environmentId, operation)
        : operation();
    }

    // The owner answers a completed, failed or expired import as not found or
    // conflicting instead of returning its plan: that attempt has ended.
    async function attemptEnded(environmentId, attemptId) {
      return (await readAttemptControl(environmentId, attemptId)) === null;
    }

    return Object.freeze({ attemptEnded, cancel, recover, run });
  }

  root.KidItemProfitabilitySourceOwner = Object.freeze({ create });
})(globalThis);
