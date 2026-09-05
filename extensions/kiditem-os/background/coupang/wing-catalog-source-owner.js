const sourcingWingCatalogActive = new Map();
const sourcingWingCatalogPending = new Map();
const sourcingWingCatalogSourcePath = "/api/sourcing/workspace/wing-catalog/attempts";

function parseSourcingWingCatalogStart(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)
    || message.action !== "collectSourcingWingCatalog"
    || Object.keys(message).some((key) => !["action", "idempotencyKey", "keywords", "maxPages", "purpose"].includes(key))
    || typeof message.idempotencyKey !== "string" || !message.idempotencyKey.trim()
    || message.idempotencyKey.length > 300) throw new Error("wing_catalog_source_input_invalid");
  return { idempotencyKey: message.idempotencyKey.trim(), input: parseSourcingWingCatalogInput({
    keywords: message.keywords, maxPages: message.maxPages, purpose: message.purpose,
  }) };
}

async function runSourcingWingCatalog({ environmentId, idempotencyKey, input, cancelRequested = false }) {
  sharedEnvironmentContext.requireEnvironment(environmentId);
  input = parseSourcingWingCatalogInput(input);
  const fingerprint = JSON.stringify(input);
  const active = sourcingWingCatalogActive.get(environmentId);
  if (active) {
    if (active.idempotencyKey !== idempotencyKey) throw new Error("SOURCE_ATTEMPT_ALREADY_RUNNING");
    if (active.fingerprint !== fingerprint) throw new Error("SOURCE_IDEMPOTENCY_KEY_REUSED");
    return cancelRequested && active.cancel ? active.cancel() : active.promise;
  }
  const running = { idempotencyKey, fingerprint };
  sourcingWingCatalogActive.set(environmentId, running);
  running.promise = executeSourcingWingCatalog({ environmentId, idempotencyKey, input, cancelRequested, running });
  try { return await running.promise; }
  catch (error) {
    if (error?.status === 409 && running.fenceCleanup) await running.fenceCleanup();
    throw error;
  }
  finally { sourcingWingCatalogActive.delete(environmentId); }
}

