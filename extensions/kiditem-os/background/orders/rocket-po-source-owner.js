(function (root) {
  "use strict";
  const PATH = "/api/channels/rocket-po/attempts";
  const PRODUCER = "orders.coupang_rocket_po";
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function parseStart(message) {
    if (
      message?.action !== "collectRocketPoRows" ||
      typeof message.attemptId !== "string" ||
      !UUID.test(message.attemptId) ||
      Object.keys(message).some(
        (key) => key !== "action" && key !== "attemptId",
      )
    ) {
      throw new Error("Invalid Rocket PO attempt");
    }
    return { attemptId: message.attemptId };
  }

  function parse(value, attemptId) {
    const plan = value?.plan;
    if (
      value?.attemptId !== attemptId ||
      !UUID.test(value.attemptToken || "") ||
      !UUID.test(value.channelAccountId || "") ||
      plan?.channelAccountId !== value.channelAccountId ||
      plan?.sourceType !== "coupang_rocket_po_catalog" ||
      plan.parserVersion !== "rocket-po-v1" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(plan.from || "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(plan.to || "") ||
      plan.from > plan.to ||
      !["RP", "PA", "RI", "CI", ""].includes(plan.status) ||
      !["WAREHOUSING_PLAN_DATE", "PURCHASE_ORDER_DATE"].includes(
        plan.dateType,
      ) ||
      typeof plan.requireConfirmation !== "boolean" ||
      !["RUNNING", "COMPLETE", "FAILED"].includes(value.state) ||
      !Number.isFinite(Date.parse(value.expiresAt))
    ) {
      throw new Error("ROCKET_PO_PLAN_INVALID");
    }
    if (value.state === "RUNNING" && Date.parse(value.expiresAt) <= Date.now())
      throw new Error("ATTEMPT_EXPIRED");
    return value;
  }

  function result(attempt) {
    return {
      success: attempt.state === "COMPLETE",
      attemptId: attempt.attemptId,
      terminalState: attempt.state,
      ...(attempt.state === "FAILED"
        ? { errorCode: attempt.errorCode, error: attempt.errorMessage }
        : {}),
    };
  }

  async function isLocallyActive(sessions, attemptId, environmentId, allowUnstarted = false) {
    // `isActive` is a persisted stop-fence lookup, not an admission check. A
    // fresh owner has no local session yet, so consult ownership first and let
    // sessions.start/onStarted perform the atomic app-presence admission.
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

  function create({ chrome, request, collect, sessions }) {
    const inFlight = new Map();
    const wire = root.KidItemSourcingAttemptWire.create({
      chrome,
      sourcePath: PATH,
      requestFailureMessage: "로켓 발주 수집 상태를 확인하지 못했습니다",
    });
    function connection(environmentId, attemptId) {
      const config = {
        apiBase: "",
        headers: { "Content-Type": "application/json" },
        request: (path, init) => request(environmentId, path, init),
      };
      return {
        read: () =>
          wire
            .requestJson(config, `${PATH}/${encodeURIComponent(attemptId)}`, {
              method: "GET",
            })
            .then((value) => parse(value, attemptId)),
        terminal: (attempt, submission, options = {}) =>
          wire.terminal(
            config,
            attempt,
            submission,
            (value) => parse(value, attemptId),
            options,
          ),
      };
    }

    async function finish(attempt) {
      if (
        attempt.state === "FAILED" &&
        attempt.errorCode === "coupang_po_session_required"
      ) {
        await sessions.requireAttention(attempt.attemptId, {
          reason: "marketplace_login",
          message: attempt.errorMessage || "Supplier Hub 로그인이 필요합니다.",
        });
      } else if (attempt.state !== "RUNNING") {
        await sessions.cancel(attempt.attemptId, { closeManagedTab: true });
      }
      return result(attempt);
    }

    async function collectAttempt({ environmentId, attemptId }) {
      const owner = connection(environmentId, attemptId);
      const attempt = await owner.read();
      if (attempt.state !== "RUNNING") return result(attempt);
      if (!(await isLocallyActive(sessions, attemptId, environmentId, true))) {
        return {
          success: false,
          attemptId,
          terminalState: "RUNNING",
          errorCode: "COLLECTION_CANCELLED",
          error: "로켓 발주 수집이 취소되었습니다.",
        };
      }
      const started = await sessions.start({ environmentId, attemptId, producer: PRODUCER });
      if (started === null || started === false) return {
        success: false,
        attemptId,
        terminalState: "RUNNING",
        errorCode: "COLLECTION_CANCELLED",
        error: "로켓 발주 수집이 취소되었습니다.",
      };
      let observed;
      try {
        observed = await collect(attempt.plan, {
          attemptId,
          environmentId,
          requireOwnedTab: true,
          isActive: () => isLocallyActive(sessions, attemptId, environmentId),
          assertActive: () => isLocallyActive(sessions, attemptId, environmentId),
          attachTab: (tab, { owned }) =>
            sessions.attachTab(attemptId, {
              tabId: tab.id,
              windowId: tab.windowId,
              closeOnCancel: owned,
            }),
          detachTab: (tab, { owned }) =>
            sessions.detachTab(attemptId, {
              tabId: tab.id,
              closeManagedTab: owned,
            }),
        });
      } catch (error) {
        observed = { success: false, error: error?.message };
      }
      if (!(await isLocallyActive(sessions, attemptId, environmentId))) {
        observed = {
          success: false,
          errorCode: "COLLECTION_CANCELLED",
          error: "로켓 발주 수집이 취소되었습니다.",
        };
      }
      if (observed?.errorCode === "COLLECTION_CANCELLED") {
        const current = await owner.read().catch(() => null);
        if (current && current.state !== "RUNNING") return finish(current);
        return {
          success: false,
          attemptId,
          terminalState: "RUNNING",
          errorCode: "COLLECTION_CANCELLED",
          error: "로켓 발주 수집이 취소되었습니다.",
        };
      }
      const submission =
        observed?.success === true
          ? {
              method: "PUT",
              suffix: "",
              body: {
                collection: observed.evidence,
                rows: observed.rows,
                proof: observed.proof,
              },
            }
          : {
              method: "POST",
              suffix: "/fail",
              body: wire.failure(
                { code: observed?.errorCode, message: observed?.error },
                "rocket_po_collection_failed",
                "로켓 발주 수집에 실패했습니다.",
              ),
            };
      if (!(await isLocallyActive(sessions, attemptId, environmentId))) {
        return {
          success: false,
          attemptId,
          terminalState: "RUNNING",
          errorCode: "COLLECTION_CANCELLED",
          error: "로켓 발주 수집이 취소되었습니다.",
        };
      }
      let terminal;
      try {
        terminal = await owner.terminal(attempt, submission, {
          shouldContinue: () =>
            isLocallyActive(sessions, attemptId, environmentId),
          cancelCode: "COLLECTION_CANCELLED",
          cancelMessage: "로켓 발주 수집이 취소되었습니다.",
        });
      } catch (error) {
        // A lost ACK does not establish failure. Recover the exact owner before
        // considering any different terminal request.
        terminal = await owner.read().catch(() => null);
        if (
          terminal?.state === "RUNNING" &&
          submission.method === "PUT" &&
          [400, 422].includes(error?.status)
        ) {
          // A definitive payload rejection did not publish. Record this failed
          // capture; fence loss and uncertain transport errors never take this path.
          terminal = await owner
            .terminal(attempt, {
              method: "POST",
              suffix: "/fail",
              body: wire.failure(
                { code: "rocket_po_response_invalid", message: error.message },
                "rocket_po_response_invalid",
                "로켓 발주 응답 형식이 올바르지 않습니다.",
              ),
            }, {
              shouldContinue: () =>
                isLocallyActive(sessions, attemptId, environmentId),
              cancelCode: "COLLECTION_CANCELLED",
              cancelMessage: "로켓 발주 수집이 취소되었습니다.",
            })
            .catch(() => null);
          terminal ??= await owner.read().catch(() => null);
        }
        if (!terminal || terminal.state === "RUNNING")
          return {
            success: false,
            attemptId,
            terminalState: "RUNNING",
            errorCode: "SOURCE_RESULT_UNCONFIRMED",
            error: String(
              error?.message || "서버 저장 결과를 확인해주세요.",
            ).slice(0, 300),
          };
      }
      return finish(terminal);
    }
    function run(input) {
      const key = `${input.environmentId}:${input.attemptId}`;
      if (!inFlight.has(key)) {
        inFlight.set(
          key,
          collectAttempt(input).finally(() => inFlight.delete(key)),
        );
      }
      return inFlight.get(key);
    }
    async function cancel({ environmentId, attemptId }) {
      const session = await sessions.getOwned(attemptId, environmentId);
      if (session?.producer !== PRODUCER) return null;
      const owner = connection(environmentId, attemptId);
      const attempt = await owner.read();
      const terminal =
        attempt.state !== "RUNNING"
          ? attempt
          : await owner
              .terminal(attempt, {
                method: "POST",
                suffix: "/fail",
                body: {
                  code: "COLLECTION_CANCELLED",
                  message: "로켓 발주 수집이 취소되었습니다.",
                },
              })
              .catch(async (error) => {
                const current = await owner.read().catch(() => null);
                if (!current || current.state === "RUNNING") throw error;
                return current;
              });
      if (terminal.state !== "RUNNING")
        await sessions.cancel(attemptId, { closeManagedTab: true });
      return result(terminal);
    }
    return Object.freeze({ run, cancel });
  }
  root.KidItemRocketPoSourceOwner = Object.freeze({ create, parseStart });
})(globalThis);
