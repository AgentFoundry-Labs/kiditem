(function (root) {
  "use strict";
  const PATH = "/api/ads/keyword-rank/serp/attempts";
  const PRODUCER = "advertising.keyword_rank";
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function parseStart(message) {
    if (message?.action !== "collectAdvertisingKeywordSerp"
      || typeof message.attemptId !== "string" || !UUID.test(message.attemptId)
      || Object.keys(message).some((key) => key !== "action" && key !== "attemptId")) {
      throw new Error("Invalid keyword SERP attempt");
    }
    return { attemptId: message.attemptId };
  }

  function parseResult(value, attemptId) {
    if (value?.attemptId !== attemptId || !["RUNNING", "COMPLETE", "FAILED"].includes(value.state)) {
      throw new Error("INVALID_SERP_OWNER_RESPONSE");
    }
    return value;
  }

  function result(attempt) {
    return {
      success: attempt.state === "COMPLETE",
      attemptId: attempt.attemptId,
      terminalState: attempt.state,
      itemCount: attempt.itemCount ?? 0,
      ...(attempt.state === "FAILED" ? { errorCode: attempt.errorCode, error: attempt.errorMessage } : {}),
    };
  }

  function create({ chrome, request, collect, sessions }) {
    const inFlight = new Map();
    const wire = root.KidItemSourcingAttemptWire.create({
      chrome, sourcePath: PATH, requestFailureMessage: "키워드 순위 저장 결과를 확인하지 못했습니다",
    });
    function connection(environmentId, attemptId) {
      const config = { apiBase: "", headers: { "Content-Type": "application/json" },
        request: (path, init) => request(environmentId, path, init) };
      return {
        read: () => wire.requestJson(config, `${PATH}/${encodeURIComponent(attemptId)}`, { method: "GET" })
          .then((value) => parseResult(value, attemptId)),
        submit: (attempt, submission) => wire.terminal(config, attempt, submission, (value) => parseResult(value, attemptId)),
      };
    }
    async function collectAttempt({ environmentId, attemptId }) {
      const { read, submit } = connection(environmentId, attemptId);
      const attempt = await read();
      if (attempt.state !== "RUNNING") return result(attempt);
      const plan = attempt.plan;
      if (!UUID.test(attempt.attemptToken || "")
        || plan?.sourceType !== "coupang_keyword_serp" || plan.parserVersion !== "keyword-serp-v1"
        || typeof plan.keyword !== "string" || !plan.keyword.trim()
        || !Number.isInteger(plan.maxPages) || plan.maxPages < 1 || plan.maxPages > 3
        || !Number.isFinite(Date.parse(attempt.expiresAt)) || Date.parse(attempt.expiresAt) <= Date.now()) {
        throw new Error("INVALID_OR_EXPIRED_SERP_PLAN");
      }
      await sessions.start({ environmentId, attemptId, producer: PRODUCER });
      let capture;
      try {
        capture = await collect(plan.keyword, plan.maxPages, { environmentId, attemptId });
      } catch (error) {
        capture = { success: false, error: error?.message };
      }
      if (capture?.cancelled) return result(await read());
      const submission = capture?.success === true
        ? { method: "PUT", suffix: "", body: {
          keyword: plan.keyword, capturedAt: new Date().toISOString(),
          pagesScanned: capture.pagesScanned, items: capture.items,
          pagination: capture.pagination, usedFallback: !!capture.usedFallback, wall: capture.wall || null,
        } }
        : { method: "POST", suffix: "/fail", body: wire.failure(
          { code: capture?.wall ? "SERP_PROVIDER_WALL" : "SERP_CAPTURE_FAILED", message: capture?.error },
          "SERP_CAPTURE_FAILED", "쿠팡 키워드 순위 수집에 실패했습니다.",
        ) };
      let terminal;
      try {
        terminal = await submit(attempt, submission);
      } catch (error) {
        // A missing ACK is not a source failure. Read this exact owner before
        // showing an outcome; never send a contradictory failure submission.
        terminal = await read().catch(() => null);
        if (terminal?.state === "RUNNING" && submission.method === "PUT" && [400, 422].includes(error?.status)) {
          // The owner rejected the payload before publication. Only this
          // definitive rejection permits a different, explicit failure result.
          terminal = await submit(attempt, { method: "POST", suffix: "/fail", body: wire.failure(
            { code: "SERP_RESPONSE_INVALID", message: error.message },
            "SERP_RESPONSE_INVALID", "키워드 순위 응답 형식이 올바르지 않습니다.",
          ) }).catch(() => null);
          terminal ??= await read().catch(() => null);
        }
        if (!terminal || terminal.state === "RUNNING") return {
          success: false, attemptId, terminalState: "RUNNING",
          errorCode: "SOURCE_RESULT_UNCONFIRMED", error: String(error?.message).slice(0, 300),
        };
      }
      if (terminal.state === "FAILED" && capture?.wall) {
        await sessions.requireAttention(attemptId, {
          reason: capture.wall === "captcha" ? "captcha" : "marketplace_login",
          message: terminal.errorMessage || capture.error || "쿠팡 수집 화면을 확인해주세요.",
        });
      } else if (terminal.state !== "RUNNING") {
        await sessions.cancel(attemptId, { closeManagedTab: true });
      }
      return result(terminal);
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
      let terminal;
      await sessions.cancel(attemptId, {
        closeManagedTab: true,
        ownerFailure: async () => {
          const attempt = await owner.read();
          terminal = attempt;
          if (attempt.state === "RUNNING") {
            try {
              terminal = await owner.submit(attempt, { method: "POST", suffix: "/fail", body: {
                code: "COLLECTION_CANCELLED", message: "키워드 순위 수집이 취소되었습니다.",
              } });
            } catch (error) {
              terminal = await owner.read().catch(() => null);
              if (!terminal || terminal.state === "RUNNING") throw error;
            }
          }
          return { accepted: terminal.state !== "RUNNING" };
        },
      });
      return result(terminal);
    }
    return Object.freeze({ run, cancel });
  }
  root.KidItemKeywordSerpSourceOwner = Object.freeze({ create, parseStart });
})(globalThis);
