(function (global) {
  "use strict";

  function create({ chrome, backendRequestConfig, injectContentScripts, enrichProductData }) {
    const sourcePath = "/sourcing/extension/product-data/attempts";
    const wire = global.KidItemSourcingAttemptWire.create({ chrome, sourcePath, requestFailureMessage: "상품 수집 요청 실패" });
    const pending = new Map();
    const retrying = new Map();
    const correlationQueues = new Map();
    const correlationPrefix = "sourcing_product_attempt:";

    function normalizeCorrelation(value, allowLegacySourceUrl = false) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      if (typeof value.environmentId !== "string" || !value.environmentId.trim()) return null;
      if (typeof value.idempotencyKey !== "string" || !value.idempotencyKey.trim()) return null;
      if (value.attemptId !== null && (typeof value.attemptId !== "string" || !value.attemptId.trim())) return null;
      let sourceUrl;
      if (value.attemptId === null && value.sourceUrl !== undefined) {
        if (!allowLegacySourceUrl || typeof value.sourceUrl !== "string" || !value.sourceUrl.trim()) return null;
        try {
          global.KiditemSourcingUrlPolicy.parseAllowedSupplierUrl(value.sourceUrl);
          sourceUrl = value.sourceUrl.trim();
        } catch {
          return null;
        }
      }
      return {
        environmentId: value.environmentId.trim(),
        attemptId: value.attemptId || null,
        idempotencyKey: value.idempotencyKey.trim(),
        stopIntent: value.stopIntent === true,
        ...(sourceUrl ? { sourceUrl } : {}),
      };
    }

    function withCorrelationQueue(key, task) {
      const previous = correlationQueues.get(key) || Promise.resolve();
      const current = previous.catch(() => undefined).then(task);
      correlationQueues.set(key, current);
      return current.finally(() => {
        if (correlationQueues.get(key) === current) correlationQueues.delete(key);
      });
    }

    function normalizeStoredCorrelation(key, value) {
      const normalized = normalizeCorrelation(value, true);
      if (normalized || !value || typeof value !== "object" || !key.startsWith(correlationPrefix)) return normalized;
      const environmentId = key.slice(correlationPrefix.length).split(":", 1)[0];
      return normalizeCorrelation({
        ...value,
        environmentId,
        attemptId: value.attemptId ?? null,
      }, true);
    }

    async function currentCorrelation(key) {
      return normalizeStoredCorrelation(key, await wire.getCorrelation(key));
    }

    async function currentStoppedCorrelation(key, idempotencyKey) {
      const current = await currentCorrelation(key);
      return current?.idempotencyKey === idempotencyKey && current.stopIntent === true
        ? current : null;
    }

    async function mergeCorrelation(key, patch, expectedIdempotencyKey) {
      return withCorrelationQueue(key, async () => {
        const current = await currentCorrelation(key);
        const requestedKey = patch.idempotencyKey ?? current?.idempotencyKey;
        if (expectedIdempotencyKey !== undefined && current?.idempotencyKey !== expectedIdempotencyKey) return null;
        if (expectedIdempotencyKey === undefined && current && requestedKey !== current.idempotencyKey) return null;
        const attemptId = Object.prototype.hasOwnProperty.call(patch, "attemptId")
          ? patch.attemptId : current?.attemptId ?? null;
        const sourceUrl = attemptId === null
          ? (patch.sourceUrl ?? current?.sourceUrl)
          : undefined;
        const next = normalizeCorrelation({
          environmentId: patch.environmentId ?? current?.environmentId,
          attemptId,
          idempotencyKey: requestedKey,
          stopIntent: patch.stopIntent === true || current?.stopIntent === true,
          ...(sourceUrl ? { sourceUrl } : {}),
        }, true);
        if (!next) return null;
        await wire.setCorrelation(key, next);
        return next;
      });
    }

    async function clearCorrelation(key, expectedIdempotencyKey) {
      return withCorrelationQueue(key, async () => {
        const current = await currentCorrelation(key);
        if (!current || (expectedIdempotencyKey !== undefined && current.idempotencyKey !== expectedIdempotencyKey)) {
          return false;
        }
        await wire.clearCorrelation(key);
        return true;
      });
    }

    function readAllStorage() {
      return new Promise((resolve, reject) => {
        try {
          chrome.storage.local.get(null, (value) => {
            const error = chrome.runtime?.lastError;
            if (error) reject(error);
            else resolve(value || {});
          });
        } catch (error) {
          reject(error);
        }
      });
    }

    async function environmentCorrelations(environmentId) {
      const values = await readAllStorage();
      return Object.entries(values)
        .filter(([key, value]) => key.startsWith(correlationPrefix) &&
          key.includes(`:${environmentId}:`))
        .map(([key, value]) => ({ key, correlation: normalizeStoredCorrelation(key, value) }))
        .filter(({ correlation }) => correlation?.environmentId === environmentId);
    }

    async function stoppedCorrelations(environmentId) {
      return (await environmentCorrelations(environmentId))
        .filter(({ correlation }) => correlation.stopIntent === true);
    }

    async function readAttempt(config, attemptId) {
      return wire.requestJsonWithRetry(
        config,
        `${sourcePath}/${encodeURIComponent(attemptId)}`,
        { method: "GET", headers: config.headers },
      );
    }

    function isTerminal(state) {
      return state === "COMPLETE" || state === "FAILED" || state === "CANCELLED" || state === "EXPIRED";
    }

    function isKnownState(state) {
      return state === "RUNNING" || isTerminal(state);
    }

    function validAttemptId(value) {
      return typeof value?.attemptId === "string" && value.attemptId.trim();
    }

    async function reconcileStoppedCorrelation(config, key, correlation) {
      if (!correlation?.idempotencyKey || !(await currentStoppedCorrelation(key, correlation.idempotencyKey))) return true;
      let replayed;
      let expectedAttemptId = correlation.attemptId || null;
      if (!expectedAttemptId) {
        if (!correlation.sourceUrl) return false;
        replayed = await begin(config, correlation);
      } else {
        const current = await readAttempt(config, expectedAttemptId);
        if (!validAttemptId(current) || current.attemptId !== expectedAttemptId || !isKnownState(current.state)) {
          throw new Error("상품 추출 시도 상태를 확인할 수 없습니다.");
        }
        if (isTerminal(current.state)) {
          const cleared = await clearCorrelation(key, correlation.idempotencyKey);
          return cleared || !(await currentStoppedCorrelation(key, correlation.idempotencyKey));
        }
        const sourceUrl = current?.plan?.sourceUrl;
        try {
          global.KiditemSourcingUrlPolicy.parseAllowedSupplierUrl(sourceUrl);
        } catch {
          throw new Error("상품 추출 재조정 계획이 없습니다.");
        }
        replayed = await begin(config, { sourceUrl, idempotencyKey: correlation.idempotencyKey });
      }
      if (!(await currentStoppedCorrelation(key, correlation.idempotencyKey))) return true;
      if (!validAttemptId(replayed) || (expectedAttemptId && replayed.attemptId !== expectedAttemptId)) {
        throw new Error("상품 추출 시도 재생성이 올바르지 않습니다.");
      }
      expectedAttemptId = replayed.attemptId;
      if (!isKnownState(replayed.state)) {
        throw new Error("상품 추출 시도 재생성이 올바르지 않습니다.");
      }
      if (isTerminal(replayed.state)) {
        const cleared = await clearCorrelation(key, correlation.idempotencyKey);
        return cleared || !(await currentStoppedCorrelation(key, correlation.idempotencyKey));
      }
      if (replayed.state !== "RUNNING") throw new Error("상품 추출 시도 재생성이 올바르지 않습니다.");
      const merged = await mergeCorrelation(key, {
        environmentId: correlation.environmentId,
        attemptId: expectedAttemptId,
        idempotencyKey: correlation.idempotencyKey,
        stopIntent: true,
      }, correlation.idempotencyKey);
      if (!merged) return true;
      const failed = await wire.terminal(config, replayed, {
        method: "POST",
        suffix: "/fail",
        body: { code: "EXTRACTION_CANCELLED", message: "상품 추출이 취소되었습니다." },
      });
      if (!(await currentStoppedCorrelation(key, correlation.idempotencyKey))) return true;
      if (!validAttemptId(failed) || failed.attemptId !== expectedAttemptId || !isKnownState(failed.state)) {
        throw new Error("상품 추출 취소가 아직 완료되지 않았습니다.");
      }
      if (failed.state === "RUNNING") throw new Error("상품 추출 취소가 아직 완료되지 않았습니다.");
      const cleared = await clearCorrelation(key, correlation.idempotencyKey);
      return cleared || !(await currentStoppedCorrelation(key, correlation.idempotencyKey));
    }

    function finish(run, result) {
      clearTimeout(run.timer);
      run.closed = true;
      if (pending.get(run.tabId) === run) pending.delete(run.tabId);
      run.resolve(result);
    }

    async function reportFailure(run, code, message) {
      if (!run.attempt || run.attempt.state !== "RUNNING" || run.failureReported) return;
      if (run.failureReportTask) return run.failureReportTask;
      run.failureReportTask = (async () => {
        const result = await wire.terminal(run.config, run.attempt, {
          method: "POST", suffix: "/fail", body: { code, message },
        });
        if (!validAttemptId(result) || result.attemptId !== run.attempt.attemptId || !isKnownState(result.state) || result.state === "RUNNING") {
          throw new Error("상품 추출 실패 처리가 아직 완료되지 않았습니다.");
        }
        await clearCorrelation(run.key, run.idempotencyKey);
        run.failureReported = true;
      })();
      return run.failureReportTask;
    }

    function fail(run, code, message) {
      if (run.failure) return run.failure;
      if (run.closed) return;
      run.closed = true;
      clearTimeout(run.timer);
      run.failure = (async () => {
        try {
          if (run.idempotencyKey) {
            const stopPatch = { environmentId: run.environmentId, stopIntent: true };
            if (run.attempt?.attemptId) stopPatch.attemptId = run.attempt.attemptId;
            await mergeCorrelation(run.key, stopPatch, run.idempotencyKey);
          }
        } catch (error) {
          console.warn("[bg] product stop intent pending:", error.message);
        }
        try { await reportFailure(run, code, message); }
        catch (error) { console.warn("[bg] product failure report pending:", error.message); }
        finish(run, { ok: false, error: message });
      })();
      return run.failure;
    }

    function begin(config, correlation, run) {
      return wire.requestJsonWithRetry(config, sourcePath, { method: "POST",
        headers: { ...config.headers, "idempotency-key": correlation.idempotencyKey },
        body: JSON.stringify({ sourceUrl: correlation.sourceUrl }) }, (value) => value, run ? {
          shouldContinue: () => !run.closed,
          cancelCode: "EXTRACTION_CANCELLED",
          cancelMessage: "상품 추출이 취소되었습니다.",
        } : undefined);
    }

    async function start(run) {
      try {
        if (run.closed) return;
        run.config = await backendRequestConfig(run.environmentId);
        if (!run.config.ok) throw new Error(run.config.error);
        if (run.closed) return;
        const tab = await chrome.tabs.get(run.tabId);
        if (run.closed) return;
        global.KiditemSourcingUrlPolicy.parseAllowedSupplierUrl(tab.url);
        const sourceUrl = tab.url;
        const previous = await wire.getCorrelation(run.key);
        if (run.closed) return;
        const previousCorrelation = normalizeCorrelation(previous, true) ||
          normalizeCorrelation({
            ...previous,
            environmentId: run.environmentId,
            attemptId: typeof previous?.attemptId === "string" ? previous.attemptId : null,
            stopIntent: true,
          }, true);
        if (previousCorrelation) {
          const marked = await mergeCorrelation(run.key, {
            ...previousCorrelation,
            stopIntent: true,
          }, previousCorrelation.idempotencyKey);
          if (!marked) throw new Error("이전 상품 추출이 새로운 시도로 교체되었습니다.");
          const reconciled = await reconcileStoppedCorrelation(
            run.config,
            run.key,
            marked,
          );
          if (!reconciled) throw new Error("이전 상품 추출을 재조정할 수 없습니다.");
        }
        if (run.closed) return;
        const correlation = {
          environmentId: run.environmentId,
          attemptId: null,
          idempotencyKey: global.crypto.randomUUID(),
          stopIntent: false,
          sourceUrl,
        };
        run.idempotencyKey = correlation.idempotencyKey;
        if (!await mergeCorrelation(run.key, correlation)) {
          throw new Error("상품 추출 시도 상관관계를 저장할 수 없습니다.");
        }
        if (run.closed) return;
        run.attempt = await begin(run.config, correlation, run);
        if (!validAttemptId(run.attempt) || !isKnownState(run.attempt.state)) {
          throw new Error("상품 추출 시도 응답이 올바르지 않습니다.");
        }
        if (!await mergeCorrelation(run.key, {
          environmentId: run.environmentId,
          attemptId: run.attempt.attemptId,
          idempotencyKey: correlation.idempotencyKey,
        }, correlation.idempotencyKey)) {
          if (run.closed) return;
          throw new Error("상품 추출 시도 상관관계가 교체되었습니다.");
        }
        if (run.closed) {
          try {
            if (run.attempt.state === "RUNNING") {
              await reportFailure(run, "EXTRACTION_CANCELLED", "상품 추출이 취소되었습니다.");
            } else if (isTerminal(run.attempt.state)) await clearCorrelation(run.key, correlation.idempotencyKey);
          } catch (error) { console.warn("[bg] product cancellation report pending:", error.message); }
          return;
        }
        if (run.attempt.state !== "RUNNING") throw new Error("상품 추출 시도가 종료되었습니다.");
        run.timer = setTimeout(() => fail(run, "EXTRACTION_TIMEOUT", "추출 시간 초과 (20초)"), 20000);
        const trigger = { type: "TRIGGER_EXTRACT", attemptId: run.attempt.attemptId };
        chrome.tabs.sendMessage(run.tabId, trigger, () => {
          if (!chrome.runtime.lastError || run.closed) return;
          injectContentScripts(run.tabId).then((ok) => {
            if (run.closed) return;
            if (!ok) return fail(run, "EXTRACTION_INJECTION_FAILED", "콘텐츠 스크립트 주입 실패. 페이지를 새로고침 해주세요.");
            chrome.tabs.sendMessage(run.tabId, trigger, () => {
              if (chrome.runtime.lastError) fail(run, "EXTRACTION_UNAVAILABLE", "페이지를 새로고침 후 다시 시도해주세요.");
            });
          });
        });
      } catch (error) { await fail(run, "EXTRACTION_START_FAILED", error.message); }
    }

    function collect(tabId, environmentId) {
      const previous = pending.get(tabId);
      return new Promise((resolve) => {
        const run = { tabId, environmentId, resolve, key: `sourcing_product_attempt:${environmentId}:${tabId}` };
        pending.set(tabId, run);
        run.startTask = Promise.resolve(previous ? fail(previous, "EXTRACTION_CANCELLED", "cancelled") : undefined)
          .then(() => previous?.startTask).then(() => start(run));
      });
    }

    async function complete(run, hadDescription) {
      if (run.completing || run.closed) return;
      run.completing = true;
      try {
        const product = await run.product;
        if (run.closed) return;
        if (!product || Boolean(run.description) !== hadDescription) throw new Error("상품 설명 추출 완료를 확인할 수 없습니다.");
        if (run.closed) return;
        clearTimeout(run.timer);
        const body = { product, ...(run.description ? { description: run.description } : {}), hadDescription };
        const result = await wire.terminal(run.config, run.attempt, { method: "PUT", suffix: "/complete", body },
          (value) => value, {
            shouldContinue: () => !run.closed,
            cancelCode: "EXTRACTION_CANCELLED",
            cancelMessage: "상품 추출이 취소되었습니다.",
          });
        if (run.closed) return;
        if (!validAttemptId(result) || result.attemptId !== run.attempt.attemptId || !isKnownState(result.state) || result.state !== "COMPLETE") {
          throw new Error(result?.errorMessage || "상품 수집 실패");
        }
        await clearCorrelation(run.key, run.idempotencyKey);
        finish(run, { ok: true });
      } catch (error) { await fail(run, "EXTRACTION_FAILED", error.message); }
    }

    function onEvent(message, sender) {
      const run = pending.get(sender.tab?.id);
      if (!run || run.closed || !run.attempt || message.attemptId !== run.attempt.attemptId) {
        return { ok: false, error: "수집 환경 또는 시도를 확인할 수 없습니다." };
      }
      if (message.type === "PRODUCT_DATA") {
        if (!run.product) {
          run.product = enrichProductData(message.data);
          if (message.data?.page_type === "search") complete(run, false);
        }
      } else if (message.type === "DESCRIPTION_DATA") {
        if (!run.completing) run.description = message.data;
      } else if (message.type === "EXTRACTION_COMPLETE") complete(run, message.hadDescription);
      return { ok: true };
    }

    async function cancelEnvironment(environmentId) {
      const runs = [...pending.values()].filter((run) => run.environmentId === environmentId);
      await Promise.all(runs.map((run) => fail(
        run,
        "EXTRACTION_CANCELLED",
        "상품 추출이 취소되었습니다.",
      )));
      let entries;
      try {
        entries = await environmentCorrelations(environmentId);
      } catch {
        return false;
      }
      if (entries.length === 0) return true;
      const fenced = [];
      let settled = true;
      for (const { key, correlation } of entries) {
        try {
          const current = await currentCorrelation(key);
          if (!current || current.idempotencyKey !== correlation.idempotencyKey) continue;
          const marked = current.stopIntent ? current : await mergeCorrelation(key, {
            environmentId,
            stopIntent: true,
          }, correlation.idempotencyKey);
          if (!marked) continue;
          fenced.push({ key, correlation: marked });
        } catch (error) {
          settled = false;
          console.warn("[bg] product stop intent pending:", error.message);
        }
      }
      if (fenced.length === 0) return settled;
      let config;
      try {
        config = await backendRequestConfig(environmentId);
        if (!config?.ok) return false;
      } catch {
        return false;
      }
      for (const { key, correlation } of fenced) {
        try {
          if (!(await reconcileStoppedCorrelation(config, key, correlation))) settled = false;
        } catch (error) {
          settled = false;
          console.warn("[bg] product cancellation reconciliation pending:", error.message);
        }
      }
      return settled;
    }

    async function retryAdditionalCollections(environmentId) {
      const existing = retrying.get(environmentId);
      if (existing) return existing;
      const retry = (async () => {
        let entries;
        try {
          entries = await stoppedCorrelations(environmentId);
        } catch {
          return false;
        }
        if (entries.length === 0) return true;
        let config;
        try {
          config = await backendRequestConfig(environmentId);
          if (!config?.ok) return false;
        } catch {
          return false;
        }
        let settled = true;
        for (const { key, correlation } of entries) {
          try {
            if (!(await reconcileStoppedCorrelation(config, key, correlation))) settled = false;
          } catch (error) {
            settled = false;
            console.warn("[bg] product cancellation reconciliation pending:", error.message);
          }
        }
        return settled;
      })();
      retrying.set(environmentId, retry);
      retry.finally(() => {
        if (retrying.get(environmentId) === retry) retrying.delete(environmentId);
      }).catch(() => undefined);
      return retry;
    }

    chrome.tabs.onRemoved?.addListener((tabId) => {
      const run = pending.get(tabId);
      if (run) fail(run, "EXTRACTION_TAB_CLOSED", "상품 수집 탭이 닫혔습니다.");
    });
    return Object.freeze({ cancelEnvironment, collect, onEvent, retryAdditionalCollections });
  }

  global.KidItemProductExtensionCollector = Object.freeze({ create });
})(globalThis);
