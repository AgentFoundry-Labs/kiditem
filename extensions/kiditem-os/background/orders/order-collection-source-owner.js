(function installOrderCollectionSourceOwner(root) {
  "use strict";

  const SOURCE_PATH = "/api/orders/collection/attempts";
  const PRODUCER = "orders.mall";
  const PARSER_VERSION = "order-collection-v1";
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const PENDING_STORAGE_PREFIX = "orderCollectionPendingSubmissionV1";
  const LOCAL_CONVERSION_CODES = new Set([
    "UNSUPPORTED_CONVERSION",
    "CAPTURE_INVALID",
    "NO_NEW_ORDERS",
  ]);

  function validUuid(value) {
    return typeof value === "string" && UUID.test(value);
  }

  function validDate(value) {
    if (value === null) return true;
    if (typeof value !== "string" || !DATE.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day;
  }

  function boundedText(value, fallback, maximum = 300) {
    if (typeof value !== "string") return fallback;
    const text = value.trim();
    return text && text.length <= maximum ? text : fallback;
  }

  function parseAttempt(value, attemptId, requireToken) {
    const plan = value?.plan;
    if (
      value?.attemptId !== attemptId ||
      (requireToken && !validUuid(value?.attemptToken)) ||
      (!requireToken &&
        value?.attemptToken !== undefined &&
        value?.attemptToken !== null &&
        !validUuid(value.attemptToken)) ||
      !validUuid(value?.sourceImportRunId) ||
      !["RUNNING", "COMPLETE", "FAILED"].includes(value?.state) ||
      plan?.sourceType !== "order_collection_mall" ||
      plan?.parserVersion !== PARSER_VERSION ||
      typeof plan?.mallKey !== "string" ||
      !plan.mallKey.trim() ||
      typeof plan?.mallName !== "string" ||
      !plan.mallName.trim() ||
      !validUuid(plan?.channelAccountId) ||
      !validDate(plan?.collectionDate) ||
      !["browser", "manual-upload"].includes(plan?.collectionMode) ||
      (value?.expiresAt !== null &&
        !Number.isFinite(Date.parse(value?.expiresAt || ""))) ||
      (value?.artifactId !== null && !validUuid(value?.artifactId)) ||
      !validDate(value?.coverageStartDate) ||
      !validDate(value?.coverageEndDate) ||
      ((value?.coverageStartDate === null) !== (value?.coverageEndDate === null)) ||
      (value?.errorCode !== null && typeof value?.errorCode !== "string") ||
      (value?.errorMessage !== null && typeof value?.errorMessage !== "string") ||
      (plan?.selectionMode !== undefined &&
        plan.selectionMode !== "manual" && plan.selectionMode !== "automatic") ||
      (plan?.seenRowKeys !== undefined &&
        (!Array.isArray(plan.seenRowKeys) ||
          plan.seenRowKeys.length > 8000 ||
          plan.seenRowKeys.some((key) => typeof key !== "string" || key.length > 2000))) ||
      (plan?.selectionMode === "automatic" && !Array.isArray(plan.seenRowKeys))
    ) {
      throw new Error("ORDER_COLLECTION_PLAN_INVALID");
    }
    if (
      value.state === "RUNNING" &&
      (!value.expiresAt || Date.parse(value.expiresAt) <= Date.now())
    ) {
      throw new Error("ATTEMPT_EXPIRED");
    }
    return value;
  }

  function parseControl(value, attemptId) {
    return parseAttempt(value, attemptId, true);
  }

  function resultFor(attempt, extra = {}) {
    return {
      success: attempt?.state === "COMPLETE",
      attemptId: attempt?.attemptId,
      terminalState: attempt?.state,
      ...(attempt?.state === "FAILED" && attempt.errorCode
        ? { errorCode: attempt.errorCode }
        : {}),
      ...(attempt?.state === "FAILED" && attempt.errorMessage
        ? { error: attempt.errorMessage }
        : {}),
      ...extra,
    };
  }

  function scalarConversionReceipt(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const allowed = [
      "success",
      "artifactId",
      "fileName",
      "sourceRows",
      "productRows",
      "outputRows",
      "skippedRows",
    ];
    const receipt = {};
    for (const key of allowed) {
      const field = value[key];
      if (
        typeof field === "string" ||
        typeof field === "number" ||
        typeof field === "boolean" ||
        field === null
      ) {
        receipt[key] = field;
      }
    }
    return receipt;
  }

  function submissionIsUncertain(error) {
    if (error?.conversionTransport === true) {
      return true;
    }
    if (error?.conversionLocal === true || error?.conversionTransport === false ||
      LOCAL_CONVERSION_CODES.has(error?.code)) {
      return false;
    }
    return error?.status === undefined || error?.status === 0;
  }

  function pendingRecord(value) {
    if (
      !value ||
      value.version !== 1 ||
      !validUuid(value?.attempt?.attemptId) ||
      typeof value?.attempt?.environmentId !== "string" ||
      !value.plan ||
      typeof value.plan !== "object" ||
      !Object.prototype.hasOwnProperty.call(value, "capture")
    ) {
      return null;
    }
    return {
      capture: value.capture,
      plan: value.plan,
      attempt: {
        attemptId: value.attempt.attemptId,
        environmentId: value.attempt.environmentId,
      },
    };
  }

  // Server-owned captures can be large (and can contain provider personal
  // data). They are sent to the fenced owner only; never echo the retained
  // evidence back through the external page-message response.
  function publicResult(value, serverOwned) {
    if (!serverOwned || !value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }
    const safe = {};
    // Keep only the owner receipt and bounded operator-action metadata. In
    // particular, do not spread arbitrary collector fields such as `rows`,
    // `orders`, `xlsxBase64`, or HTML into the page response.
    for (const key of [
      "success",
      "attemptId",
      "terminalState",
      "continuationRequired",
      "pendingLogin",
      "pendingAuth",
      "errorCode",
      "error",
      "ownerReconciliation",
      "cancelled",
    ]) {
      if (Object.prototype.hasOwnProperty.call(value, key)) safe[key] = value[key];
    }
    if (value.failure && typeof value.failure === "object" && !Array.isArray(value.failure)) {
      safe.failure = value.failure;
    }
    if (value.conversion && typeof value.conversion === "object") {
      safe.conversion = scalarConversionReceipt(value.conversion);
    }
    return safe;
  }

  function unavailable(attemptId, error) {
    return {
      success: false,
      attemptId,
      terminalState: "RUNNING",
      continuationRequired: false,
      errorCode: "SOURCE_OWNER_UNAVAILABLE",
      error: boundedText(
        error?.message,
        "주문 수집 서버 상태를 확인하지 못했습니다.",
      ),
    };
  }

  function messageAttemptId(message) {
    const attemptId = message?.attemptId;
    const runId = message?.runId;
    if (attemptId !== undefined && !validUuid(attemptId)) return null;
    if (runId !== undefined && !validUuid(runId)) return null;
    if (attemptId && runId && attemptId !== runId) return null;
    return attemptId || runId || null;
  }

  function create(options) {
    const sessions = options.sessions;
    const lifecycle = options.lifecycle;
    const active = new Map();
    // Keep an ambiguous conversion input in session storage as well as the
    // service-worker map. Chrome may restart the worker while the owner is
    // still RUNNING; the exact capture/plan/fence must survive that restart
    // so a retry never visits the marketplace again.
    const pendingSubmissions = new Map();
    const pendingStorage =
      options.chrome?.storage?.session &&
      typeof options.chrome.storage.session.get === "function" &&
      typeof options.chrome.storage.session.set === "function" &&
      typeof options.chrome.storage.session.remove === "function"
        ? options.chrome.storage.session
        : options.chrome?.storage?.local &&
            typeof options.chrome.storage.local.get === "function" &&
            typeof options.chrome.storage.local.set === "function" &&
            typeof options.chrome.storage.local.remove === "function"
          ? options.chrome.storage.local
          : null;
    const wire = root.KidItemSourcingAttemptWire.create({
      chrome: options.chrome,
      sourcePath: SOURCE_PATH,
      requestFailureMessage: "주문 수집 서버 상태를 확인하지 못했습니다",
    });

    async function isLocallyActive(attemptId, environmentId) {
      if (typeof sessions.getOwned === "function") {
        let session;
        try {
          session = await sessions.getOwned(attemptId, environmentId);
        } catch {
          return false;
        }
        if (!session || session.producer !== PRODUCER) return false;
      } else if (typeof sessions.isActive !== "function") {
        return true;
      }
      if (typeof sessions.isActive !== "function") return true;
      try {
        return (await sessions.isActive(attemptId, environmentId, PRODUCER)) !== false;
      } catch {
        return false;
      }
    }

    function config(environmentId) {
      return {
        apiBase: "",
        headers: { "Content-Type": "application/json" },
        request: (path, init) => options.request(environmentId, path, init),
      };
    }

    function pendingStorageKey(key) {
      return `${PENDING_STORAGE_PREFIX}:${encodeURIComponent(key)}`;
    }

    async function readPending(key) {
      const inMemory = pendingSubmissions.get(key);
      if (inMemory) return inMemory;
      if (!pendingStorage) return null;
      try {
        const storageKey = pendingStorageKey(key);
        const stored = (await pendingStorage.get(storageKey))?.[storageKey];
        const pending = pendingRecord(stored);
        if (!pending) {
          if (stored) await pendingStorage.remove(storageKey);
          return null;
        }
        pendingSubmissions.set(key, pending);
        return pending;
      } catch (error) {
        // A missing durable record is different from an unreadable store. Do
        // not recollect from the marketplace while the exact prior capture
        // may still be present but inaccessible after a worker restart.
        const unavailable = new Error(
          boundedText(
            error?.message,
            "주문 수집 변환 재시도 정보를 확인하지 못했습니다.",
          ),
        );
        unavailable.code = "PENDING_SUBMISSION_STORAGE_UNAVAILABLE";
        throw unavailable;
      }
    }

    async function rememberPending(key, pending) {
      if (!pendingStorage) {
        const unavailable = new Error("주문 수집 변환 재시도 저장소를 사용할 수 없습니다.");
        unavailable.code = "PENDING_SUBMISSION_STORAGE_UNAVAILABLE";
        // Retain the exact capture for a same-worker retry, but do not let
        // readPending authorize dispatch until the durable write succeeds.
        pendingSubmissions.set(key, pending);
        throw unavailable;
      }
      const storageKey = pendingStorageKey(key);
      // Retain the exact capture before the write so a same-worker retry can
      // retry persistence without recollecting. readPending is only an
      // in-memory lookup; every pending replay below calls rememberPending
      // again before dispatching conversion.
      pendingSubmissions.set(key, pending);
      await pendingStorage.set({
        [storageKey]: {
          version: 1,
          capture: pending.capture,
          plan: pending.plan,
          attempt: {
            attemptId: pending.attempt.attemptId,
            environmentId: pending.attempt.environmentId,
          },
          updatedAt: Date.now(),
        },
      });
    }

    async function forgetPending(key) {
      pendingSubmissions.delete(key);
      if (!pendingStorage) return;
      try {
        await pendingStorage.remove(pendingStorageKey(key));
      } catch {
        // A terminal owner projection is still authoritative even if local
        // cleanup is delayed until the next worker read.
      }
    }

    async function read(environmentId, attemptId) {
      return wire.requestJsonWithRetry(
        config(environmentId),
        `${SOURCE_PATH}/${encodeURIComponent(attemptId)}/control`,
        { method: "GET" },
        (value) => parseControl(value, attemptId),
      );
    }

    async function cleanup(environmentId, attempt) {
      if (attempt.state === "RUNNING") return;
      const session = await sessions.getOwned(attempt.attemptId, environmentId);
      if (!session || session.attention) return;
      try {
        await sessions.cancel(attempt.attemptId, { closeManagedTab: true });
      } catch {
        // The server owner is authoritative; keep the persisted local session
        // if Chrome cannot close its managed tab yet.
      }
    }

    async function finish(environmentId, attempt, extra = {}) {
      await cleanup(environmentId, attempt);
      return resultFor(attempt, extra);
    }

    function failureBody(result) {
      const body = wire.failure(
        {
          code: result?.errorCode || result?.failure?.code,
          message: result?.error || result?.message,
        },
        "order_collection_failed",
        "주문 수집에 실패했습니다.",
      );
      if (result && Object.prototype.hasOwnProperty.call(result, "sourcePayload")) {
        body.sourcePayload = result.sourcePayload;
      }
      return body;
    }

    async function fail(environmentId, attempt, body, allowUnstarted = false) {
      if (
        !allowUnstarted &&
        !(await isLocallyActive(attempt.attemptId, environmentId)) &&
        body?.code !== "COLLECTION_CANCELLED"
      ) {
        return {
          success: false,
          attemptId: attempt.attemptId,
          terminalState: "RUNNING",
          continuationRequired: false,
          errorCode: "COLLECTION_CANCELLED",
          error: "Order collection was cancelled",
        };
      }
      let directError = null;
      try {
        await wire.terminal(
          config(environmentId),
          attempt,
          { method: "POST", suffix: "/fail", body },
          (value) => parseAttempt(value, attempt.attemptId, false),
          body?.code === "COLLECTION_CANCELLED"
            ? {}
            : {
                shouldContinue: () =>
                  allowUnstarted ||
                  isLocallyActive(attempt.attemptId, environmentId),
                cancelCode: "COLLECTION_CANCELLED",
                cancelMessage: "주문 수집이 취소되었습니다.",
              },
        );
      } catch (error) {
        directError = error;
      }

      let observed;
      try {
        observed = await read(environmentId, attempt.attemptId);
      } catch (error) {
        return unavailable(attempt.attemptId, directError || error);
      }

      if (
        observed.state === "FAILED" &&
        observed.errorCode === body.code &&
        observed.errorMessage === body.message
      ) {
        return finish(environmentId, observed);
      }
      if (observed.state !== "RUNNING") {
        // A concurrent web conversion or a different owner failure is already
        // authoritative. Do not issue a contradictory terminal request.
        return finish(environmentId, observed, {
          ownerReconciliation: "different_terminal",
        });
      }
      return unavailable(
        attempt.attemptId,
        directError || new Error("주문 수집 실패를 서버에 기록하지 못했습니다."),
      );
    }

    async function execute(input) {
      const attemptId = messageAttemptId(input.message);
      const pendingKey = `${input.environmentId}:${attemptId}`;
      const serverOwned = typeof input.submit === "function";
      if (!attemptId) {
        return publicResult({
          success: false,
          errorCode: "OWNER_ATTEMPT_REQUIRED",
          error: "Owner attempt ID is required",
        }, serverOwned);
      }

      let attempt;
      try {
        attempt = await read(input.environmentId, attemptId);
      } catch (error) {
        return publicResult(unavailable(attemptId, error), serverOwned);
      }
      if (attempt.plan.mallKey !== input.mallKey) {
        return publicResult(await fail(input.environmentId, attempt, {
          code: "ORDER_COLLECTION_PLAN_MISMATCH",
          message: "주문 수집 시도와 몰이 일치하지 않습니다.",
        }, true), serverOwned);
      }
      if (attempt.state !== "RUNNING") {
        await forgetPending(pendingKey);
        return publicResult(await finish(input.environmentId, attempt), serverOwned);
      }

      // Browser-owned attempts must carry the collection date that was frozen
      // by owner admission. A nullable legacy plan is still valid for manual
      // uploads, but it must not be silently widened with a page-supplied
      // dispatch date before provider I/O or conversion.
      if (
        serverOwned &&
        attempt.plan.collectionMode === "browser" &&
        (typeof attempt.plan.collectionDate !== "string" ||
          !validDate(attempt.plan.collectionDate))
      ) {
        const terminal = await fail(
          input.environmentId,
          attempt,
          {
            code: "ORDER_COLLECTION_DATE_NOT_ADMITTED",
            message: "브라우저 주문 수집 날짜가 시도 승인에 포함되지 않았습니다.",
          },
          true,
        );
        return publicResult({
          ...terminal,
          success: terminal.success === true,
          attemptId,
        }, true);
      }

      let pending;
      try {
        pending = await readPending(pendingKey);
      } catch (error) {
        return publicResult({
          success: false,
          attemptId,
          terminalState: "RUNNING",
          continuationRequired: true,
          errorCode: "SOURCE_OWNER_UNAVAILABLE",
          error: boundedText(
            error?.message,
            "주문 수집 변환 재시도 정보를 확인하지 못했습니다.",
          ),
          ownerReconciliation: "required",
        }, serverOwned);
      }
      let collected;
      let submissionUncertain = false;
      if (pending && typeof input.submit === "function") {
        if (
          pending.attempt?.attemptId !== attemptId ||
          pending.attempt?.environmentId !== input.environmentId
        ) {
          return publicResult({
            success: false,
            attemptId,
            terminalState: "RUNNING",
            continuationRequired: true,
            errorCode: "SOURCE_OWNER_UNAVAILABLE",
            error: "주문 수집 변환 재시도 정보가 현재 owner 시도와 일치하지 않습니다.",
            ownerReconciliation: "required",
          }, serverOwned);
        }
        if (!(await isLocallyActive(attemptId, input.environmentId))) {
          await forgetPending(pendingKey);
          return publicResult({
            success: false,
            attemptId,
            terminalState: "RUNNING",
            continuationRequired: false,
            errorCode: "COLLECTION_CANCELLED",
            error: "Order collection was cancelled",
          }, serverOwned);
        }
        try {
          // A same-worker pending record may have been retained in memory
          // after a failed first write. Re-persist the exact capture before
          // allowing the converter request; an in-memory record alone is not
          // durable enough to authorize dispatch.
          await rememberPending(pendingKey, pending);
        } catch (error) {
          return publicResult({
            success: false,
            attemptId,
            terminalState: "RUNNING",
            continuationRequired: true,
            errorCode: "SOURCE_OWNER_UNAVAILABLE",
            error: boundedText(
              error?.message,
              "주문 수집 변환 재시도 정보를 저장하지 못했습니다.",
            ),
            ownerReconciliation: "required",
          }, serverOwned);
        }
        if (!(await isLocallyActive(attemptId, input.environmentId))) {
          await forgetPending(pendingKey);
          return publicResult({
            success: false,
            attemptId,
            terminalState: "RUNNING",
            continuationRequired: false,
            errorCode: "COLLECTION_CANCELLED",
            error: "Order collection was cancelled",
          }, serverOwned);
        }
        try {
          const receipt = await input.submit(
            pending.capture,
            pending.plan,
            {
              attemptId: attempt.attemptId,
              attemptToken: attempt.attemptToken,
              environmentId: input.environmentId,
            },
          );
          collected = {
            success: true,
            attemptId,
            conversion: scalarConversionReceipt(receipt),
          };
        } catch (error) {
          submissionUncertain = submissionIsUncertain(error);
          collected = {
            success: false,
            attemptId,
            errorCode: error?.code || "CONVERSION_FAILED",
            error: error?.message || "주문 파일 변환에 실패했습니다.",
            sourcePayload: Object.prototype.hasOwnProperty.call(error || {}, "sourcePayload")
              ? error.sourcePayload
              : pending.capture,
          };
        }
      } else {
        try {
          collected = await lifecycle.run(
            {
              ...input.message,
              attemptId,
              environmentId: input.environmentId,
            },
            root.KidItemOrderCollectionLifecycle.createIdentity(
              attempt.plan.mallKey,
              attempt.plan.collectionDate,
            ),
            (collection) => input.collect(collection, attempt.plan),
          );
        } catch (error) {
          collected = {
            success: false,
            errorCode: error?.code,
            error: error?.message,
            ...(Object.prototype.hasOwnProperty.call(error || {}, "sourcePayload")
              ? { sourcePayload: error.sourcePayload }
              : {}),
          };
        }
      }

      // A server-owned browser dispatch keeps provider capture and the
      // converter request inside the extension lifetime. The page receives
      // only the converter receipt; raw HTML/JSON/CSV/workbook data never
      // crosses the external-message response boundary. Login/attention is
      // deliberately checked before this handoff so an operator can resume
      // the same attempt without creating an artifact from an incomplete
      // capture.
      if (
        !pending &&
        typeof input.submit === "function" &&
        collected?.success !== false &&
        collected?.pendingLogin !== true &&
        collected?.pendingAuth !== true &&
        !collected?.collectionSession?.attention
      ) {
        // Keep the exact native capture available to the owner failure path.
        // A converter may fail after receiving the capture (or its response
        // may be lost), so retaining only an error string would make the
        // source irrecoverable and prevent a later operator replay.
        const captured = collected;
        if (!(await isLocallyActive(attemptId, input.environmentId))) {
          return publicResult({
            success: false,
            attemptId,
            terminalState: "RUNNING",
            continuationRequired: false,
            errorCode: "COLLECTION_CANCELLED",
            error: "Order collection was cancelled",
          }, serverOwned);
        }
        const pendingInput = {
          capture: captured,
          plan: attempt.plan,
          attempt: {
            attemptId,
            environmentId: input.environmentId,
          },
        };
        try {
          // Persist before dispatching conversion. If the worker is restarted
          // while the request is in flight, the next owner call can replay
          // this exact native capture with the same fence.
          await rememberPending(pendingKey, pendingInput);
        } catch (error) {
          return publicResult({
            success: false,
            attemptId,
            terminalState: "RUNNING",
            continuationRequired: true,
            errorCode: "SOURCE_OWNER_UNAVAILABLE",
            error: boundedText(
              error?.message,
              "주문 수집 변환 재시도 정보를 저장하지 못했습니다.",
            ),
            ownerReconciliation: "required",
          }, true);
        }
        if (!(await isLocallyActive(attemptId, input.environmentId))) {
          await forgetPending(pendingKey);
          return publicResult({
            success: false,
            attemptId,
            terminalState: "RUNNING",
            continuationRequired: false,
            errorCode: "COLLECTION_CANCELLED",
            error: "Order collection was cancelled",
          }, serverOwned);
        }
        try {
          const receipt = await input.submit(
            collected,
            attempt.plan,
            {
              attemptId,
              attemptToken: attempt.attemptToken,
              environmentId: input.environmentId,
            },
          );
          collected = {
            success: true,
            attemptId,
            // The responding page receives only scalar conversion metadata;
            // raw provider captures remain in the server-owned artifact.
            conversion: scalarConversionReceipt(receipt),
          };
        } catch (error) {
          // A transport/timeout failure has no authoritative conversion
          // outcome. Keep the owner RUNNING for reconciliation; only an
          // explicit HTTP conversion response is safe to turn into FAILED.
          submissionUncertain = submissionIsUncertain(error);
          if (submissionUncertain) {
            // The exact pending input was persisted before dispatch. Keep it
            // indexed in memory too, so a same-worker retry is immediate.
            pendingSubmissions.set(pendingKey, pendingInput);
          }
          collected = {
            success: false,
            attemptId,
            errorCode: error?.code || "CONVERSION_FAILED",
            error: error?.message || "주문 파일 변환에 실패했습니다.",
            sourcePayload: Object.prototype.hasOwnProperty.call(error || {}, "sourcePayload")
              ? error.sourcePayload
              : captured,
          };
        }
      }

      let observed;
      try {
        observed = await read(input.environmentId, attemptId);
      } catch (error) {
        return publicResult({
          ...unavailable(attemptId, error),
          ...(collected && typeof collected === "object" ? collected : {}),
          success: false,
          terminalState: "RUNNING",
          errorCode: "SOURCE_OWNER_UNAVAILABLE",
          ...(submissionUncertain ? { ownerReconciliation: "required" } : {}),
        }, serverOwned);
      }
      if (observed.state !== "RUNNING") {
        await forgetPending(pendingKey);
        const terminal = await finish(input.environmentId, observed);
        // The owner projection is authoritative after a lost converter
        // response. Do not merge the stale failed submission envelope into a
        // successful terminal result (or echo its raw evidence); the page can
        // regenerate from the retained artifact using the same fence.
        return serverOwned
          ? publicResult(terminal, true)
          : {
            ...(collected && typeof collected === "object" ? collected : {}),
            ...terminal,
          };
      }

      if (!(await isLocallyActive(attemptId, input.environmentId))) {
        await forgetPending(pendingKey);
        return publicResult({
          ...(collected || {}),
          success: false,
          attemptId,
          terminalState: "RUNNING",
          continuationRequired: false,
          errorCode: "COLLECTION_CANCELLED",
          error: "Order collection was cancelled",
        }, serverOwned);
      }

      if (
        serverOwned &&
        collected?.success === true &&
        collected?.conversion &&
        observed.state === "RUNNING"
      ) {
        return publicResult({
          ...collected,
          success: false,
          attemptId,
          terminalState: "RUNNING",
          continuationRequired: true,
          errorCode: "SOURCE_OWNER_UNAVAILABLE",
          ownerReconciliation: "required",
        }, true);
      }

      if (submissionUncertain) {
        return publicResult({
          ...(collected || {}),
          success: false,
          attemptId,
          terminalState: "RUNNING",
          continuationRequired: true,
          errorCode: "SOURCE_OWNER_UNAVAILABLE",
          ownerReconciliation: "required",
        }, serverOwned);
      }

      if (
        collected?.pendingLogin === true ||
        collected?.pendingAuth === true ||
        collected?.collectionSession?.attention
      ) {
        return publicResult({
          ...(collected || {}),
          success: false,
          attemptId,
          terminalState: "RUNNING",
          continuationRequired: true,
        }, serverOwned);
      }
      if (collected?.success !== false) {
        return publicResult({
          ...(collected || {}),
          success: true,
          attemptId,
          terminalState: "RUNNING",
          continuationRequired: true,
        }, serverOwned);
      }

      const terminal = await fail(
        input.environmentId,
        observed,
        failureBody(collected),
      );
      if (terminal.terminalState !== "RUNNING") await forgetPending(pendingKey);
      return publicResult({
        ...(collected || {}),
        ...terminal,
        success: terminal.success === true,
        attemptId,
      }, serverOwned);
    }

    function run(input) {
      const attemptId = messageAttemptId(input?.message);
      const key = `${input?.environmentId}:${attemptId || "missing"}`;
      const existing = active.get(key);
      if (existing) return existing;
      const promise = Promise.resolve()
        .then(() => execute(input))
        .finally(() => {
          if (active.get(key) === promise) active.delete(key);
        });
      active.set(key, promise);
      return promise;
    }

    async function cancel({ environmentId, attemptId }) {
      if (!validUuid(attemptId)) throw new Error("Owner attempt ID is required");
      const session = await sessions.getOwned(attemptId, environmentId);
      if (session?.producer !== PRODUCER) return null;

      let attempt;
      try {
        attempt = await read(environmentId, attemptId);
      } catch (error) {
        return unavailable(attemptId, error);
      }
      if (attempt.state !== "RUNNING") return finish(environmentId, attempt);
      return fail(environmentId, attempt, {
        code: "COLLECTION_CANCELLED",
        message: "주문 수집이 취소되었습니다.",
      });
    }

    return Object.freeze({ run, cancel, read });
  }

  root.KidItemOrderCollectionSourceOwner = Object.freeze({ create });
})(globalThis);
