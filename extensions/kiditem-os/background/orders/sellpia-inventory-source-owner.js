(function installSellpiaInventorySourceOwner(root) {
  "use strict";

  const SOURCE_PATH = "/api/inventory/sellpia-source/attempts";
  const PRODUCER = "inventory.sellpia";
  const SOURCE_ORIGIN = "https://kiditem.sellpia.com";
  const SOURCE_ACCOUNT_KEY = "kiditem";
  const PARSER_VERSION = "sellpia-inventory-v1";
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_UPLOAD_ATTEMPTS = 3;
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const TRIGGERS = new Set([
    "initial_snapshot",
    "ttl_expired",
    "same_hash_confirmation",
    "purchase_preflight",
    "manual_request",
    "retry",
  ]);

  function parseAction(message, action = "collectSellpiaInventory") {
    if (
      !message ||
      message.action !== action ||
      Object.keys(message).length !== 2 ||
      !UUID.test(message.attemptId || "")
    ) {
      throw new Error("Invalid Sellpia inventory source request");
    }
    return { attemptId: message.attemptId };
  }

  function boundedText(value, fallback, maximum) {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim();
    return normalized && normalized.length <= maximum ? normalized : fallback;
  }

  function parseAttempt(value, attemptId) {
    const plan = value?.plan;
    if (
      value?.attemptId !== attemptId ||
      !UUID.test(value?.attemptToken || "") ||
      !["RUNNING", "COMPLETE", "FAILED"].includes(value?.state) ||
      plan?.sourceType !== "sellpia_inventory" ||
      plan?.parserVersion !== PARSER_VERSION ||
      !["full", "inventory"].includes(plan?.scope) ||
      !TRIGGERS.has(plan?.trigger) ||
      plan?.sourceOrigin !== SOURCE_ORIGIN ||
      plan?.sourceAccountKey !== SOURCE_ACCOUNT_KEY ||
      !/^[1-9]\d*$/.test(String(plan?.generation || "")) ||
      value?.generation !== plan?.generation ||
      !Number.isFinite(Date.parse(value?.expiresAt || "")) ||
      (value?.actualCutoffAt !== null &&
        !Number.isFinite(Date.parse(value?.actualCutoffAt || ""))) ||
      (value?.contentChecksum !== null &&
        !/^[0-9a-f]{64}$/i.test(value?.contentChecksum || "")) ||
      (value?.fileName !== null && typeof value?.fileName !== "string") ||
      !Number.isInteger(value?.rowCount) ||
      value.rowCount < 0 ||
      (value?.errorCode !== null && typeof value?.errorCode !== "string") ||
      (value?.errorMessage !== null && typeof value?.errorMessage !== "string")
    ) {
      throw new Error("SELLPIA_INVENTORY_PLAN_INVALID");
    }
    if (value.state === "RUNNING" && Date.parse(value.expiresAt) <= Date.now()) {
      throw new Error("ATTEMPT_EXPIRED");
    }
    return value;
  }

  function outcome(attempt, extra = {}) {
    return {
      success: attempt?.state === "COMPLETE",
      attemptId: attempt?.attemptId,
      terminalState: attempt?.state,
      continuationRequired: attempt?.state === "RUNNING",
      ...(attempt?.state === "FAILED" && attempt.errorCode
        ? { errorCode: attempt.errorCode }
        : {}),
      ...(attempt?.state === "FAILED" && attempt.errorMessage
        ? { error: attempt.errorMessage }
        : {}),
      ...extra,
    };
  }

  function unavailable(attemptId, error) {
    return outcome(
      { attemptId, state: "RUNNING" },
      {
        continuationRequired: false,
        errorCode: "SOURCE_OWNER_UNAVAILABLE",
        error: String(error?.message || "Sellpia source owner is unavailable.").slice(0, 300),
      },
    );
  }

  async function isLocallyActive(sessions, attemptId, environmentId, allowUnstarted = false) {
    // Missing ownership means a fresh attempt, not a stopped attempt. The
    // common start/onStarted path owns admission; isActive is only consulted
    // once a persisted owner session exists.
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

  function cancelled(attemptId) {
    return {
      success: false,
      attemptId,
      terminalState: "RUNNING",
      continuationRequired: false,
      errorCode: "COLLECTION_CANCELLED",
      error: "Sellpia inventory collection was cancelled.",
    };
  }

  async function responseBody(response) {
    if (!response) return null;
    if (typeof response.json === "function") {
      try {
        return await response.json();
      } catch {
        // Fall through to the text/bytes shims used by extension tests.
      }
    }
    let text = null;
    if (typeof response.text === "function") {
      try {
        text = await response.text();
      } catch {
        text = null;
      }
    } else if (typeof response.arrayBuffer === "function") {
      try {
        text = new TextDecoder().decode(await response.arrayBuffer());
      } catch {
        text = null;
      }
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function requestError(response, body, fallback) {
    const error = new Error(
      boundedText(body?.message, `${fallback} (${response?.status || 0}).`, 300),
    );
    error.code = "SOURCE_OWNER_REQUEST_FAILED";
    if (Number.isInteger(response?.status)) error.status = response.status;
    return error;
  }

  async function sha256Hex(bytes) {
    if (!root.crypto?.subtle || typeof root.TextEncoder !== "function") {
      throw new Error("Sellpia snapshot checksum is unavailable");
    }
    const digest = await root.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function create(options) {
    const active = new Map();
    const wire = root.KidItemSourcingAttemptWire.create({
      chrome: options.chrome,
      sourcePath: SOURCE_PATH,
      requestFailureMessage: "Sellpia inventory owner request failed",
    });

    function config(environmentId) {
      return {
        apiBase: "",
        headers: { "Content-Type": "application/json" },
        request: (path, init) => options.request(environmentId, path, init),
      };
    }

    async function read(environmentId, attemptId) {
      const value = await wire.requestJsonWithRetry(
        config(environmentId),
        `${SOURCE_PATH}/${encodeURIComponent(attemptId)}`,
        { method: "GET" },
      );
      return parseAttempt(value, attemptId);
    }

    function collectionFor(environmentId, attemptId) {
      return {
        attemptId,
        environmentId,
        assertActive: () => isLocallyActive(options.sessions, attemptId, environmentId),
        isActive: () => isLocallyActive(options.sessions, attemptId, environmentId),
        attachTab: (tab, attachment = {}) => options.sessions.attachTab(attemptId, {
          tabId: tab.id,
          windowId: tab.windowId,
          closeOnCancel: attachment.owned !== false,
        }),
        detachTab: (tab, attachment = {}) => options.sessions.detachTab(attemptId, {
          tabId: tab.id,
          closeManagedTab: attachment.owned !== false,
        }),
        progress: (progress) => options.sessions.progress(attemptId, progress),
      };
    }

    async function finish(environmentId, attempt) {
      const session = await options.sessions.getOwned(attempt.attemptId, environmentId);
      if (
        attempt.state === "FAILED" &&
        attempt.errorCode !== "COLLECTION_CANCELLED" &&
        session?.attention
      ) return outcome(attempt);
      if (session) {
        try {
          await options.sessions.cancel(attempt.attemptId, { closeManagedTab: true });
        } catch {
          // The owner is already terminal; retain local correlation if Chrome
          // cannot close a managed tab right now.
        }
      }
      return outcome(attempt);
    }

    async function submitFailure(environmentId, attempt, body, terminalOptions = {}) {
      return wire.terminal(
        config(environmentId),
        attempt,
        { method: "POST", suffix: "/fail", body },
        (value) => parseAttempt(value, attempt.attemptId),
        terminalOptions,
      );
    }

    function formData(bytes, fileName) {
      const data = new root.FormData();
      data.append(
        "file",
        new root.Blob([bytes], { type: "application/json" }),
        fileName,
      );
      return data;
    }

    async function upload(environmentId, attempt, bytes, fileName, shouldContinue) {
      let lastError;
      for (let index = 0; index < MAX_UPLOAD_ATTEMPTS; index += 1) {
        if (!(await shouldContinue())) {
          const error = new Error("Sellpia inventory collection was cancelled.");
          error.code = "COLLECTION_CANCELLED";
          throw error;
        }
        try {
          const response = await options.request(
            environmentId,
            `${SOURCE_PATH}/${encodeURIComponent(attempt.attemptId)}/complete`,
            {
              method: "POST",
              headers: { "x-source-attempt-token": attempt.attemptToken },
              body: formData(bytes, fileName),
            },
          );
          const body = await responseBody(response);
          if (response?.ok) return parseAttempt(body, attempt.attemptId);
          const error = requestError(
            response,
            body,
            "Sellpia inventory owner completion failed",
          );
          lastError = error;
          if (!(error.status >= 500) || index === MAX_UPLOAD_ATTEMPTS - 1) {
            throw error;
          }
        } catch (error) {
          lastError = error;
          const retryable = !Number.isInteger(error?.status) || error.status >= 500;
          if (!retryable || index === MAX_UPLOAD_ATTEMPTS - 1) throw error;
        }
      }
      throw lastError || new Error("Sellpia inventory owner completion failed");
    }

    async function terminal(environmentId, work) {
      const requested = work.terminal;
      let directError = null;
      const cancellationOnly =
        requested.kind === "failure" && requested.body?.errorCode === "COLLECTION_CANCELLED";
      const terminalOptions = cancellationOnly
        ? {}
        : {
            shouldContinue: () => isLocallyActive(
              options.sessions,
              work.attemptId,
              environmentId,
            ),
            cancelCode: "COLLECTION_CANCELLED",
            cancelMessage: "Sellpia inventory collection was cancelled.",
          };
      try {
        if (
          !(await isLocallyActive(options.sessions, work.attemptId, environmentId)) &&
          !cancellationOnly
        ) {
          work.terminal = null;
          return cancelled(work.attemptId);
        }
        work.control = await read(environmentId, work.attemptId);
        if (work.control.state !== "RUNNING") {
          if (
            requested.kind === "complete" &&
            work.control.state === "COMPLETE" &&
            work.control.contentChecksum !== requested.contentChecksum
          ) {
            return unavailable(
              work.attemptId,
              new Error("Sellpia completion belongs to a different snapshot."),
            );
          }
          work.terminal = null;
          return finish(environmentId, work.control);
        }
        if (
          !(await isLocallyActive(options.sessions, work.attemptId, environmentId)) &&
          !cancellationOnly
        ) {
          work.terminal = null;
          return cancelled(work.attemptId);
        }
        if (requested.kind === "complete") {
          await upload(
            environmentId,
            work.control,
            requested.bytes,
            requested.fileName,
            terminalOptions.shouldContinue,
          );
        } else {
          await submitFailure(
            environmentId,
            work.control,
            requested.body,
            terminalOptions,
          );
        }
      } catch (error) {
        directError = error;
      }

      let observed;
      try {
        observed = await read(environmentId, work.attemptId);
      } catch (error) {
        return unavailable(work.attemptId, directError || error);
      }

      if (requested.kind === "complete") {
        if (
          observed.state === "COMPLETE" &&
          observed.contentChecksum === requested.contentChecksum
        ) {
          work.terminal = null;
          return finish(environmentId, observed);
        }
        if (observed.state === "FAILED") {
          work.terminal = null;
          return finish(environmentId, observed);
        }
        return unavailable(work.attemptId, directError || new Error("Sellpia completion is still running."));
      }

      if (observed.state !== "RUNNING") {
        work.terminal = null;
        return finish(environmentId, observed);
      }
      return unavailable(work.attemptId, directError || new Error("Sellpia failure is still running."));
    }

    function requestTerminal(environmentId, work, terminalRequest) {
      work.terminal ||= terminalRequest;
      if (work.terminalPromise) return work.terminalPromise;
      work.terminalPromise = terminal(environmentId, work)
        .finally(() => {
          work.terminalPromise = null;
          // An operator stop can settle after both the run and cancel returned.
          if (!work.promise && !work.terminal && active.get(environmentId) === work) {
            active.delete(environmentId);
          }
        });
      return work.terminalPromise;
    }

    async function execute(environmentId, attemptId, work) {
      let attempt = await read(environmentId, attemptId);
      work.control = attempt;
      if (work.terminal) return requestTerminal(environmentId, work, work.terminal);
      if (attempt.state !== "RUNNING") return finish(environmentId, attempt);

      for (const previous of await options.sessions.list(environmentId)) {
        if (previous.producer !== PRODUCER || previous.attemptId === attemptId) continue;
        const previousAttempt = await read(environmentId, previous.attemptId);
        if (previousAttempt.state === "RUNNING") {
          throw new Error("이전 셀피아 재고 수집이 아직 진행 중입니다. 그 수집이 끝난 뒤 다시 시작해 주세요.");
        }
        await finish(environmentId, previousAttempt);
      }

      if (!(await isLocallyActive(options.sessions, attemptId, environmentId, true))) {
        return cancelled(attemptId);
      }
      const started = await options.sessions.start({
        environmentId,
        attemptId,
        producer: PRODUCER,
      });
      if (started === null || started === false) return cancelled(attemptId);

      let collected;
      try {
        collected = await options.collect({
          ...collectionFor(environmentId, attemptId),
          plan: attempt.plan,
        });
      } catch (error) {
        collected = {
          success: false,
          errorCode: error?.code,
          error: error?.message,
        };
      }

      if (!(await isLocallyActive(options.sessions, attemptId, environmentId))) {
        const current = await read(environmentId, attemptId).catch(() => null);
        if (current && current.state !== "RUNNING") return finish(environmentId, current);
        return cancelled(attemptId);
      }

      let observed;
      try {
        observed = await read(environmentId, attemptId);
      } catch (error) {
        return unavailable(attemptId, error);
      }
      if (observed.state !== "RUNNING") return finish(environmentId, observed);
      work.control = observed;

      if (collected?.success !== true || !collected?.snapshot) {
        if (
          collected?.pendingLogin === true ||
          collected?.errorCode === "sellpia_login_required" ||
          collected?.attentionRequired === true
        ) {
          await options.sessions.requireAttention(attemptId, {
            reason: collected?.reason || "marketplace_login",
            message: collected?.error || "Sellpia login is required.",
          });
        }
        return requestTerminal(environmentId, work, {
          kind: "failure",
          body: {
            errorCode: boundedText(
              collected?.errorCode,
              "sellpia_inventory_collection_failed",
              100,
            ),
            errorMessage: boundedText(
              collected?.error,
              "Sellpia inventory collection failed.",
              300,
            ),
          },
        });
      }

      let bytes;
      let contentChecksum;
      try {
        const serialized = JSON.stringify(collected.snapshot);
        bytes = new root.TextEncoder().encode(serialized);
        if (!bytes.byteLength || bytes.byteLength > MAX_FILE_BYTES) {
          throw new Error("Sellpia inventory snapshot exceeds the file limit");
        }
        contentChecksum = await sha256Hex(bytes);
      } catch (error) {
        return requestTerminal(environmentId, work, {
          kind: "failure",
          body: {
            errorCode: "sellpia_invalid_workbook",
            errorMessage: boundedText(
              error?.message,
              "Sellpia inventory snapshot could not be uploaded.",
              300,
            ),
          },
        });
      }

      await options.sessions.progress(attemptId, {
        current: 1,
        total: 2,
        completed: 1,
        failed: 0,
        label: "Sellpia inventory snapshot collected · importing",
      });
      return requestTerminal(environmentId, work, {
        kind: "complete",
        bytes,
        contentChecksum,
        fileName: "sellpia-inventory-snapshot-v1.json",
      });
    }

    function run({ environmentId, attemptId }) {
      const current = active.get(environmentId);
      if (current) {
        if (current.attemptId !== attemptId) {
          return Promise.reject(new Error("이전 셀피아 재고 수집이 아직 진행 중입니다. 그 수집이 끝난 뒤 다시 시작해 주세요."));
        }
        if (current.promise) return current.promise;
      }
      const work = current || { attemptId, terminal: null, control: null };
      work.promise = Promise.resolve()
        .then(() => execute(environmentId, attemptId, work))
        .finally(() => {
          work.promise = null;
          if (active.get(environmentId) === work && !work.terminal) {
            active.delete(environmentId);
          }
        });
      active.set(environmentId, work);
      return work.promise;
    }

    async function cancel({ environmentId, attemptId }) {
      const current = active.get(environmentId);
      if (current && current.attemptId !== attemptId) {
        throw new Error("이전 셀피아 재고 수집이 아직 진행 중입니다. 그 수집이 끝난 뒤 다시 시작해 주세요.");
      }
      const work = current || { attemptId, terminal: null, control: null };
      active.set(environmentId, work);
      try {
        const attempt = await read(environmentId, attemptId);
        if (attempt.state !== "RUNNING") return finish(environmentId, attempt);
        return requestTerminal(environmentId, work, {
          kind: "failure",
          body: {
            errorCode: "COLLECTION_CANCELLED",
            errorMessage: "Sellpia inventory collection was cancelled.",
          },
        });
      } finally {
        if (!work.promise && !work.terminal && active.get(environmentId) === work) {
          active.delete(environmentId);
        }
      }
    }

    async function recover(environmentId) {
      if (active.has(environmentId)) return;
      for (const session of await options.sessions.list(environmentId)) {
        if (session.producer !== PRODUCER) continue;
        const attempt = await read(environmentId, session.attemptId);
        if (attempt.state !== "RUNNING") await finish(environmentId, attempt);
      }
    }

    return Object.freeze({ run, recover, cancel });
  }

  root.KidItemSellpiaInventorySourceOwner = Object.freeze({ create, parseAction });
})(globalThis);
