(function (global) {
  "use strict";

  const PRODUCER = "sourcing.live_commerce";
  const REQUEST_KEY = "kiditem_live_commerce_request_v1";
  const SOURCE_PATH = "/sourcing/live-commerce/browser/attempts";
  const MAX_PRODUCTS = 100;
  const NAVIGATION_TIMEOUT_MS = 35_000;
  const EXTRACTION_TIMEOUT_MS = 25_000;

  function create(options) {
    const chromeApi = options.chrome;
    const getBackendRequestConfig = options.getBackendRequestConfig;
    const ensureContentScripts = options.ensureContentScripts;
    const sessions = options.sessions;
    const activeRuns = new Map();
    const wire = global.KidItemSourcingAttemptWire.create({
      chrome: chromeApi, sourcePath: SOURCE_PATH,
      requestFailureMessage: "Live Commerce source owner request failed",
    });
    const requestJson = wire.requestJson;
    const storageGet = wire.getCorrelation;
    const failureFrom = wire.failure;

    function ownerError(code, message, status = null) {
      const error = new Error(message);
      error.code = code;
      if (status !== null) error.status = status;
      return error;
    }

    function requiredText(value, code, max = 300) {
      if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
        throw ownerError(code, code);
      }
      return value.trim();
    }

    function isTerminalState(value) {
      return value === "COMPLETE" || value === "FAILED";
    }

    function requestStorageKey(environmentId, attemptId) {
      return `${REQUEST_KEY}:${environmentId}:${attemptId}`;
    }

    async function persistRequestIdentity(environmentId, attemptId, idempotencyKey) {
      // Recovery reads the frozen page URL from the owner. Persisting only
      // correlation keeps URL query/fragment data and the attempt token out of
      // extension session/local state.
      await wire.setCorrelation(requestStorageKey(environmentId, attemptId), { idempotencyKey });
    }

    async function readRequestIdentity(environmentId, attemptId) {
      const value = await storageGet(requestStorageKey(environmentId, attemptId));
      return typeof value?.idempotencyKey === "string" && value.idempotencyKey.trim()
        ? { idempotencyKey: value.idempotencyKey.trim() }
        : null;
    }

    async function clearRequestIdentity(environmentId, attemptId) {
      await wire.clearCorrelation(requestStorageKey(environmentId, attemptId));
    }

    function sourcePlanFrom(value, { requireToken = false } = {}) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw ownerError("INVALID_LIVE_COMMERCE_SOURCE_PLAN", "Sourcing owner returned an invalid Live Commerce plan.");
      }
      const attemptId = requiredText(value.attemptId, "INVALID_LIVE_COMMERCE_SOURCE_PLAN");
      const state = requiredText(value.state, "INVALID_LIVE_COMMERCE_SOURCE_PLAN", 20);
      const expiresAt = requiredText(value.expiresAt, "INVALID_LIVE_COMMERCE_SOURCE_PLAN");
      const rawPlan = value.plan;
      if (
        !["RUNNING", "COMPLETE", "FAILED"].includes(state)
        || !Number.isFinite(Date.parse(expiresAt))
        || !rawPlan
        || typeof rawPlan !== "object"
        || Array.isArray(rawPlan)
        || rawPlan.maxProducts !== MAX_PRODUCTS
      ) {
        throw ownerError("INVALID_LIVE_COMMERCE_SOURCE_PLAN", "Sourcing owner returned an invalid Live Commerce plan.");
      }
      const validated = validateLiveUrl(rawPlan.pageUrl);
      if (!validated.ok || rawPlan.source !== validated.source) {
        throw ownerError("INVALID_LIVE_COMMERCE_SOURCE_PLAN", "Sourcing owner returned an invalid Live Commerce plan.");
      }
      const attemptToken = typeof value.attemptToken === "string" && value.attemptToken.trim()
        ? value.attemptToken.trim()
        : null;
      if (state === "RUNNING" && requireToken && !attemptToken) {
        throw ownerError("INVALID_LIVE_COMMERCE_SOURCE_PLAN", "Sourcing owner returned an invalid Live Commerce plan.");
      }
      return {
        attemptId,
        attemptToken,
        state,
        expiresAt,
        plan: {
          source: validated.source,
          pageUrl: validated.url,
          maxProducts: MAX_PRODUCTS,
        },
        errorCode: typeof value.errorCode === "string" ? value.errorCode : null,
        errorMessage: typeof value.errorMessage === "string" ? value.errorMessage : null,
      };
    }

    function terminalResult(plan) {
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
        errorCode: plan.errorCode || "SOURCE_RETRY_REQUIRED",
        error: plan.errorMessage || "The Live Commerce collection failed. Start a new retry from KidItem.",
      };
    }


    async function begin(config, environmentId, input) {
      const validated = validateLiveUrl(input?.url);
      if (!validated.ok) throw ownerError("INVALID_LIVE_COMMERCE_URL", validated.error);
      const plan = sourcePlanFrom(await requestJson(config, SOURCE_PATH, {
        method: "POST",
        headers: {
          ...config.headers,
          "Idempotency-Key": requiredText(input?.idempotencyKey, "INVALID_IDEMPOTENCY_KEY"),
        },
        body: JSON.stringify({ url: validated.url }),
      }), { requireToken: true });
      if (plan.state === "RUNNING") {
        await sessions.start({
          attemptId: plan.attemptId,
          environmentId,
          producer: PRODUCER,
        });
        await persistRequestIdentity(environmentId, plan.attemptId, input.idempotencyKey);
      }
      return plan;
    }

    async function readAttempt(config, attemptId) {
      return sourcePlanFrom(await requestJson(
        config,
        `${SOURCE_PATH}/${encodeURIComponent(attemptId)}`,
        { method: "GET", headers: config.headers },
      ));
    }

    function terminalSubmit(config, plan, body) {
      return wire.terminal(config, plan, { method: "PUT", suffix: "", body }, sourcePlanFrom);
    }

    async function terminalFail(config, plan, error) {
      const failure = failureFrom(
        error,
        "SOURCE_COLLECTION_FAILED",
        "Live Commerce collection failed.",
      );
      const terminal = await wire.terminal(config, plan, {
        method: "POST",
        suffix: "/fail",
        body: failure,
      }, sourcePlanFrom);
      return { failure, terminal };
    }

    async function clearTerminalAttempt(environmentId, attemptId, tabId) {
      try {
        await removeTab(chromeApi, tabId);
      } finally {
        await sessions.remove(attemptId);
        await clearRequestIdentity(environmentId, attemptId);
      }
    }

    async function requireAttentionForRun(run, verificationUrl) {
      const reason = isCaptchaUrl(verificationUrl) ? "captcha" : "marketplace_login";
      const message = reason === "captcha"
        ? "방송 수집을 계속하려면 보안문자를 완료해주세요. 알림에서 확인 탭을 열 수 있습니다."
        : "방송 수집을 계속하려면 로그인해주세요. 알림에서 확인 탭을 열 수 있습니다.";
      await sessions.requireAttention(run.plan.attemptId, { reason, message });
      return {
        success: false,
        attemptId: run.plan.attemptId,
        terminalState: "RUNNING",
        attentionRequired: true,
        error: message,
        verificationUrl,
      };
    }

    async function execute(run) {
      let tabId = null;
      try {
        const tab = await createTab(chromeApi, run.plan.plan.pageUrl);
        tabId = tab.id;
        if (run.cancelRequested) {
          await removeTab(chromeApi, tabId);
          tabId = null;
          throw ownerError("COLLECTION_CANCELLED", "Collection cancelled");
        }
        run.tabId = tabId;
        if (Number.isInteger(tab.windowId)) {
          await sessions.attachTab(run.plan.attemptId, {
            tabId,
            windowId: tab.windowId,
            closeOnCancel: true,
          });
        }
        if (run.cancelRequested) throw ownerError("COLLECTION_CANCELLED", "Collection cancelled");
        await sessions.progress(run.plan.attemptId, {
          current: 0,
          total: 1,
          completed: 0,
          failed: 0,
          label: "라이브 방송 페이지 확인 중",
        });
        const navigated = await waitForNavigation(chromeApi, tabId, run.plan.plan.pageUrl);
        if (run.cancelRequested) throw ownerError("COLLECTION_CANCELLED", "Collection cancelled");
        if (navigated.verificationRequired) {
          run.keepTabOpen = true;
          return requireAttentionForRun(run, navigated.url);
        }

        let extracted = await triggerExtraction(chromeApi, tabId);
        if (run.cancelRequested) throw ownerError("COLLECTION_CANCELLED", "Collection cancelled");
        if (extracted?.error === "content_script_missing") {
          const injected = await ensureContentScripts(tabId);
          if (run.cancelRequested) throw ownerError("COLLECTION_CANCELLED", "Collection cancelled");
          if (!injected) throw new Error("라이브 수집 스크립트를 주입하지 못했습니다.");
          extracted = await triggerExtraction(chromeApi, tabId);
          if (run.cancelRequested) throw ownerError("COLLECTION_CANCELLED", "Collection cancelled");
        }
        if (!extracted?.ok) {
          if (extracted?.status === "verification_required") {
            run.keepTabOpen = true;
            return requireAttentionForRun(run, extracted.verificationUrl || navigated.url);
          }
          throw new Error(extracted?.error || "방송 정보를 찾지 못했습니다.");
        }
        if (run.cancelRequested) throw ownerError("COLLECTION_CANCELLED", "Collection cancelled");

        const terminal = await terminalSubmit(run.config, run.plan, {
          source: extracted.source,
          pageUrl: extracted.pageUrl,
          broadcast: extracted.broadcast,
          products: extracted.products,
        });
        if (!isTerminalState(terminal.state)) {
          throw ownerError("INVALID_LIVE_COMMERCE_TERMINAL", "Live Commerce owner did not terminalize the collection.");
        }
        const terminalTabId = run.tabId;
        run.tabId = null;
        await clearTerminalAttempt(run.environmentId, run.plan.attemptId, terminalTabId);
        return terminalResult(terminal);
      } catch (error) {
        if (run.cancelRequested && run.terminalResult) return run.terminalResult;
        const failure = failureFrom(error, "SOURCE_COLLECTION_FAILED", "Live Commerce collection failed.");
        try {
          const terminal = await terminalFail(run.config, run.plan, error);
          const terminalTabId = run.tabId;
          run.tabId = null;
          await clearTerminalAttempt(run.environmentId, run.plan.attemptId, terminalTabId);
          return terminalResult(terminal.terminal);
        } catch {
          return {
            success: false,
            attemptId: run.plan.attemptId,
            terminalState: "RUNNING",
            errorCode: failure.code,
            error: failure.message,
          };
        }
      } finally {
        if (!run.keepTabOpen) await removeTab(chromeApi, run.tabId);
      }
    }

    async function matchingSession(environmentId, idempotencyKey) {
      const sessionsForEnvironment = (await sessions.list(environmentId))
        .filter((session) => session?.producer === PRODUCER);
      for (const session of sessionsForEnvironment) {
        const correlation = await readRequestIdentity(environmentId, session.attemptId);
        if (correlation?.idempotencyKey === idempotencyKey) return { session, correlation };
      }
      return null;
    }

    async function resumeOrBegin(config, environmentId, input) {
      const existing = await matchingSession(environmentId, input.idempotencyKey);
      if (existing) {
        if (existing.session.attention) return { attention: existing.session };
        const observed = await readAttempt(config, existing.session.attemptId);
        return { plan: await begin(config, environmentId, {
          idempotencyKey: existing.correlation.idempotencyKey,
          url: observed.plan.pageUrl,
        }) };
      }
      if (typeof input.url !== "string") return null;
      return { plan: await begin(config, environmentId, input) };
    }

    function runKey(environmentId, idempotencyKey) {
      return `${environmentId}:${idempotencyKey}`;
    }

    function launch(key, work) {
      const active = { execution: null, run: null };
      active.execution = Promise.resolve()
        .then(() => work(active))
        .finally(() => {
          if (activeRuns.get(key) === active) activeRuns.delete(key);
        });
      activeRuns.set(key, active);
      return active.execution;
    }

    async function run(input) {
      const environmentId = requiredText(input?.environmentId, "INVALID_COLLECTION_ENVIRONMENT", 20);
      const idempotencyKey = requiredText(input?.idempotencyKey, "INVALID_IDEMPOTENCY_KEY");
      const key = runKey(environmentId, idempotencyKey);
      const active = activeRuns.get(key);
      if (active) return active.execution;
      return launch(key, async (running) => {
        const config = await getBackendRequestConfig(environmentId);
        if (!config?.ok) {
          return {
            success: false,
            terminalState: "RUNNING",
            error: config?.error || "KidItem 웹 앱에서 로그인 후 다시 시도해주세요.",
          };
        }
        const result = await resumeOrBegin(config, environmentId, {
          idempotencyKey,
          url: input?.url,
        });
        if (!result) {
          return {
            success: false,
            terminalState: "RUNNING",
            errorCode: "SOURCE_ATTEMPT_RECOVERY_IDENTITY_MISSING",
            error: "Live Commerce collection is still running and can only be retried after its fixed expiry.",
          };
        }
        if (result.attention) {
          return {
            success: false,
            attemptId: result.attention.attemptId,
            terminalState: "RUNNING",
            attentionRequired: true,
            error: result.attention.attention?.message || "Live Commerce collection requires attention.",
          };
        }
        if (result.plan.state !== "RUNNING") {
          await clearTerminalAttempt(environmentId, result.plan.attemptId, null);
          return terminalResult(result.plan);
        }
        const collectorRun = {
          config,
          environmentId,
          plan: result.plan,
          tabId: null,
          keepTabOpen: false,
          cancelRequested: false,
          terminalResult: null,
        };
        running.run = collectorRun;
        return execute(collectorRun);
      });
    }

    async function cancel(attemptId, environmentId) {
      const normalizedAttemptId = requiredText(attemptId, "INVALID_LIVE_COMMERCE_SOURCE_ATTEMPT");
      const normalizedEnvironmentId = requiredText(environmentId, "INVALID_COLLECTION_ENVIRONMENT", 20);
      const session = await sessions.getOwned(normalizedAttemptId, normalizedEnvironmentId);
      if (!session || session.producer !== PRODUCER) {
        return { success: true, cancelled: false, attemptId: normalizedAttemptId };
      }
      const active = [...activeRuns.values()].find((value) => value.run?.plan.attemptId === normalizedAttemptId);
      const collectorRun = active?.run || null;
      let plan = collectorRun?.plan || null;
      let config = collectorRun?.config || null;
      if (!plan || !config) {
        config = await getBackendRequestConfig(normalizedEnvironmentId);
        if (!config?.ok) {
          throw ownerError("SOURCE_OWNER_REQUEST_FAILED", config?.error || "Live Commerce owner is unavailable.");
        }
        const correlation = await readRequestIdentity(normalizedEnvironmentId, normalizedAttemptId);
        if (!correlation) {
          throw ownerError("SOURCE_ATTEMPT_RECOVERY_IDENTITY_MISSING", "Live Commerce attempt cannot be cancelled without its request identity.");
        }
        const observed = await readAttempt(config, normalizedAttemptId);
        plan = await begin(config, normalizedEnvironmentId, {
          idempotencyKey: correlation.idempotencyKey,
          url: observed.plan.pageUrl,
        });
      }
      if (plan.state !== "RUNNING") {
        await clearTerminalAttempt(normalizedEnvironmentId, normalizedAttemptId, collectorRun?.tabId ?? null);
        return { success: true, cancelled: false, attemptId: normalizedAttemptId };
      }
      if (collectorRun) collectorRun.cancelRequested = true;
      const terminal = await terminalFail(
        config,
        plan,
        ownerError("COLLECTION_CANCELLED", "Live Commerce collection was cancelled by the user."),
      );
      const result = terminalResult(terminal.terminal);
      if (collectorRun) {
        collectorRun.terminalResult = result;
        collectorRun.tabId = null;
      }
      await sessions.cancel(normalizedAttemptId, { closeManagedTab: true });
      await clearRequestIdentity(normalizedEnvironmentId, normalizedAttemptId);
      return { success: true, cancelled: true, attemptId: normalizedAttemptId };
    }

    async function recover(environmentId) {
      const normalizedEnvironmentId = requiredText(environmentId, "INVALID_COLLECTION_ENVIRONMENT", 20);
      const sessionsForEnvironment = (await sessions.list(normalizedEnvironmentId))
        .filter((session) => session?.producer === PRODUCER && !session.attention);
      return Promise.all(sessionsForEnvironment.map(async (session) => {
        const correlation = await readRequestIdentity(normalizedEnvironmentId, session.attemptId);
        if (!correlation) return null;
        return run({
          environmentId: normalizedEnvironmentId,
          idempotencyKey: correlation.idempotencyKey,
        });
      }));
    }

    return Object.freeze({ cancel, recover, run, validateLiveUrl });
  }

  function validateLiveUrl(urlValue) {
    if (typeof urlValue !== "string" || !urlValue.trim() || urlValue.length > 500) {
      return { ok: false, error: "1688 또는 도우인 방송 URL을 입력해주세요." };
    }
    try {
      const url = new URL(urlValue.trim());
      if (url.protocol !== "https:") return { ok: false, error: "HTTPS 방송 URL만 수집할 수 있습니다." };
      const host = url.hostname.toLowerCase();
      const source = host === "zb.1688.com" || host.endsWith(".zb.1688.com")
        ? "1688"
        : host === "live.douyin.com" || host.endsWith(".live.douyin.com")
          ? "douyin"
          : null;
      if (!source) return { ok: false, error: "1688 또는 도우인 방송 URL만 수집할 수 있습니다." };
      const normalized = url.toString();
      if (normalized.length > 500) {
        return { ok: false, error: "방송 URL이 너무 깁니다." };
      }
      return { ok: true, url: normalized, source };
    } catch (e) {
      return { ok: false, error: "방송 URL 형식이 올바르지 않습니다." };
    }
  }

  function createTab(chromeApi, url) {
    return new Promise((resolve, reject) => {
      chromeApi.tabs.create({ url, active: false }, (tab) => {
        const error = chromeApi.runtime.lastError;
        if (error || !tab?.id) {
          reject(new Error(error?.message || "방송 탭을 열 수 없습니다."));
          return;
        }
        resolve(tab);
      });
    });
  }

  function waitForNavigation(chromeApi, tabId, requestedUrl) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (result, error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        chromeApi.tabs.onUpdated.removeListener(listener);
        if (error) reject(error);
        else resolve(result);
      };
      const listener = (updatedTabId, changeInfo, tab) => {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
        const url = tab?.url || requestedUrl;
        finish({ url, verificationRequired: isVerificationUrl(url) });
      };
      const timer = setTimeout(() => finish(null, new Error("방송 페이지 로딩 시간이 초과되었습니다.")), NAVIGATION_TIMEOUT_MS);
      chromeApi.tabs.onUpdated.addListener(listener);
      chromeApi.tabs.get(tabId, (tab) => {
        if (tab?.status === "complete") {
          const url = tab.url || requestedUrl;
          finish({ url, verificationRequired: isVerificationUrl(url) });
        }
      });
    });
  }

  function triggerExtraction(chromeApi, tabId) {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          resolve({ ok: false, error: "방송 상품 추출 시간이 초과되었습니다." });
        }
      }, EXTRACTION_TIMEOUT_MS);
      chromeApi.tabs.sendMessage(tabId, { type: "TRIGGER_LIVE_COMMERCE_EXTRACT" }, (response) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (chromeApi.runtime.lastError) {
          resolve({ ok: false, error: "content_script_missing" });
          return;
        }
        resolve(response || { ok: false, error: "방송 페이지가 응답하지 않았습니다." });
      });
    });
  }

  function removeTab(chromeApi, tabId) {
    if (!tabId) return Promise.resolve();
    return new Promise((resolve) => {
      chromeApi.tabs.remove(tabId, () => {
        void chromeApi.runtime.lastError;
        resolve();
      });
    });
  }

  function isVerificationUrl(urlValue) {
    try {
      const url = new URL(urlValue);
      return url.pathname.includes("/punish")
        || url.searchParams.get("action") === "captcha"
        || /(?:verify|captcha|login)/i.test(url.pathname);
    } catch (e) {
      return false;
    }
  }

  function isCaptchaUrl(urlValue) {
    try {
      const url = new URL(urlValue);
      return url.pathname.includes("/punish")
        || url.searchParams.get("action") === "captcha"
        || /(?:verify|captcha)/i.test(url.pathname);
    } catch (e) {
      return false;
    }
  }


  global.ProductScraperLiveCommerce = Object.freeze({ create, validateLiveUrl });
})(globalThis);
