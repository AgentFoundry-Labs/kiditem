(function (root) {
  "use strict";
  const SOURCES = {
    serp: { action: "collectAdvertisingKeywordSerp", producer: "advertising.keyword_rank",
      type: "coupang_keyword_serp", parser: "keyword-serp-v1", maxPages: 3, errorPrefix: "SERP" },
    wing: { action: "collectAdvertisingWingRank", producer: "advertising.wing_rank",
      type: "coupang_wing_rank", parser: "wing-rank-v1", maxPages: 5, errorPrefix: "WING_RANK" },
    identity: { action: "collectAdvertisingSellerIdentities", producer: "advertising.competitor_seller_identity",
      type: "coupang_competitor_seller_identity", parser: "seller-identity-v1", errorPrefix: "SELLER_IDENTITY" },
  };
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function parseStart(message, kind) {
    if (!SOURCES[kind] || message?.action !== SOURCES[kind].action
      || typeof message.attemptId !== "string" || !UUID.test(message.attemptId)
      || Object.keys(message).some((key) => key !== "action" && key !== "attemptId")) {
      throw new Error("Invalid keyword rank attempt");
    }
    return { attemptId: message.attemptId };
  }

  function parseResult(value, attemptId) {
    if (value?.attemptId !== attemptId || !["RUNNING", "COMPLETE", "FAILED"].includes(value.state)) {
      throw new Error("INVALID_RANK_OWNER_RESPONSE");
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

  function create({ kind, chrome, request, collect, sessions }) {
    const source = SOURCES[kind];
    if (!source) throw new Error("Unknown rank source");
    const path = kind === "identity" ? "/api/ads/competitor-seller-identities/attempts"
      : `/api/ads/keyword-rank/${kind}/attempts`;
    const inFlight = new Map();
    const wire = root.KidItemSourcingAttemptWire.create({
      chrome, sourcePath: path, requestFailureMessage: "키워드 순위 저장 결과를 확인하지 못했습니다",
    });
    function connection(environmentId, attemptId) {
      const config = { apiBase: "", headers: { "Content-Type": "application/json" },
        request: (path, init) => request(environmentId, path, init) };
      return {
        read: () => wire.requestJson(config, `${path}/${encodeURIComponent(attemptId)}`, { method: "GET" })
          .then((value) => parseResult(value, attemptId)),
        submit: (attempt, submission) => wire.terminal(config, attempt, submission, (value) => parseResult(value, attemptId)),
      };
    }
    async function collectAttempt({ environmentId, attemptId }) {
      const { read, submit } = connection(environmentId, attemptId);
      const attempt = await read();
      if (attempt.state !== "RUNNING") return result(attempt);
      const plan = attempt.plan;
      const validTarget = kind === "identity"
        ? plan?.days === 30 && plan.limit === 200 && Array.isArray(plan.targets)
          && plan.targets.length <= 200 && plan.targets.every((target) =>
            typeof target?.keyword === "string" && target.keyword.trim()
            && typeof target.productKey === "string" && target.productKey.trim()
            && typeof target.link === "string")
        : typeof plan?.keyword === "string" && plan.keyword.trim()
          && Number.isInteger(plan.maxPages) && plan.maxPages >= 1 && plan.maxPages <= source.maxPages;
      if (!UUID.test(attempt.attemptToken || "")
        || plan?.sourceType !== source.type || plan.parserVersion !== source.parser
        || !validTarget
        || !Number.isFinite(Date.parse(attempt.expiresAt)) || Date.parse(attempt.expiresAt) <= Date.now()) {
        throw new Error(`INVALID_OR_EXPIRED_${source.errorPrefix}_PLAN`);
      }
      await sessions.start({ environmentId, attemptId, producer: source.producer });
      let capture;
      try {
        capture = kind === "identity"
          ? await collect(plan.targets, { environmentId, attemptId, expiresAt: attempt.expiresAt })
          : await collect(plan.keyword, plan.maxPages, { environmentId, attemptId });
      } catch (error) {
        capture = { success: false, error: error?.message };
      }
      if (capture?.cancelled) return result(await read());
      const submission = capture?.success === true
        ? { method: "PUT", suffix: "", body: kind === "identity" ? {
          capturedAt: new Date().toISOString(), identities: capture.identities,
        } : {
          keyword: plan.keyword, capturedAt: new Date().toISOString(),
          pagesScanned: capture.pagesScanned, items: capture.items,
          ...(kind === "wing" ? {
            collectedCount: capture.collectedCount, totalResults: capture.totalResults, proof: capture.proof,
          } : { pagination: capture.pagination, usedFallback: !!capture.usedFallback, wall: capture.wall || null }),
        } }
        : { method: "POST", suffix: "/fail", body: wire.failure(
          { code: `${source.errorPrefix}_${capture?.wall || capture?.attentionRequired ? "PROVIDER_WALL" : "CAPTURE_FAILED"}`, message: capture?.error },
          `${source.errorPrefix}_CAPTURE_FAILED`, "쿠팡 키워드 순위 수집에 실패했습니다.",
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
            { code: `${source.errorPrefix}_RESPONSE_INVALID`, message: error.message },
            `${source.errorPrefix}_RESPONSE_INVALID`, "키워드 순위 응답 형식이 올바르지 않습니다.",
          ) }).catch(() => null);
          terminal ??= await read().catch(() => null);
        }
        if (!terminal || terminal.state === "RUNNING") return {
          success: false, attemptId, terminalState: "RUNNING",
          errorCode: "SOURCE_RESULT_UNCONFIRMED", error: String(error?.message).slice(0, 300),
        };
      }
      if (terminal.state === "FAILED" && (capture?.wall || capture?.attentionRequired)) {
        // Wing already recorded its precise reason (including rate limits).
        if (!capture.attentionRequired) await sessions.requireAttention(attemptId, {
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
    async function fail({ environmentId, attemptId, code, message }) {
      const session = await sessions.getOwned(attemptId, environmentId);
      if (session && session.producer !== source.producer) throw new Error("RANK_SOURCE_SESSION_MISMATCH");
      const owner = connection(environmentId, attemptId);
      let terminal;
      const ownerFailure = async () => {
        const attempt = await owner.read();
        if (attempt.plan?.sourceType !== source.type || attempt.plan.parserVersion !== source.parser) {
          throw new Error("RANK_SOURCE_PLAN_MISMATCH");
        }
        terminal = attempt;
        if (attempt.state === "RUNNING") {
          try {
            terminal = await owner.submit(attempt, { method: "POST", suffix: "/fail", body: { code, message } });
          } catch (error) {
            terminal = await owner.read().catch(() => null);
            if (!terminal || terminal.state === "RUNNING") throw error;
          }
        }
        return { accepted: terminal.state !== "RUNNING" };
      };
      if (session) await sessions.cancel(attemptId, { closeManagedTab: true, ownerFailure });
      else await ownerFailure();
      return result(terminal);
    }
    async function cancel({ environmentId, attemptId }) {
      const session = await sessions.getOwned(attemptId, environmentId);
      if (session?.producer !== source.producer) return null;
      return fail({ environmentId, attemptId, code: "COLLECTION_CANCELLED", message: "키워드 순위 수집이 취소되었습니다." });
    }
    return Object.freeze({ run, cancel, fail });
  }
  root.KidItemKeywordRankSourceOwner = Object.freeze({ create, parseStart });
})(globalThis);
