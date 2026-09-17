(function (root) {
  "use strict";

  // 몰 관리자 화면에서 등록 상품을 가져오는 owner 연결(KID-246 2단계). 서버가 몰 계정 행
  // 하나의 시도를 열고 계획(몰 · 주소 · 쪽 크기)을 정한다. 확장은 그 계획대로 읽어 한 번에
  // 제출할 뿐, 정본은 서버에만 있다. 읽을 몰이 맞는지는 읽기기(mall-admin-listings.js)가 본다.
  const PATH = "/api/channels/mall-admin-listings/attempts";
  const PRODUCER = "orders.mall_admin_listings";
  const SOURCE_TYPE = "mall_admin_listings";
  const PARSER_VERSION = "mall-admin-listings-v1";
  const CANCELLED_MESSAGE = "몰 등록 상품 가져오기가 취소되었습니다.";
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function parseStart(message) {
    if (
      message?.action !== "collectMallAdminListings" ||
      typeof message.attemptId !== "string" ||
      !UUID.test(message.attemptId) ||
      Object.keys(message).some((key) => key !== "action" && key !== "attemptId")
    ) {
      throw new Error("Invalid mall admin listings attempt");
    }
    return { attemptId: message.attemptId };
  }

  function validOrigin(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.origin === value;
    } catch {
      return false;
    }
  }

  function parse(value, attemptId) {
    const plan = value?.plan;
    if (
      value?.attemptId !== attemptId ||
      !UUID.test(value.attemptToken || "") ||
      plan?.sourceType !== SOURCE_TYPE ||
      plan.parserVersion !== PARSER_VERSION ||
      typeof plan.mallKey !== "string" ||
      plan.mallKey.length === 0 ||
      plan.mallKey.length > 40 ||
      !UUID.test(plan.channelAccountId || "") ||
      !validOrigin(plan.sourceOrigin) ||
      !Number.isInteger(plan.pageSize) ||
      plan.pageSize <= 0 ||
      !["RUNNING", "COMPLETE", "FAILED"].includes(value.state) ||
      !Number.isFinite(Date.parse(value.expiresAt))
    ) {
      throw new Error("MALL_ADMIN_PLAN_INVALID");
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

  function create({ chrome, request, collect, sessions, mallName = () => "몰" }) {
    const inFlight = new Map();
    const wire = root.KidItemSourcingAttemptWire.create({
      chrome,
      sourcePath: PATH,
      requestFailureMessage: "몰 등록 상품 가져오기 상태를 확인하지 못했습니다",
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
      if (attempt.state === "FAILED" && attempt.errorCode === "mall_login_required") {
        // 로그인할 탭을 남겨 두고 사람에게 알린다.
        await sessions.requireAttention(attempt.attemptId, {
          reason: "marketplace_login",
          message: attempt.errorMessage || `${mallName(attempt.plan?.mallKey)} 로그인이 필요합니다.`,
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
      const name = mallName(attempt.plan.mallKey);
      await sessions.progress(attemptId, {
        current: 0,
        total: 2,
        completed: 0,
        failed: 0,
        label: `${name} 상품 목록을 읽고 있습니다.`,
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
              "mall_collection_failed",
              `${name} 상품 목록을 읽지 못했습니다.`,
            ),
          };
      if (snapshot) {
        await sessions.progress(attemptId, {
          current: 1,
          total: 2,
          completed: 1,
          failed: 0,
          label: `${name} 상품 ${snapshot.collection.recordsRead}개를 읽었습니다 · 저장 중`,
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
                  { code: "mall_invalid_snapshot", message: error.message },
                  "mall_invalid_snapshot",
                  `${name} 상품 목록 형식이 올바르지 않습니다.`,
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

  root.KidItemMallAdminListingsSourceOwner = Object.freeze({ create, parseStart });
})(globalThis);
