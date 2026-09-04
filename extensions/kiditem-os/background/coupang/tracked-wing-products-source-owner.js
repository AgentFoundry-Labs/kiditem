(function installTrackedWingProductsSourceOwner(root) {
  "use strict";

  const PRODUCER = "advertising.wing_tracked_products";
  const MAX_KEYWORDS = 12;
  const MAX_PRODUCTS = 300;
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

  function planFrom(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw ownerError("INVALID_TRACKED_WING_PLAN", "Advertising owner returned an invalid tracked Wing plan.");
    }
    const plan = {
      attemptId: text(value.attemptId, "INVALID_TRACKED_WING_PLAN"),
      attemptToken: text(value.attemptToken, "INVALID_TRACKED_WING_PLAN"),
      state: text(value.state, "INVALID_TRACKED_WING_PLAN"),
      expiresAt: text(value.expiresAt, "INVALID_TRACKED_WING_PLAN"),
      businessDate: text(value.businessDate, "INVALID_TRACKED_WING_PLAN"),
      keywords: Array.isArray(value.keywords) ? value.keywords : null,
      products: Array.isArray(value.products) ? value.products : null,
    };
    if (
      !plan.keywords ||
      !plan.products ||
      !["RUNNING", "COMPLETE", "FAILED"].includes(plan.state) ||
      !Number.isFinite(Date.parse(plan.expiresAt)) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(plan.businessDate) ||
      plan.keywords.length < 1 ||
      plan.keywords.length > MAX_KEYWORDS ||
      plan.products.length > MAX_PRODUCTS
    ) {
      throw ownerError("INVALID_TRACKED_WING_PLAN", "Advertising owner returned an invalid tracked Wing plan.");
    }

    const keywordIdentity = new Set();
    plan.keywords = plan.keywords.map((keyword) => {
      const normalized = text(keyword, "INVALID_TRACKED_WING_PLAN");
      const identity = normalized.toLocaleLowerCase("en-US");
      if (keywordIdentity.has(identity)) {
        throw ownerError("INVALID_TRACKED_WING_PLAN", "Advertising owner returned duplicate tracked Wing keywords.");
      }
      keywordIdentity.add(identity);
      return normalized;
    });

    const productIdentity = new Set();
    plan.products = plan.products.map((product) => {
      if (!product || typeof product !== "object" || Array.isArray(product)) {
        throw ownerError("INVALID_TRACKED_WING_PLAN", "Advertising owner returned an invalid tracked Wing product.");
      }
      const productId = text(product.productId, "INVALID_TRACKED_WING_PLAN");
      if (productIdentity.has(productId)) {
        throw ownerError("INVALID_TRACKED_WING_PLAN", "Advertising owner returned duplicate tracked Wing products.");
      }
      productIdentity.add(productId);
      return {
        productId,
        sourceKeyword:
          typeof product.sourceKeyword === "string" && product.sourceKeyword.trim()
            ? product.sourceKeyword.trim()
            : null,
      };
    });
    return plan;
  }

  function failureFrom(error, fallbackCode, fallbackMessage) {
    const code = typeof error?.code === "string" && error.code.trim()
      ? error.code.trim().slice(0, 100)
      : fallbackCode;
    const message = String(error?.message || fallbackMessage).trim().slice(0, 300) || fallbackMessage;
    return { code, message };
  }

  function collectionItem(candidate, keyword, plannedProducts, captured) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const productId = typeof candidate.productId === "string" ? candidate.productId.trim() : "";
    if (!productId || !plannedProducts.has(productId) || captured.has(productId)) return null;
    const item = { productId, sourceKeyword: keyword };
    for (const key of [
      "salePriceKrw",
      "ratingCount",
      "ratingAverage",
      "pvLast28Day",
      "salesLast28d",
      "estimatedRevenue28d",
      "conversionRate28d",
    ]) {
      if (candidate[key] !== undefined) item[key] = candidate[key];
    }
    return item;
  }

  function terminalReplayResult(plan) {
    if (plan.state === "COMPLETE") {
      return {
        success: true,
        attemptId: plan.attemptId,
        terminalState: "COMPLETE",
      };
    }
    return {
      success: false,
      attemptId: plan.attemptId,
      terminalState: "FAILED",
      retryRequired: true,
      errorCode: "TRACKED_WING_RETRY_REQUIRED",
      error: "The previous tracked Wing attempt failed. Start a new retry from KidItem.",
    };
  }

  function create(options) {
    if (
      typeof options?.request !== "function" ||
      typeof options?.collectKeyword !== "function" ||
      typeof options?.sessions?.cancel !== "function"
    ) {
      throw new Error("Tracked Wing source-owner dependencies are required.");
    }
    const request = options.request;
    const sessions = options.sessions;
    const activeExecutions = new Map();

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
          "TRACKED_WING_OWNER_REQUEST_FAILED",
          body?.message || `Tracked Wing owner request failed (${response?.status || 0}).`,
          response?.status || null,
        );
      }
      return body;
    }

    async function begin(environmentId, input) {
      const plan = planFrom(await requestJson(
        environmentId,
        "/api/ads/wing-tracked-products/attempts",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": text(input?.idempotencyKey, "INVALID_IDEMPOTENCY_KEY"),
          },
          body: JSON.stringify({ keywords: input?.keywords }),
        },
      ));
      if (plan.state === "RUNNING") {
        await sessions.start({
          attemptId: plan.attemptId,
          environmentId,
          producer: PRODUCER,
        });
      }
      return plan;
    }

    async function readAttemptControl(environmentId, attemptId) {
      try {
        const plan = planFrom(await requestJson(
          environmentId,
          `/api/ads/wing-tracked-products/attempts/${encodeURIComponent(text(attemptId, "INVALID_TRACKED_WING_ATTEMPT"))}`,
          { method: "GET" },
        ));
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

    async function rehydrate(environmentId, includeAttention = false) {
      const persisted = (await sessions.list(environmentId)).filter(
        (session) => session?.producer === PRODUCER && (includeAttention || !session.attention),
      );
      if (persisted.length > 1) {
        throw ownerError(
          "TRACKED_WING_ATTEMPT_CORRELATION_CONFLICT",
          "More than one tracked Wing attempt is stored for this environment.",
        );
      }
      const session = persisted[0];
      if (!session) return null;
      const plan = await readAttemptControl(environmentId, session.attemptId);
      if (plan) return plan;
      await sessions.remove(session.attemptId);
      return null;
    }

    async function sendTerminalRequest(environmentId, plan, { method, suffix, body }) {
      const path = `/api/ads/wing-tracked-products/attempts/${encodeURIComponent(plan.attemptId)}${suffix}`;
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

    async function terminalSubmit(environmentId, plan, body) {
      await sendTerminalRequest(environmentId, plan, {
        method: "PUT",
        suffix: "",
        body,
      });
    }

    async function terminalFail(environmentId, plan, error) {
      const failure = failureFrom(
        error,
        "TRACKED_WING_COLLECTION_FAILED",
        "Tracked Wing collection failed.",
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
        // The source owner has the terminal result. A local tab cleanup retry
        // must not retain the attempt token or reopen canonical work.
      }
      await sessions.remove(attemptId);
    }

    async function execute(environmentId, plan) {
      let completedKeywords = 0;
      let failedKeywords = 0;
      let collectionTabId = null;
      try {
        const plannedProducts = new Map(plan.products.map((product) => [product.productId, product]));
        const captured = new Map();
        if (plan.products.length > 0) {
          for (const keyword of plan.keywords) {
            if (!(await sessions.get(plan.attemptId))) {
              throw ownerError("COLLECTION_CANCELLED", "Tracked Wing collection was cancelled by the user.");
            }
            await sessions.progress(plan.attemptId, {
              current: completedKeywords,
              total: plan.keywords.length,
              completed: completedKeywords,
              failed: failedKeywords,
              label: keyword,
            });
            let collected;
            try {
              collected = await options.collectKeyword({
                environmentId,
                attemptId: plan.attemptId,
                keyword,
                plannedProducts: [...plannedProducts.keys()],
                collectionTabId,
              });
            } catch {
              failedKeywords += 1;
              continue;
            }
            if (Number.isInteger(collected?.tabId)) collectionTabId = collected.tabId;
            if (collected?.attentionRequired) {
              const message = String(
                collected.error || "Coupang Wing needs attention.",
              ).trim() || "Coupang Wing needs attention.";
              await sessions.requireAttention(plan.attemptId, {
                reason: collected.reason || "unknown",
                message,
              });
              return {
                success: false,
                terminalState: "RUNNING",
                attentionRequired: true,
                attemptId: plan.attemptId,
                completedKeywordCount: completedKeywords,
                error: message,
              };
            }
            if (collected?.cancelled) {
              throw ownerError("COLLECTION_CANCELLED", "Tracked Wing collection was cancelled by the user.");
            }
            if (collected?.success !== true) {
              failedKeywords += 1;
              continue;
            }
            for (const candidate of Array.isArray(collected.items) ? collected.items : []) {
              const item = collectionItem(candidate, keyword, plannedProducts, captured);
              if (item) captured.set(item.productId, item);
            }
            completedKeywords += 1;
            await sessions.progress(plan.attemptId, {
              current: completedKeywords + failedKeywords,
              total: plan.keywords.length,
              completed: completedKeywords,
              failed: failedKeywords,
              label: keyword,
            });
          }
        }
        if (plan.products.length > 0 && failedKeywords === plan.keywords.length) {
          throw ownerError(
            "TRACKED_WING_ALL_KEYWORDS_FAILED",
            "Tracked Wing collection failed for every planned keyword.",
          );
        }
        if (failedKeywords > 0) {
          throw ownerError(
            "TRACKED_WING_KEYWORD_COLLECTION_FAILED",
            "Tracked Wing collection did not prove every planned keyword.",
          );
        }
        if (!(await sessions.get(plan.attemptId))) {
          throw ownerError("COLLECTION_CANCELLED", "Tracked Wing collection was cancelled by the user.");
        }
        const items = [...captured.values()];
        const failures = plan.products
          .filter((product) => !captured.has(product.productId))
          .map((product) => ({
            productId: product.productId,
            code: "TRACKED_PRODUCT_NOT_FOUND",
            message: "Product was not found in the server-planned Wing keyword searches.",
          }));
        if (failures.length > 0) {
          throw ownerError(
            "TRACKED_PRODUCT_NOT_FOUND",
            "Tracked Wing collection did not prove every frozen tracked product.",
          );
        }
        await terminalSubmit(environmentId, plan, { items });
        await clearTerminalAttempt(environmentId, plan.attemptId, collectionTabId);
        return {
          success: true,
          attemptId: plan.attemptId,
          terminalState: "COMPLETE",
          capturedProductCount: items.length,
          failedProductCount: 0,
        };
      } catch (error) {
        let terminalState = "RUNNING";
        let failure = failureFrom(
          error,
          "TRACKED_WING_COLLECTION_FAILED",
          "Tracked Wing collection failed.",
        );
        try {
          failure = await terminalFail(environmentId, plan, error);
          terminalState = "FAILED";
          await clearTerminalAttempt(environmentId, plan.attemptId, collectionTabId);
        } catch {
          // Leave only the bounded local correlation so a worker restart can
          // read the exact server attempt; it cannot create a replacement.
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
      const active = activeExecutions.get(environmentId);
      if (active) {
        const result = await active;
        return result === null ? run(input) : result;
      }
      return launch(environmentId, async () => {
        const plan = await rehydrate(environmentId, true) || await begin(environmentId, input);
        return plan.state === "RUNNING"
          ? execute(environmentId, plan)
          : terminalReplayResult(plan);
      });
    }

    async function cancel(input) {
      const environmentId = text(input?.environmentId, "INVALID_COLLECTION_ENVIRONMENT");
      const attemptId = text(input?.attemptId, "INVALID_TRACKED_WING_ATTEMPT");
      const session = await sessions.get(attemptId);
      if (!session || session.producer !== PRODUCER) {
        return { success: true, cancelled: false, attemptId };
      }
      if (session.environmentId !== environmentId) {
        throw ownerError(
          "TRACKED_WING_ATTEMPT_ENVIRONMENT_MISMATCH",
          "Tracked Wing attempt belongs to another environment.",
        );
      }
      const cancelled = await sessions.cancel(attemptId, {
        closeManagedTab: true,
        ownerFailure: async () => {
          const plan = await readAttemptControl(environmentId, attemptId);
          if (plan?.state === "RUNNING") {
            await terminalFail(
              environmentId,
              plan,
              ownerError("COLLECTION_CANCELLED", "Tracked Wing collection was cancelled by the user."),
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
        const plan = await rehydrate(normalizedEnvironmentId);
        return plan
          ? plan.state === "RUNNING"
            ? execute(normalizedEnvironmentId, plan)
            : terminalReplayResult(plan)
          : null;
      });
    }

    return Object.freeze({ cancel, recover, run });
  }

  root.KidItemTrackedWingProductsSourceOwner = Object.freeze({ create });
})(globalThis);
