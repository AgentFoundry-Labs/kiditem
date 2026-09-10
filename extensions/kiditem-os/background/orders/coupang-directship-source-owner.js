(function installCoupangDirectshipSourceOwner(root) {
  "use strict";

  const PATH = "/api/orders/collection/coupang-directship/attempts";
  const PRODUCER = "orders.coupang_directship";
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function validUuid(value) {
    return typeof value === "string" && UUID.test(value);
  }

  function validDate(value) {
    return value === null ||
      (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
  }

  function parseStart(message) {
    if (
      message?.action !== "collectCoupangDirectOrders" ||
      !validUuid(message.attemptId) ||
      !validDate(message.date ?? null) ||
      Object.keys(message).some((key) =>
        !["action", "attemptId", "date"].includes(key))
    ) {
      throw new Error("Invalid Coupang directship attempt");
    }
    return { attemptId: message.attemptId };
  }

  function parse(value, attemptId, requireToken) {
    const plan = value?.plan;
    if (
      value?.attemptId !== attemptId ||
      (requireToken && !validUuid(value?.attemptToken)) ||
      (!requireToken && value?.attemptToken !== undefined &&
        value?.attemptToken !== null && !validUuid(value.attemptToken)) ||
      !validUuid(value?.sourceImportRunId) ||
      !["RUNNING", "COMPLETE", "FAILED"].includes(value?.state) ||
      plan?.sourceType !== "coupang_direct_order_capture" ||
      plan?.parserVersion !== "coupang-direct-order-v1" ||
      !validUuid(plan?.channelAccountId) ||
      plan?.captureMode !== "browser" ||
      plan?.transportScope !== "ALL" ||
      (value?.expiresAt !== null &&
        !Number.isFinite(Date.parse(value?.expiresAt || ""))) ||
      (value?.artifactId !== null && !validUuid(value?.artifactId)) ||
      (value?.contentChecksum !== null && typeof value?.contentChecksum !== "string") ||
      (value?.errorCode !== null && typeof value?.errorCode !== "string") ||
      (value?.errorMessage !== null && typeof value?.errorMessage !== "string")
    ) {
      throw new Error("COUPANG_DIRECTSHIP_PLAN_INVALID");
    }
    if (
      value.state === "RUNNING" &&
      (!value.expiresAt || Date.parse(value.expiresAt) <= Date.now())
    ) {
      throw new Error("ATTEMPT_EXPIRED");
    }
    return value;
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

  function create({ chrome, sessions, request, collect }) {
    const inFlight = new Map();
    const pendingCaptures = new Map();
    const wire = root.KidItemSourcingAttemptWire.create({
      chrome,
      sourcePath: PATH,
      requestFailureMessage: "쿠팡직배송 수집 상태를 확인하지 못했습니다",
    });

    async function isLocallyActive(attemptId, environmentId, allowUnstarted = false) {
      // A missing session is a fresh-attempt admission state. Only a persisted
      // owner session is eligible for the stop-fence lookup; sessions.start
      // remains the atomic app-presence admission point.
      if (typeof sessions.getOwned === "function") {
        let session;
        try {
          session = await sessions.getOwned(attemptId, environmentId);
        } catch {
          return false;
        }
        if (!session) return allowUnstarted;
        if (session.producer !== PRODUCER) return false;
      } else if (allowUnstarted) {
        return true;
      }
      if (typeof sessions.isActive !== "function") return true;
      try {
        return (await sessions.isActive(attemptId, environmentId, PRODUCER)) !== false;
      } catch {
        return false;
      }
    }

    function connection(environmentId, attemptId) {
      const connectionConfig = {
        apiBase: "",
        headers: { "Content-Type": "application/json" },
        request: (path, init) => request(environmentId, path, init),
      };
      return {
        read: () => wire.requestJsonWithRetry(
          connectionConfig,
          `${PATH}/${encodeURIComponent(attemptId)}`,
          { method: "GET" },
          (value) => parse(value, attemptId, false),
        ),
        control: () => wire.requestJsonWithRetry(
          connectionConfig,
          `${PATH}/${encodeURIComponent(attemptId)}/control`,
          { method: "GET" },
          (value) => parse(value, attemptId, true),
        ),
        complete: (attempt, body, options = {}) => wire.terminal(
          connectionConfig,
          attempt,
          { method: "POST", suffix: "/complete", body },
          (value) => parse(value, attemptId, false),
          options,
        ),
        fail: (attempt, body, options = {}) => wire.terminal(
          connectionConfig,
          attempt,
          { method: "POST", suffix: "/fail", body },
          (value) => parse(value, attemptId, false),
          options,
        ),
      };
    }

    async function finish(attempt, extra = {}) {
      if (attempt.state !== "RUNNING") {
        await sessions.cancel(attempt.attemptId, { closeManagedTab: true });
      }
      return resultFor(attempt, extra);
    }

    function collectionFor(environmentId, attemptId) {
      return Object.freeze({
        attemptId,
        runId: attemptId,
        environmentId,
        isActive: () => isLocallyActive(attemptId, environmentId),
        assertActive: () => isLocallyActive(attemptId, environmentId),
        attachTab(tab, attachment = {}) {
          if (!Number.isInteger(tab?.id) || !Number.isInteger(tab?.windowId)) {
            throw new Error("Order collection tab is unavailable");
          }
          return sessions.attachTab(attemptId, {
            tabId: tab.id,
            windowId: tab.windowId,
            closeOnCancel: attachment.owned !== false,
          });
        },
        detachTab(tab, attachment = {}) {
          if (!Number.isInteger(tab?.id)) {
            throw new Error("Order collection tab is unavailable");
          }
          return sessions.detachTab(attemptId, {
            tabId: tab.id,
            closeManagedTab: attachment.owned !== false,
          });
        },
        progress(nextProgress) {
          return sessions.progress(attemptId, nextProgress);
        },
      });
    }

    async function failCapture(environmentId, attempt, observed) {
      if (!(await isLocallyActive(attempt.attemptId, environmentId))) {
        return {
          success: false,
          attemptId: attempt.attemptId,
          terminalState: "RUNNING",
          errorCode: "COLLECTION_CANCELLED",
          error: "쿠팡직배송 수집이 중단되었습니다.",
        };
      }
      const body = wire.failure(
        { code: observed?.errorCode, message: observed?.error },
        "coupang_direct_capture_failed",
        "쿠팡직배송 원본 수집에 실패했습니다.",
      );
      let terminal;
      try {
        terminal = await connection(environmentId, attempt.attemptId).fail(attempt, body, {
          shouldContinue: () => isLocallyActive(attempt.attemptId, environmentId),
          cancelCode: "COLLECTION_CANCELLED",
          cancelMessage: "쿠팡직배송 수집이 중단되었습니다.",
        });
      } catch (error) {
        terminal = await connection(environmentId, attempt.attemptId).read().catch(() => null);
        if (!terminal || terminal.state === "RUNNING") {
          return {
            ...observed,
            success: false,
            attemptId: attempt.attemptId,
            terminalState: "RUNNING",
            errorCode: "SOURCE_RESULT_UNCONFIRMED",
            error: String(error?.message || "수집 결과를 확인해주세요.").slice(0, 300),
          };
        }
      }
      return finish(terminal, {
        ...(typeof observed?.errorCode === "string" ? { errorCode: observed.errorCode } : {}),
        ...(typeof observed?.error === "string" ? { error: observed.error } : {}),
      });
    }

    async function submitCapture(environmentId, attempt, observedOrCapture) {
      if (!(await isLocallyActive(attempt.attemptId, environmentId))) {
        return {
          success: false,
          attemptId: attempt.attemptId,
          terminalState: "RUNNING",
          errorCode: "COLLECTION_CANCELLED",
          error: "쿠팡직배송 수집이 중단되었습니다.",
        };
      }
      const capture = observedOrCapture.capture || {
        channelAccountId: attempt.plan.channelAccountId,
        pos: observedOrCapture.pos,
        centers: observedOrCapture.centers,
      };
      let terminal;
      try {
        terminal = await connection(environmentId, attempt.attemptId).complete(attempt, capture, {
          shouldContinue: () => isLocallyActive(attempt.attemptId, environmentId),
          cancelCode: "COLLECTION_CANCELLED",
          cancelMessage: "쿠팡직배송 수집이 중단되었습니다.",
        });
      } catch (error) {
        if (!(await isLocallyActive(attempt.attemptId, environmentId))) {
          return {
            success: false,
            attemptId: attempt.attemptId,
            terminalState: "RUNNING",
            errorCode: "COLLECTION_CANCELLED",
            error: "쿠팡직배송 수집이 중단되었습니다.",
          };
        }
        const current = await connection(environmentId, attempt.attemptId).read().catch(() => null);
        if (current && current.state !== "RUNNING") return finish(current);
        if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) {
          return failCapture(environmentId, attempt, {
            success: false,
            errorCode: "COUPANG_DIRECT_CAPTURE_REJECTED",
            error: String(error?.message || "서버가 원본 수집을 거부했습니다.").slice(0, 300),
          });
        }
        return {
          success: false,
          attemptId: attempt.attemptId,
          terminalState: "RUNNING",
          errorCode: "SOURCE_RESULT_UNCONFIRMED",
          error: String(error?.message || "서버 저장 결과를 확인해주세요.").slice(0, 300),
        };
      }
      return finish(terminal);
    }

    async function collectAttempt({ environmentId, attemptId }) {
      const pendingKey = `${environmentId}:${attemptId}`;
      const owner = connection(environmentId, attemptId);
      const attempt = await owner.control();
      if (attempt.state !== "RUNNING") {
        pendingCaptures.delete(pendingKey);
        return finish(attempt);
      }

      if (!(await isLocallyActive(attemptId, environmentId, true))) {
        return {
          success: false,
          attemptId,
          terminalState: "RUNNING",
          errorCode: "COLLECTION_CANCELLED",
          error: "쿠팡직배송 수집이 중단되었습니다.",
        };
      }

      const pending = pendingCaptures.get(pendingKey);
      if (pending) {
        const terminal = await submitCapture(environmentId, attempt, pending);
        if (terminal.terminalState !== "RUNNING") pendingCaptures.delete(pendingKey);
        return terminal;
      }

      const existing = await sessions.getOwned(attemptId, environmentId);
      if (existing && existing.producer !== PRODUCER) {
        throw new Error("Owner attempt does not belong to Coupang directship");
      }
      if (existing?.progress?.completed >= 1) {
        return {
          success: false,
          attemptId,
          terminalState: "RUNNING",
          errorCode: "CAPTURE_ALREADY_COLLECTED",
          error: "쿠팡직배송 원본은 이미 수집되었습니다. 같은 시도에서 다시 수집하지 않습니다.",
          collectionSession: existing,
        };
      }

      const started = await sessions.start({
        environmentId,
        attemptId,
        producer: PRODUCER,
      });
      if (started === null || started === false) {
        return {
          success: false,
          attemptId,
          terminalState: "RUNNING",
          errorCode: "COLLECTION_CANCELLED",
          error: "쿠팡직배송 수집이 중단되었습니다.",
        };
      }
      const collection = collectionFor(environmentId, attemptId);
      let observed;
      try {
        observed = await collect(attempt.plan, collection);
      } catch (error) {
        observed = {
          success: false,
          errorCode: error?.code,
          error: error?.message,
        };
      }

      if (!(await isLocallyActive(attemptId, environmentId))) {
        const current = await owner.read().catch(() => null);
        if (current && current.state !== "RUNNING") return finish(current);
        return {
          success: false,
          cancelled: true,
          attemptId,
          terminalState: "RUNNING",
          error: "쿠팡직배송 수집이 중단되었습니다.",
          collectionSession: null,
        };
      }

      if (
        observed?.pendingLogin === true ||
        observed?.pendingAuth === true ||
        observed?.errorCode === "coupang_po_session_required"
      ) {
        const collectionSession = await sessions.requireAttention(attemptId, {
          reason: "marketplace_login",
          message: observed.error || "쿠팡 Supplier Hub 로그인이 필요합니다.",
        });
        return {
          success: false,
          attemptId,
          terminalState: "RUNNING",
          errorCode: observed.errorCode,
          error: observed.error,
          collectionSession,
        };
      }
      if (observed?.success !== true) {
        return failCapture(environmentId, attempt, observed);
      }

      if (!Array.isArray(observed?.pos) || !observed?.centers ||
        typeof observed.centers !== "object" || Array.isArray(observed.centers)) {
        return failCapture(environmentId, attempt, {
          success: false,
          errorCode: "COUPANG_DIRECT_CAPTURE_INVALID",
          error: "쿠팡직배송 원본 응답 형식이 올바르지 않습니다.",
        });
      }

      await sessions.progress(attemptId, {
        current: 1,
        total: 2,
        completed: 1,
        failed: 0,
        label: "쿠팡직배송 원본 수집 완료 · 서버 저장 중",
      });
      const pendingCapture = {
        capture: {
          channelAccountId: attempt.plan.channelAccountId,
          pos: observed.pos,
          centers: observed.centers,
        },
      };
      pendingCaptures.set(pendingKey, pendingCapture);
      const terminal = await submitCapture(environmentId, attempt, pendingCapture);
      if (terminal.terminalState !== "RUNNING") pendingCaptures.delete(pendingKey);
      return terminal;
    }

    function run(input) {
      const key = `${input.environmentId}:${input.attemptId}`;
      const existing = inFlight.get(key);
      if (existing) return existing;
      const promise = Promise.resolve()
        .then(() => collectAttempt(input))
        .finally(() => {
          if (inFlight.get(key) === promise) inFlight.delete(key);
        });
      inFlight.set(key, promise);
      return promise;
    }

    async function cancel({ environmentId, attemptId }) {
      pendingCaptures.delete(`${environmentId}:${attemptId}`);
      const session = await sessions.getOwned(attemptId, environmentId);
      if (session?.producer !== PRODUCER) return null;
      const owner = connection(environmentId, attemptId);
      const attempt = await owner.control();
      let terminal = attempt;
      if (attempt.state === "RUNNING") {
        terminal = await owner.fail(attempt, {
          code: "COLLECTION_CANCELLED",
          message: "쿠팡직배송 수집을 중단했습니다.",
        });
      }
      await sessions.cancel(attemptId, { closeManagedTab: true });
      return resultFor(terminal);
    }

    return Object.freeze({ run, cancel });
  }

  root.KidItemCoupangDirectshipSourceOwner = Object.freeze({
    create,
    parseStart,
    producer: PRODUCER,
  });
})(globalThis);
