(function installKeywordSuggestionSourceOwner(root) {
  "use strict";

  const SOURCE_PATH = "/api/sourcing/workspace/keyword-suggestions/attempts";
  const PRODUCER = "sourcing.keyword_suggestion";
  const SOURCE_KEY = "coupang.keyword_suggestion";
  const SCOPE_KEY = "default";
  const MAX_RESULTS = 30;
  const CORRELATION_PREFIX = "kiditem_keyword_suggestion_attempt_v1";
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function keywordContract() {
    if (!root.KidItemWingKeywordContract) {
      throw new Error("Wing keyword contract is required");
    }
    return root.KidItemWingKeywordContract;
  }

  function boundedInteger(value) {
    if (typeof value === "boolean" || value === null || Array.isArray(value)) {
      return null;
    }
    if (typeof value === "object") return null;
    if (typeof value === "string" && !/^(?:0|[1-9]\d*)$/.test(value)) {
      return null;
    }
    const numeric = typeof value === "string" ? Number(value) : value;
    return Number.isInteger(numeric) && numeric >= 0 && numeric <= 2147483647
      ? numeric
      : null;
  }

  function parseInput(input) {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      typeof input.keyword !== "string" ||
      !Number.isInteger(input.maxResults) ||
      input.maxResults < 1 ||
      input.maxResults > MAX_RESULTS ||
      Object.keys(input).some((key) => !["keyword", "maxResults"].includes(key))
    ) {
      throw new Error("keyword_suggestion_source_input_invalid");
    }
    const [keyword] = keywordContract().parseBatchKeywords(
      [input.keyword],
      1,
      100,
    );
    return { keyword, maxResults: input.maxResults };
  }

  function parseStart(message) {
    if (
      !message ||
      typeof message !== "object" ||
      Array.isArray(message) ||
      message.action !== "collectSourcingKeywordSuggestions" ||
      Object.keys(message).some(
        (key) => !["action", "idempotencyKey", "keyword", "maxResults"].includes(key),
      ) ||
      typeof message.idempotencyKey !== "string" ||
      !message.idempotencyKey.trim() ||
      message.idempotencyKey.length > 300
    ) {
      throw new Error("keyword_suggestion_source_input_invalid");
    }
    return {
      idempotencyKey: message.idempotencyKey.trim(),
      input: parseInput({
        keyword: message.keyword,
        maxResults: message.maxResults,
      }),
    };
  }

  function sanitizeItems(items, maxResults) {
    const contract = keywordContract();
    const sanitized = [];
    const seen = new Set();
    for (const candidate of Array.isArray(items) ? items : []) {
      if (
        !candidate ||
        typeof candidate !== "object" ||
        !["coupang-autocomplete", "coupang-search-dom"].includes(
          candidate.source,
        )
      ) {
        continue;
      }
      let keyword;
      try {
        [keyword] = contract.parseBatchKeywords([candidate.keyword], 1, 100);
      } catch {
        continue;
      }
      const identity = contract.identity(keyword);
      if (seen.has(identity)) continue;
      seen.add(identity);
      sanitized.push({
        rank: sanitized.length + 1,
        keyword,
        source: candidate.source,
      });
      if (sanitized.length >= maxResults) break;
    }
    return sanitized;
  }

  function sanitizeTokens(tokens, maxResults) {
    const contract = keywordContract();
    const sanitized = [];
    const seen = new Set();
    for (const candidate of Array.isArray(tokens) ? tokens : []) {
      if (!candidate || typeof candidate !== "object") continue;
      let keyword;
      try {
        [keyword] = contract.parseBatchKeywords([candidate.keyword], 1, 100);
      } catch {
        continue;
      }
      const count = boundedInteger(candidate.count);
      const identity = contract.identity(keyword);
      if (count === null || count < 1 || seen.has(identity)) continue;
      seen.add(identity);
      sanitized.push({ keyword, count });
      if (sanitized.length >= maxResults) break;
    }
    return sanitized;
  }

  function create(options) {
    if (
      typeof options?.request !== "function" ||
      typeof options?.collect !== "function" ||
      typeof options?.sessions?.getOwned !== "function" ||
      typeof options.sessions.start !== "function" ||
      typeof options.sessions.cancel !== "function"
    ) {
      throw new Error("Keyword suggestion source-owner dependencies are required.");
    }
    const sessions = options.sessions;
    const active = new Map();
    const terminalSubmissions = new Map();
    const wire = root.KidItemSourcingAttemptWire.create({
      chrome: options.chrome,
      sourcePath: SOURCE_PATH,
      requestFailureMessage: "Keyword suggestion source owner request failed",
    });

    async function isActive(attemptId, environmentId) {
      if (typeof sessions.isActive === "function") {
        return sessions.isActive(attemptId, environmentId, PRODUCER);
      }
      const session = await sessions.getOwned(attemptId, environmentId).catch(() => null);
      return session?.producer === PRODUCER;
    }

    function stoppedOutcome(attemptId) {
      return {
        success: false,
        attemptId,
        state: "RUNNING",
        terminalState: "RUNNING",
        cancellationPending: true,
        errorCode: "COLLECTION_CANCELLED",
      };
    }

    function isCancellationTerminal(submission) {
      return submission?.method === "POST" &&
        submission?.suffix === "/fail" &&
        submission?.body?.code === "COLLECTION_CANCELLED";
    }

    function config(environmentId) {
      return {
        apiBase: "",
        headers: { "Content-Type": "application/json" },
        request: (path, init) => options.request(environmentId, path, init),
      };
    }

    function correlationKey(environmentId, attemptId) {
      return `${CORRELATION_PREFIX}:${environmentId}:${attemptId}`;
    }

    function requestKey(environmentId, idempotencyKey) {
      return `kiditem_keyword_suggestion_request_v1:${environmentId}:${idempotencyKey}`;
    }

    function publicStatus(attempt, expectedAttemptId) {
      if (
        attempt?.attemptId !== expectedAttemptId ||
        attempt.sourceKey !== SOURCE_KEY ||
        !["COMPLETE", "FAILED"].includes(attempt.state)
      ) {
        throw new Error("SOURCE_TERMINAL_INVALID");
      }
      return {
        success: attempt.state === "COMPLETE",
        attemptId: attempt.attemptId,
        state: attempt.state,
        errorCode: attempt.errorCode || null,
        warnings: Array.isArray(attempt.warnings) ? attempt.warnings : [],
      };
    }

    async function execute({ environmentId, idempotencyKey, input, key, cancelRequested }) {
      const connection = config(environmentId);
      const attempt = await wire.requestJson(connection, SOURCE_PATH, {
        method: "POST",
        headers: { ...connection.headers, "idempotency-key": idempotencyKey },
        body: JSON.stringify(input),
      });
      const correlation = correlationKey(environmentId, attempt?.attemptId);
      const previous = await wire.getCorrelation(correlation);
      let plan;
      try {
        if (
          attempt?.sourceKey !== SOURCE_KEY ||
          attempt.scopeKey !== SCOPE_KEY ||
          attempt.plan?.source !== SOURCE_KEY ||
          Object.keys(attempt.plan).some(
            (key) => !["source", "keyword", "maxResults"].includes(key),
          ) ||
          !UUID.test(attempt.attemptId) ||
          !UUID.test(attempt.attemptToken) ||
          !["RUNNING", "COMPLETE", "FAILED"].includes(attempt.state)
        ) {
          throw new Error();
        }
        plan = parseInput({
          keyword: attempt.plan.keyword,
          maxResults: attempt.plan.maxResults,
        });
        const contract = keywordContract();
        if (
          attempt.targetKey !== `keyword:${contract.identity(plan.keyword)}` ||
          contract.identity(input.keyword) !== contract.identity(plan.keyword) ||
          input.maxResults !== plan.maxResults ||
          (previous && previous.attemptId !== attempt.attemptId)
        ) {
          throw new Error();
        }
      } catch {
        throw new Error("SOURCE_PLAN_INVALID");
      }

      if (attempt.state !== "RUNNING") {
        terminalSubmissions.delete(key);
        await wire.clearCorrelation(correlation);
        return publicStatus(attempt, attempt.attemptId);
      }
      if (
        !Number.isFinite(Date.parse(attempt.expiresAt)) ||
        Date.parse(attempt.expiresAt) <= Date.now()
      ) {
        throw new Error("SOURCE_ATTEMPT_EXPIRED");
      }

      let terminal = terminalSubmissions.get(key);
      let cancellation = null;
      const cancel = () => {
        if (cancellation) return cancellation;
        const submission = {
          method: "POST",
          suffix: "/fail",
          body: {
            code: "COLLECTION_CANCELLED",
            message: "Keyword suggestion collection was cancelled by the user.",
          },
        };
        terminalSubmissions.set(key, submission);
        cancellation = wire.terminal(connection, attempt, submission, (value) =>
          publicStatus(value, attempt.attemptId),
        );
        return cancellation;
      };
      const running = active.get(environmentId);
      if (running) running.cancel = cancel;
      if (cancelRequested) {
        const result = await cancel();
        terminalSubmissions.delete(key);
        await wire.clearCorrelation(correlation);
        return result;
      }
      if (!terminal && previous) {
        // Suspension lost the in-memory submission. Never recollect within
        // that attempt; fail the exact server attempt instead.
        terminal = {
          method: "POST",
          suffix: "/fail",
          body: {
            code: "SOURCE_COLLECTION_INTERRUPTED",
            message: "Keyword suggestion collection was interrupted. Start a new attempt.",
          },
        };
      }
      await wire.setCorrelation(correlation, { attemptId: attempt.attemptId, idempotencyKey });

      if (!terminal) {
        await sessions.start({
          attemptId: attempt.attemptId,
          environmentId,
          producer: PRODUCER,
        });
        if (!(await isActive(attempt.attemptId, environmentId))) return stoppedOutcome(attempt.attemptId);
        let capture;
        try {
          capture = await options.collect({
            keyword: plan.keyword,
            maxResults: plan.maxResults,
            runId: attempt.attemptId,
            environmentId,
            cancellation: () => cancellation,
          });
        } catch {
          capture = null;
        }
        if (cancellation) {
          const result = await cancellation;
          terminalSubmissions.delete(key);
          await wire.clearCorrelation(correlation);
          return result;
        }
        if (!(await isActive(attempt.attemptId, environmentId))) {
          return stoppedOutcome(attempt.attemptId);
        }
        terminal = terminalSubmissions.get(key) || (
          capture?.success
            ? {
                method: "PUT",
                suffix: "",
                body: {
                  keyword: plan.keyword,
                  capturedAt: new Date().toISOString(),
                  items: sanitizeItems(capture.items, plan.maxResults),
                  productNameTokens: sanitizeTokens(
                    capture.productNameTokens,
                    plan.maxResults,
                  ),
                  warnings: Array.isArray(capture.warnings)
                    ? capture.warnings.filter((value) => typeof value === "string")
                    : [],
                },
              }
            : {
                method: "POST",
                suffix: "/fail",
                body: {
                  code: capture?.attentionRequired
                    ? "marketplace_login"
                    : "keyword_suggestion_collection_failed",
                  message: capture?.attentionRequired
                    ? "Coupang login is required before starting a new keyword suggestion attempt."
                    : "Keyword suggestion collection failed.",
                },
              }
        );
        terminalSubmissions.set(key, terminal);
      }

      const cancellationTerminal = isCancellationTerminal(terminal);
      if (!cancellationTerminal && !(await isActive(attempt.attemptId, environmentId))) {
        return stoppedOutcome(attempt.attemptId);
      }

      let result;
      try {
        result = await wire.terminal(
          connection,
          attempt,
          terminal,
          (value) => publicStatus(value, attempt.attemptId),
          {
            shouldContinue: () => cancellationTerminal || isActive(attempt.attemptId, environmentId),
          },
        );
      } catch (error) {
        if (!cancellationTerminal && error?.code === "COLLECTION_CANCELLED") {
          return stoppedOutcome(attempt.attemptId);
        }
        throw error;
      }
      terminalSubmissions.delete(key);
      await wire.clearCorrelation(correlation);
      return result;
    }

    function run({ environmentId, idempotencyKey, input, cancelRequested = false }) {
      if (typeof options.requireEnvironment === "function") {
        options.requireEnvironment(environmentId);
      }
      input = parseInput(input);
      const key = requestKey(environmentId, idempotencyKey);
      const fingerprint = JSON.stringify(input);
      const running = active.get(environmentId);
      if (running) {
        if (running.idempotencyKey !== idempotencyKey) {
          throw new Error("SOURCE_ATTEMPT_ALREADY_RUNNING");
        }
        if (running.fingerprint !== fingerprint) {
          throw new Error("SOURCE_IDEMPOTENCY_KEY_REUSED");
        }
        if (cancelRequested && running.cancel) return running.cancel();
        return running.promise;
      }
      const work = {
        idempotencyKey,
        fingerprint,
        promise: null,
        cancel: null,
      };
      work.promise = execute({
        environmentId,
        idempotencyKey,
        input,
        key,
        cancelRequested,
      }).then(async (result) => {
        if (!cancelRequested && !result?.cancellationPending) {
          const session = await sessions.getOwned(result.attemptId, environmentId);
          if (session?.producer === PRODUCER && !session.attention) {
            await sessions.cancel(result.attemptId, { closeManagedTab: true });
          }
        }
        return result;
      }).finally(() => {
        if (active.get(environmentId) === work) active.delete(environmentId);
      });
      active.set(environmentId, work);
      return work.promise;
    }

    async function cancel({ environmentId, attemptId }) {
      if (typeof options.requireEnvironment === "function") {
        options.requireEnvironment(environmentId);
      }
      const key = correlationKey(environmentId, attemptId);
      const correlation = await wire.getCorrelation(key);
      if (correlation?.attemptId !== attemptId || !correlation.idempotencyKey) {
        throw new Error("SOURCE_ATTEMPT_RECOVERY_IDENTITY_MISSING");
      }
      const current = await wire.requestJson(
        config(environmentId),
        `${SOURCE_PATH}/${encodeURIComponent(attemptId)}`,
        { method: "GET" },
      );
      const running = active.get(environmentId);
      const runningCancel = running?.idempotencyKey === correlation.idempotencyKey
        ? running.cancel
        : null;
      const result = await sessions.cancel(attemptId, {
        closeManagedTab: true,
        ownerFailure: async () => {
          if (current?.state !== "RUNNING") {
            return { accepted: ["COMPLETE", "FAILED"].includes(current?.state) };
          }
          if (runningCancel) {
            const terminal = await runningCancel();
            return { accepted: ["COMPLETE", "FAILED"].includes(terminal?.state) };
          }
          const terminal = await wire.terminal(
            config(environmentId),
            current,
            {
              method: "POST",
              suffix: "/fail",
              body: {
                code: "COLLECTION_CANCELLED",
                message: "Keyword suggestion collection was cancelled by the user.",
              },
            },
            (value) => publicStatus(value, attemptId),
          );
          return { accepted: ["COMPLETE", "FAILED"].includes(terminal?.state) };
        },
      });
      await wire.clearCorrelation(key);
      return result;
    }

    return Object.freeze({ run, cancel, parseInput, parseStart });
  }

  root.KidItemKeywordSuggestionSourceOwner = Object.freeze({
    create,
    parseInput,
    parseStart,
  });
})(globalThis);
