(function initializeWebAppCollectionLifetime(root) {
  "use strict";

  const DEFAULT_ENVIRONMENT_IDS = ["local", "office"];
  const ENVIRONMENT_PROFILE_STORAGE_KEY = "kiditem_environment_profiles_v1";

  function errorMessage(error) {
    return String(error?.message || error || "Collection lifetime cleanup failed").slice(0, 500);
  }

  function cancellationError(environmentId) {
    const error = new Error("KidItem web app is not open for this environment");
    error.code = "COLLECTION_CANCELLED";
    error.environmentId = environmentId;
    return error;
  }

  function create(options = {}) {
    const chromeApi = options.chrome || root.chrome;
    const environmentContext = options.environmentContext;
    const authContext = options.authContext;
    const sessions = options.sessions;
    const domains = options.domains;
    const keepAlive = options.keepAlive || {
      during: (operation) => Promise.resolve(operation),
    };
    if (
      !chromeApi?.tabs?.onRemoved ||
      !environmentContext ||
      !sessions ||
      !domains
    ) {
      throw new Error("Web-app collection lifetime dependencies are required");
    }

    const environmentIds = Array.isArray(environmentContext.environmentIds) &&
      environmentContext.environmentIds.length > 0
      ? [...environmentContext.environmentIds]
      : DEFAULT_ENVIRONMENT_IDS;
    const cleanupByEnvironment = new Map();
    const pendingRetryByEnvironment = new Map();
    const ownerCancellationByAttempt = new Map();
    let installed = false;
    let initializationPromise = null;

    function registeredDomains() {
      if (typeof domains.list !== "function") return [];
      return domains.list();
    }

    function isEnvironmentWebTab(environmentId, tab) {
      const expectedOrigin = environmentContext.requireEnvironment(environmentId).webOrigin;
      return [tab?.url, tab?.pendingUrl].some((candidate) => {
        if (typeof candidate !== "string" || candidate.length === 0) return false;
        try {
          return new URL(candidate).origin === expectedOrigin;
        } catch {
          return false;
        }
      });
    }

    async function queryPresence(environmentId) {
      try {
        const tabs = await environmentContext.queryWebTabs(environmentId);
        return {
          known: true,
          hasApp: Array.isArray(tabs) && tabs.some((tab) =>
            isEnvironmentWebTab(environmentId, tab),
          ),
        };
      } catch {
        // A failed query is not evidence that the last app tab closed.
        return { known: false, hasApp: false };
      }
    }

    function routeSessionCancellation(session, environmentId) {
      const key = `${environmentId}:${session?.attemptId || ""}`;
      const existing = ownerCancellationByAttempt.get(key);
      if (existing) return existing;
      const domain = domains.forProducer(session?.producer);
      const cancel = domain?.cancelCollectionSession;
      const route = Promise.resolve().then(() => {
        if (typeof cancel !== "function") {
          throw new Error("Collection producer does not support cancellation");
        }
        return cancel(session.attemptId, environmentId);
      });
      ownerCancellationByAttempt.set(key, route);
      route.finally(() => {
        if (ownerCancellationByAttempt.get(key) === route) {
          ownerCancellationByAttempt.delete(key);
        }
      }).catch(() => undefined);
      return route;
    }

    async function requestSessionCancellation(session, environmentId) {
      if (typeof sessions.requestCancellation !== "function") {
        throw new Error("Collection session cancellation fence is unavailable");
      }
      return sessions.requestCancellation(session.attemptId, environmentId);
    }

    async function runAdditionalCollectionsHook(environmentId, hookName) {
      const results = await Promise.allSettled(
        registeredDomains()
          .filter((domain) => typeof domain?.[hookName] === "function")
          .map((domain) => Promise.resolve().then(() =>
            domain[hookName](environmentId),
          )),
      );
      // `false` is a deliberate domain result: its local cancellation fence
      // exists, but the owner could not finish cleanup yet (for example while
      // auth/HTTP is unavailable). Do not turn that state into success.
      return results.every((result) =>
        result.status === "fulfilled" && result.value !== false,
      );
    }

    async function cancelAdditionalCollections(environmentId) {
      return runAdditionalCollectionsHook(environmentId, "cancelAdditionalCollections");
    }

    async function retryAdditionalCollections(environmentId) {
      return runAdditionalCollectionsHook(environmentId, "retryAdditionalCollections");
    }

    async function beginAdditionalCancellation(environmentId) {
      try {
        return await cancelAdditionalCollections(environmentId);
      } catch {
        return false;
      }
    }

    async function beginAdditionalRetry(environmentId) {
      try {
        return await retryAdditionalCollections(environmentId);
      } catch {
        return false;
      }
    }

    async function cancelSessions(
      environmentId,
      targetSessions,
      includeAdditional,
      { additionalSettledPromise, preFences } = {},
    ) {
      // Begin domain-owned non-session fencing before reading or closing any
      // session tab. The hook must establish its local stop state before its
      // own tab close or owner HTTP work can become slow.
      const additionalPromise = includeAdditional
        ? additionalSettledPromise || beginAdditionalCancellation(environmentId)
        : Promise.resolve(true);
      const sessionsToCancel = Array.isArray(targetSessions)
        ? targetSessions.filter((session) => session?.environmentId === environmentId)
        : [];

      // Fence and route each attempt independently. A hung close for one
      // managed tab therefore cannot delay fencing or owner cancellation for
      // another attempt in the same environment.
      const fenceResults = [];
      const ownerResults = await Promise.allSettled(
        sessionsToCancel.map(async (session, index) => {
          let fenceResult;
          try {
            const value = await (
              preFences?.get(session.attemptId) ||
              requestSessionCancellation(session, environmentId)
            );
            fenceResult = { status: "fulfilled", value };
          } catch (reason) {
            fenceResult = { status: "rejected", reason };
          }
          fenceResults[index] = fenceResult;
          // A stale snapshot was already finalized by another owner path. It
          // needs no second route; a failed tab close still routes so the
          // source owner can release its canonical attempt.
          if (fenceResult.status === "fulfilled" && fenceResult.value === null) {
            return null;
          }
          return routeSessionCancellation(session, environmentId);
        }),
      );

      const additionalSettled = await additionalPromise;
      return {
        settled:
          fenceResults.every((result) => result.status === "fulfilled") &&
          ownerResults.every((result) => result.status === "fulfilled") &&
          additionalSettled,
      };
    }

    async function cleanupEnvironmentNow(environmentId) {
      // Start non-session fencing before the storage snapshot. A storage read
      // or a managed-tab close must never postpone this domain-local fence.
      const additionalSettledPromise = beginAdditionalCancellation(environmentId);
      let activeSessions;
      try {
        activeSessions = await sessions.list(environmentId);
      } catch {
        activeSessions = [];
      }
      return cancelSessions(environmentId, activeSessions, true, {
        additionalSettledPromise,
      });
    }

    function cleanupEnvironment(environmentId) {
      const existing = cleanupByEnvironment.get(environmentId);
      if (existing) return existing;
      const cleanup = keepAlive.during(cleanupEnvironmentNow(environmentId));
      cleanupByEnvironment.set(environmentId, cleanup);
      cleanup.finally(() => {
        if (cleanupByEnvironment.get(environmentId) === cleanup) {
          cleanupByEnvironment.delete(environmentId);
        }
      }).catch(() => undefined);
      return cleanup;
    }

    async function retryPendingCancellationsNow(environmentId) {
      // This hook is intentionally separate from cancelAdditionalCollections:
      // the latter fences every currently active non-session run, while this
      // seam may run after a new run has started. Domains must retry only the
      // non-session cleanup they fenced earlier.
      const additionalRetryPromise = beginAdditionalRetry(environmentId);
      let requests;
      try {
        requests = await sessions.listCancellationRequests(environmentId);
      } catch {
        await additionalRetryPromise;
        return { settled: false };
      }
      if (!Array.isArray(requests) || requests.length === 0) {
        return { settled: await additionalRetryPromise };
      }
      const requested = await persistedCancellationSessions(environmentId, requests);
      const result = await cancelSessions(environmentId, requested, false);
      const additionalSettled = await additionalRetryPromise;
      if (result.settled && additionalSettled &&
        (await remainingCancellationRequests(environmentId)) > 0) {
        return { settled: false };
      }
      return { ...result, settled: result.settled && additionalSettled };
    }

    function retryPendingCancellations(environmentId) {
      const existing = pendingRetryByEnvironment.get(environmentId);
      if (existing) return existing;
      const retry = keepAlive.during(retryPendingCancellationsNow(environmentId));
      pendingRetryByEnvironment.set(environmentId, retry);
      retry.finally(() => {
        if (pendingRetryByEnvironment.get(environmentId) === retry) {
          pendingRetryByEnvironment.delete(environmentId);
        }
      }).catch(() => undefined);
      return retry;
    }

    async function handleAppTabPresence() {
      const connected = await verifiedConnectedEnvironmentIds();
      await Promise.all(
        environmentIds.map(async (environmentId) => {
          const presence = await queryPresence(environmentId);
          if (presence.known && presence.hasApp && connected.has(environmentId)) {
            // Reopening the app retries only an already-fenced owner
            // cancellation. It never invokes recovery or starts a stopped run.
            await retryPendingCancellations(environmentId);
          }
        }),
      );
    }

    async function handleTabRemoved() {
      await Promise.all(
        environmentIds.map(async (environmentId) => {
          const presence = await queryPresence(environmentId);
          if (presence.known && !presence.hasApp) {
            await cleanupEnvironment(environmentId);
          }
        }),
      );
    }

    async function ensureSessionCanRun(started) {
      const environmentId = started?.environmentId;
      if (!environmentIds.includes(environmentId)) {
        throw new Error("Collection environment is required");
      }
      const presence = await queryPresence(environmentId);
      if (!presence.known || presence.hasApp) return true;

      // Admission can finish after tabs.onRemoved observed the last tab. Start
      // the local fence before touching the coalesced cleanup: that cleanup
      // may already have captured its session snapshot, or may be waiting on
      // a slow owner route. The new attempt is always fenced independently.
      const directFence = requestSessionCancellation(started, environmentId);
      cleanupEnvironment(environmentId);
      await cancelSessions(environmentId, [started], false, {
        preFences: new Map([[started.attemptId, directFence]]),
      });
      throw cancellationError(environmentId);
    }

    async function verifiedConnectedEnvironmentIds() {
      if (typeof authContext?.connectedEnvironmentIds !== "function") {
        return new Set();
      }
      try {
        const connected = await authContext.connectedEnvironmentIds();
        return new Set(Array.isArray(connected) ? connected : []);
      } catch {
        return new Set();
      }
    }

    async function handleEnvironmentProfileChange(changes, areaName) {
      if (areaName !== "local" || !changes?.[ENVIRONMENT_PROFILE_STORAGE_KEY]) return;
      // The storage event is only the handoff trigger. Read connection state
      // through the authenticated source-owner context so a tab-created event
      // that precedes token handoff cannot consume the retry prematurely.
      const connected = await verifiedConnectedEnvironmentIds();
      await Promise.all(
        environmentIds
          .filter((environmentId) => connected.has(environmentId))
          .map(async (environmentId) => {
            const presence = await queryPresence(environmentId);
            if (presence.known && presence.hasApp) {
              await retryPendingCancellations(environmentId);
            }
          }),
      );
    }

    async function persistedCancellationSessions(environmentId, requests) {
      let activeSessions;
      try {
        activeSessions = await sessions.list(environmentId);
      } catch {
        activeSessions = [];
      }
      const requestedAttempts = new Set(
        requests
          .filter((request) => request?.environmentId === environmentId)
          .map((request) => request.attemptId),
      );
      return activeSessions.filter((session) => requestedAttempts.has(session.attemptId));
    }

    async function remainingCancellationRequests(environmentId) {
      try {
        const remaining = await sessions.listCancellationRequests(environmentId);
        return Array.isArray(remaining) ? remaining.length : 0;
      } catch {
        return Number.POSITIVE_INFINITY;
      }
    }

    async function reconcileStartup() {
      let requests = [];
      try {
        requests = await sessions.listCancellationRequests();
      } catch {
        // Keep startup conservative: without the local fence inventory there
        // is nothing safe to auto-recover.
        requests = null;
      }

      const presenceEntries = await Promise.all(
        environmentIds.map(async (environmentId) => [
          environmentId,
          await queryPresence(environmentId),
        ]),
      );
      const presenceByEnvironment = new Map(presenceEntries);
      const connected = await verifiedConnectedEnvironmentIds();
      const cleanupSettled = new Map();

      for (const environmentId of environmentIds) {
        const presence = presenceByEnvironment.get(environmentId);
        let result = { settled: false };
        if (presence?.known && !presence.hasApp) {
          // A service-worker restart can miss the final onRemoved event. A
          // successful zero-tab observation therefore fences every session,
          // including sessions without a persisted request yet.
          result = await cleanupEnvironment(environmentId);
        } else if (requests) {
          const requested = await persistedCancellationSessions(environmentId, requests);
          if (connected.has(environmentId)) {
            // Use the same verified-handoff retry seam as tab-created and
            // auth-profile events. It also retries a domain's already-fenced
            // non-session cleanup when there are no session requests.
            result = await retryPendingCancellations(environmentId);
          } else if (requested.length > 0) {
            // Keep the durable fence until the verified auth handoff seam says
            // owner HTTP is available. A visible app tab alone is not enough.
            result = { settled: false };
          } else {
            result = { settled: true };
          }
          if (result.settled && (await remainingCancellationRequests(environmentId)) > 0) {
            result = { settled: false };
          }
        }
        cleanupSettled.set(environmentId, result.settled === true);
      }

      // Recovery is deliberately the final phase. It only runs for a known
      // open environment whose persisted stop cleanup has settled; stopped
      // attempts are never resumed automatically.
      if (requests) {
        for (const environmentId of environmentIds) {
          const presence = presenceByEnvironment.get(environmentId);
          if (
            !presence?.known ||
            !presence.hasApp ||
            !cleanupSettled.get(environmentId) ||
            !connected.has(environmentId)
          ) {
            continue;
          }
          const recoveryResults = await Promise.allSettled(
            registeredDomains()
              .filter((domain) => typeof domain?.recoverCollections === "function")
              .map((domain) => domain.recoverCollections(environmentId)),
          );
          if (recoveryResults.some((result) => result.status === "rejected")) {
            // Recovery errors are isolated per domain. There is no generic
            // retry queue here; the domain owns its next explicit recovery.
            continue;
          }
        }
      }

      return { presence: presenceByEnvironment, cleanupSettled };
    }

    function initialize() {
      if (initializationPromise) return initializationPromise;
      initializationPromise = keepAlive.during(reconcileStartup());
      return initializationPromise;
    }

    function install() {
      if (installed) return;
      installed = true;
      // Register synchronously. Only a verified zero-tab observation from a
      // removal event or startup reconciliation drives closure cleanup;
      // created/updated and auth-profile events only retry already-fenced
      // cancellations. Visibility, focus, unload and UI messages are not
      // lifetime signals.
      chromeApi.tabs.onRemoved.addListener(() => {
        keepAlive.during(handleTabRemoved()).catch((error) => {
          console.error("[KIDITEM] web-app lifetime cleanup failed:", errorMessage(error));
        });
      });
      const handlePresenceEvent = () => {
        keepAlive.during(handleAppTabPresence()).catch((error) => {
          console.error("[KIDITEM] web-app cancellation retry failed:", errorMessage(error));
        });
      };
      chromeApi.tabs.onCreated?.addListener(handlePresenceEvent);
      chromeApi.tabs.onUpdated?.addListener(handlePresenceEvent);
      chromeApi.storage?.onChanged?.addListener((changes, areaName) => {
        keepAlive.during(handleEnvironmentProfileChange(changes, areaName)).catch((error) => {
          console.error("[KIDITEM] web-app auth handoff retry failed:", errorMessage(error));
        });
      });
    }

    return Object.freeze({
      ensureSessionCanRun,
      initialize,
      install,
      reconcile: initialize,
    });
  }

  root.KidItemWebAppCollectionLifetime = Object.freeze({ create });
})(globalThis);