async function executeSourcingWingCatalog({ environmentId, idempotencyKey, input, cancelRequested, running }) {
  const wire = KidItemSourcingAttemptWire.create({ chrome, sourcePath: sourcingWingCatalogSourcePath,
    requestFailureMessage: "Wing source owner request failed" });
  const config = { apiBase: "", headers: { "Content-Type": "application/json" },
    request: (path, init) => authedFetch(environmentId, path, init) };
  const attempt = await wire.requestJson(config, sourcingWingCatalogSourcePath, { method: "POST",
    headers: { ...config.headers, "idempotency-key": idempotencyKey }, body: JSON.stringify(input) });
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let plan;
  try {
    if (!uuid.test(attempt?.attemptId) || !uuid.test(attempt?.attemptToken)
      || attempt.sourceKey !== "coupang.wing_catalog" || attempt.scopeKey !== "default"
      || attempt.targetKey !== "catalog" || attempt.plan?.source !== "coupang.wing_catalog"
      || !["RUNNING", "COMPLETE", "FAILED"].includes(attempt.state)) throw new Error();
    const { source: _source, ...frozen } = attempt.plan;
    plan = parseSourcingWingCatalogInput(frozen);
    if (JSON.stringify(plan) !== JSON.stringify(input)) throw new Error();
  } catch { throw new Error("SOURCE_PLAN_INVALID"); }
  const key = `kiditem_wing_catalog_attempt_v1:${environmentId}:${attempt.attemptId}`;
  const publicStatus = (value) => {
    if (value?.attemptId !== attempt.attemptId || value.sourceKey !== "coupang.wing_catalog"
      || !["COMPLETE", "FAILED"].includes(value.state)) throw new Error("SOURCE_TERMINAL_INVALID");
    return { success: value.state === "COMPLETE", attemptId: value.attemptId, state: value.state,
      errorCode: value.errorCode || null, errorMessage: value.errorMessage || null };
  };
  const cleanup = async (value) => {
    const result = publicStatus(value);
    sourcingWingCatalogPending.delete(key);
    await wire.clearCorrelation(key);
    const session = await collectionSessions.getOwned(attempt.attemptId, environmentId);
    if (session && !session.attention) await collectionSessions.cancel(attempt.attemptId, { closeManagedTab: true });
    return result;
  };
  if (attempt.state !== "RUNNING") return cleanup(attempt);
  if (!Number.isFinite(Date.parse(attempt.expiresAt)) || Date.parse(attempt.expiresAt) <= Date.now()) {
    throw new Error("SOURCE_ATTEMPT_EXPIRED");
  }
  const previous = await wire.getCorrelation(key);
  let work = sourcingWingCatalogPending.get(key);
  if (work) work.cancellation = null;
  if (!work) {
    work = { results: [], receipts: [], signal: new AbortController() };
    if (previous) work.terminal = { method: "POST", suffix: "/fail", body: {
      code: "SOURCE_COLLECTION_INTERRUPTED", message: "Wing catalog collection was interrupted. Start a new attempt.",
    } };
    sourcingWingCatalogPending.set(key, work);
  }
  await wire.setCorrelation(key, { attemptId: attempt.attemptId, idempotencyKey });
  running.fenceCleanup = async () => {
    work.signal.abort(new Error("ATTEMPT_FENCE_LOST"));
    sourcingWingCatalogPending.delete(key);
    await collectionSessions.cancel(attempt.attemptId, { closeManagedTab: true });
  };
  running.cancel = () => {
    if (work.cancellation) return work.cancellation;
    work.terminal = { method: "POST", suffix: "/fail", body: {
      code: "COLLECTION_CANCELLED", message: "Wing catalog collection was cancelled by the user.",
    } };
    work.signal.abort(new Error("COLLECTION_CANCELLED"));
    work.cancellation = wire.terminal(config, attempt, work.terminal).then(async (result) => {
      return cleanup(result);
    });
    return work.cancellation;
  };
  if (cancelRequested) return running.cancel();
  if (!work.terminal) {
    await collectionSessions.start({ attemptId: attempt.attemptId, environmentId, producer: "sourcing.wing_catalog" });
    for (let index = work.results.length; index < plan.keywords.length; index += 1) {
      const keyword = plan.keywords[index];
      if (work.cancellation) return work.cancellation;
      if (!work.chunk) {
        let search;
        try {
          search = await searchWingCatalogProducts({ keyword, maxPages: plan.maxPages,
            collectionRunId: attempt.attemptId, environmentId, signal: work.signal.signal,
            ...(Number.isInteger(work.tabId) ? { collectionTabId: work.tabId } : {}) });
        } catch (error) {
          if (work.cancellation) return work.cancellation;
          search = null;
        }
        if (work.cancellation) return work.cancellation;
        if (Number.isInteger(search?.tabId)) work.tabId = search.tabId;
        if (search?.attentionRequired) {
          work.terminal = { method: "POST", suffix: "/fail", body: { code: "marketplace_login",
            message: "Coupang login is required before starting a new Wing catalog attempt." } };
          break;
        }
        if (!search?.success) {
          work.results.push({ keyword, outcome: "failed", discovered: 0, accepted: 0, duplicate: 0,
            failed: 1, errorCode: "wing_catalog_keyword_failed" });
          continue;
        }
        const capturedAt = new Date().toISOString();
        // Extraction still returns its original rows; only owner publication
        // distinguishes an interrupted page from fulfilled bounded coverage.
        work.incomplete = ["authentication_token_missing", "non_json_response"].includes(search.stopReason)
          || (search.stopReason === "next_page_not_advancing" && (search.pages?.length || 0) < plan.maxPages);
        const rows = Array.isArray(search.rows) ? search.rows.slice(0, SOURCING_WING_CATALOG_MAX_ITEMS) : [];
        work.chunk = { keyword, maxPages: plan.maxPages, purpose: plan.purpose,
          items: rows.filter((row) => row && row.productId != null && row.productName)
            .map((row) => toSourcingWingCatalogObservation(row, keyword, capturedAt)) };
      }
      const receipt = await wire.terminal(config, attempt, { method: "POST", suffix: "/chunks", body: work.chunk }, (value) => {
        if (value?.sequence !== index || value.keyword !== keyword || value.count !== work.chunk.items.length
          || !/^[a-f0-9]{64}$/.test(value.checksum) || !Number.isInteger(value.duplicateCount)
          || value.duplicateCount < 0 || value.duplicateCount > value.count) throw new Error("SOURCE_RECEIPT_INVALID");
        return value;
      });
      if (work.cancellation) return work.cancellation;
      work.receipts.push(receipt);
      work.results.push({ keyword, outcome: work.incomplete ? "failed" : receipt.count > receipt.duplicateCount ? "complete" : "no_change",
        discovered: receipt.count, accepted: receipt.count - receipt.duplicateCount,
        duplicate: receipt.duplicateCount, failed: work.incomplete ? 1 : 0,
        ...(work.incomplete ? { errorCode: "wing_catalog_incomplete_coverage" } : {}) });
      work.chunk = null;
      await collectionSessions.progress(attempt.attemptId, { current: index + 1, total: plan.keywords.length,
        completed: work.results.filter((result) => !result.failed).length,
        failed: work.results.filter((result) => result.failed).length, label: keyword });
    }
    work.terminal ||= { method: "PUT", suffix: "", body: {
      purpose: plan.purpose, keywords: work.results, receipts: work.receipts,
    } };
  }
  if (work.cancellation) return work.cancellation;
  return cleanup(await wire.terminal(config, attempt, work.terminal));
}

async function cancelSourcingWingCatalog(attemptId, environmentId) {
  sharedEnvironmentContext.requireEnvironment(environmentId);
  const wire = KidItemSourcingAttemptWire.create({ chrome, sourcePath: sourcingWingCatalogSourcePath,
    requestFailureMessage: "Wing source owner request failed" });
  const key = `kiditem_wing_catalog_attempt_v1:${environmentId}:${attemptId}`;
  const correlation = await wire.getCorrelation(key);
  const current = await wire.requestJson({ apiBase: "", request: (path, init) => authedFetch(environmentId, path, init) },
    `${sourcingWingCatalogSourcePath}/${encodeURIComponent(attemptId)}`, { method: "GET" });
  if (current?.attemptId !== attemptId || current.sourceKey !== "coupang.wing_catalog"
    || current.scopeKey !== "default" || current.targetKey !== "catalog") throw new Error("SOURCE_PLAN_INVALID");
  if (["COMPLETE", "FAILED"].includes(current.state)) {
    await wire.clearCorrelation(key);
    return collectionSessions.cancel(attemptId, { closeManagedTab: true });
  }
  if (correlation?.attemptId !== attemptId || !correlation.idempotencyKey) throw new Error("SOURCE_ATTEMPT_RECOVERY_IDENTITY_MISSING");
  const { source: _source, ...input } = current.plan || {};
  await runSourcingWingCatalog({ environmentId, idempotencyKey: correlation.idempotencyKey, input, cancelRequested: true });
  return collectionSessions.cancel(attemptId, { closeManagedTab: true });
}
