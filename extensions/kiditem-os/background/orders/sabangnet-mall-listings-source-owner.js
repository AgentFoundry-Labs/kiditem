(function (root) {
  "use strict";

  // 사방넷 송신 기록 가져오기의 owner 연결(KID-246). 서버가 시도를 열고 계획을 정한다.
  // 확장은 그 계획대로 읽어 한 번에 제출할 뿐, 정본은 서버에만 있다.
  const PATH = "/api/channels/sabangnet-listings/attempts";
  const PRODUCER = "orders.sabangnet_mall_listings";
  const SOURCE_TYPE = "sabangnet_mall_listings";
  const PARSER_VERSION = "sabangnet-mall-listings-v1";
  const SOURCE_ORIGIN = "https://sbadmin08.sabangnet.co.kr";
  const LIST_PATH = "/prod-api/customer/mall/MallProductUpdate/getMallProductUpdateLists";
  const PAGE_SIZE = 500;
  const CANCELLED_MESSAGE = "사방넷 가져오기가 취소되었습니다.";
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function parseStart(message) {
    if (
      message?.action !== "collectSabangnetMallListings" ||
      typeof message.attemptId !== "string" ||
      !UUID.test(message.attemptId) ||
      Object.keys(message).some((key) => key !== "action" && key !== "attemptId")
    ) {
      throw new Error("Invalid Sabangnet mall listings attempt");
    }
    return { attemptId: message.attemptId };
  }

  function validMall(mall) {
    return (
      mall &&
      typeof mall.mallKey === "string" &&
      mall.mallKey.length > 0 &&
      mall.mallKey.length <= 40 &&
      UUID.test(mall.channelAccountId || "") &&
      Array.isArray(mall.sabangnetShopIds) &&
      mall.sabangnetShopIds.length > 0 &&
      mall.sabangnetShopIds.every((id) => typeof id === "string" && /^shop\d{4}$/.test(id))
    );
  }

  function parse(value, attemptId) {
    const plan = value?.plan;
    if (
      value?.attemptId !== attemptId ||
      !UUID.test(value.attemptToken || "") ||
      plan?.sourceType !== SOURCE_TYPE ||
      plan.parserVersion !== PARSER_VERSION ||
      plan.sourceOrigin !== SOURCE_ORIGIN ||
      plan.listPath !== LIST_PATH ||
      plan.pageSize !== PAGE_SIZE ||
      !/^\d{8}$/.test(plan.dateFrom || "") ||
      !/^\d{8}$/.test(plan.dateTo || "") ||
      plan.dateFrom > plan.dateTo ||
      !Array.isArray(plan.malls) ||
      plan.malls.length === 0 ||
      !plan.malls.every(validMall) ||
      !["RUNNING", "COMPLETE", "FAILED"].includes(value.state) ||
      !Number.isFinite(Date.parse(value.expiresAt))
    ) {
      throw new Error("SABANGNET_PLAN_INVALID");
    }
    if (value.state === "RUNNING" && Date.parse(value.expiresAt) <= Date.now()) {
      throw new Error("ATTEMPT_EXPIRED");
    }
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

  function cancelled(attemptId) {
    return {
      success: false,
      attemptId,
      terminalState: "RUNNING",
      errorCode: "COLLECTION_CANCELLED",
      error: CANCELLED_MESSAGE,
    };
  }

  async function isLocallyActive(sessions, attemptId, environmentId, allowUnstarted = false) {
    // `isActive` is a stop-fence lookup, not admission. A fresh owner has no
    // local session yet; sessions.start performs the app-presence admission.
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
      requestFailureMessage: "사방넷 가져오기 상태를 확인하지 못했습니다",
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
            .requestJson(config, `${PATH}/${encodeURIComponent(attemptId)}`, { method: "GET" })
            .then((value) => parse(value, attemptId)),
        terminal: (attempt, submission, options = {}) =>
          wire.terminal(config, attempt, submission, (value) => parse(value, attemptId), options),
      };
    }

    async function finish(attempt) {
      if (attempt.state === "FAILED" && attempt.errorCode === "sabangnet_login_required") {
        // 로그인할 탭을 남겨 두고 사람에게 알린다.
        await sessions.requireAttention(attempt.attemptId, {
          reason: "marketplace_login",
          message: attempt.errorMessage || "사방넷 로그인이 필요합니다.",
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
        return cancelled(attemptId);
      }
      const started = await sessions.start({ environmentId, attemptId, producer: PRODUCER });
      if (started === null || started === false) return cancelled(attemptId);
      await sessions.progress(attemptId, {
        current: 0,
        total: 2,
        completed: 0,
        failed: 0,
        label: "사방넷 송신 기록을 읽고 있습니다.",
      });
      let observed;
      try {
        observed = await collect(attempt.plan, {
          attemptId,
          environmentId,
          isActive: () => isLocallyActive(sessions, attemptId, environmentId),
          assertActive: () => isLocallyActive(sessions, attemptId, environmentId),
          attachTab: (tab, { owned }) =>
            sessions.attachTab(attemptId, {
              tabId: tab.id,
              windowId: tab.windowId,
              closeOnCancel: owned,
            }),
          detachTab: (tab, { owned }) =>
            sessions.detachTab(attemptId, { tabId: tab.id, closeManagedTab: owned }),
        });
      } catch (error) {
        observed = { success: false, error: error?.message };
      }
      if (!(await isLocallyActive(sessions, attemptId, environmentId))) {
        observed = { success: false, errorCode: "COLLECTION_CANCELLED", error: CANCELLED_MESSAGE };
      }
      if (observed?.errorCode === "COLLECTION_CANCELLED") {
        const current = await owner.read().catch(() => null);
        if (current && current.state !== "RUNNING") return finish(current);
        return cancelled(attemptId);
      }
      const snapshot = observed?.success === true ? observed.snapshot : null;
      const submission = snapshot
        ? {
            method: "PUT",
            suffix: "",
            body: {
              collection: { collectionRunId: attemptId, ...snapshot.collection },
              rows: snapshot.rows,
              proof: snapshot.proof,
            },
          }
        : {
            method: "POST",
            suffix: "/fail",
            body: wire.failure(
              { code: observed?.errorCode, message: observed?.error },
              "sabangnet_collection_failed",
              "사방넷 송신 기록을 읽지 못했습니다.",
            ),
          };
      if (snapshot) {
        await sessions.progress(attemptId, {
          current: 1,
          total: 2,
          completed: 1,
          failed: 0,
          label: `사방넷 송신 기록 ${snapshot.collection.recordsRead}건을 읽었습니다 · 저장 중`,
        });
      }
      if (!(await isLocallyActive(sessions, attemptId, environmentId))) {
        return cancelled(attemptId);
      }
      let terminal;
      try {
        terminal = await owner.terminal(attempt, submission, {
          shouldContinue: () => isLocallyActive(sessions, attemptId, environmentId),
          cancelCode: "COLLECTION_CANCELLED",
          cancelMessage: CANCELLED_MESSAGE,
        });
      } catch (error) {
        // 응답을 잃었다고 실패한 것은 아니다. owner 를 다시 읽어 확인한다.
        terminal = await owner.read().catch(() => null);
        if (
          terminal?.state === "RUNNING" &&
          submission.method === "PUT" &&
          [400, 422].includes(error?.status)
        ) {
          // 서버가 형식을 확실히 거절했다 — 저장되지 않았으니 실패로 남긴다.
          terminal = await owner
            .terminal(
              attempt,
              {
                method: "POST",
                suffix: "/fail",
                body: wire.failure(
                  { code: "sabangnet_invalid_snapshot", message: error.message },
                  "sabangnet_invalid_snapshot",
                  "사방넷 송신 기록 형식이 올바르지 않습니다.",
                ),
              },
              {
                shouldContinue: () => isLocallyActive(sessions, attemptId, environmentId),
                cancelCode: "COLLECTION_CANCELLED",
                cancelMessage: CANCELLED_MESSAGE,
              },
            )
            .catch(() => null);
          terminal ??= await owner.read().catch(() => null);
        }
        if (!terminal || terminal.state === "RUNNING") {
          return {
            success: false,
            attemptId,
            terminalState: "RUNNING",
            errorCode: "SOURCE_RESULT_UNCONFIRMED",
            error: String(error?.message || "서버 저장 결과를 확인해 주세요.").slice(0, 300),
          };
        }
      }
      return finish(terminal);
    }

    function run(input) {
      const key = `${input.environmentId}:${input.attemptId}`;
      if (!inFlight.has(key)) {
        inFlight.set(key, collectAttempt(input).finally(() => inFlight.delete(key)));
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
                body: { code: "COLLECTION_CANCELLED", message: CANCELLED_MESSAGE },
              })
              .catch(async (error) => {
                const current = await owner.read().catch(() => null);
                if (!current || current.state === "RUNNING") throw error;
                return current;
              });
      if (terminal.state !== "RUNNING") {
        await sessions.cancel(attemptId, { closeManagedTab: true });
      }
      return result(terminal);
    }

    return Object.freeze({ run, cancel });
  }

  root.KidItemSabangnetMallListingsSourceOwner = Object.freeze({ create, parseStart });
})(globalThis);
