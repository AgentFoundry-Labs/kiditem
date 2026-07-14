(function installCollectionSession(global) {
  'use strict';

  const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
  const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
  const SECRET_KEY_PATTERN =
    /response|body|html|token|password|secret|cookie|credential|file|rows|payload/i;
  const storageMutationQueues = new Map();

  function emptyProgress() {
    return {
      current: 0,
      total: 0,
      completed: 0,
      failed: 0,
      label: null,
    };
  }

  function sanitizeInputIdentity(inputIdentity) {
    const sanitized = {};
    for (const [key, value] of Object.entries(inputIdentity || {})) {
      if (Object.keys(sanitized).length >= 20) break;
      if (
        key.length < 1 ||
        key.length > 80 ||
        SECRET_KEY_PATTERN.test(key)
      ) {
        continue;
      }
      const primitive =
        value === null ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.length <= 500);
      if (primitive) sanitized[key] = value;
    }
    return sanitized;
  }

  function enqueueStorageMutation(storageKey, operation) {
    const previous = storageMutationQueues.get(storageKey) || Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    storageMutationQueues.set(storageKey, tail);
    return result.finally(() => {
      if (storageMutationQueues.get(storageKey) === tail) {
        storageMutationQueues.delete(storageKey);
      }
    });
  }

  function create(options) {
    const chromeApi = options.chrome;
    const storageKey = options.storageKey;
    const webUrlPatterns = options.webUrlPatterns;
    const now = options.now || Date.now;

    function prune(sessions) {
      const cutoff = now() - RETENTION_MS;
      return Object.fromEntries(
        Object.entries(sessions).filter(([, session]) => {
          return !(
            TERMINAL_STATUSES.has(session.status) &&
            session.finishedAt !== null &&
            session.finishedAt < cutoff
          );
        }),
      );
    }

    async function writeSessions(sessions) {
      await chromeApi.storage.local.set({ [storageKey]: sessions });
    }

    async function readSessions() {
      const stored = await chromeApi.storage.local.get(storageKey);
      const sessions = stored[storageKey] || {};
      const retained = prune(sessions);
      if (Object.keys(retained).length !== Object.keys(sessions).length) {
        await writeSessions(retained);
      }
      return retained;
    }

    function toPublicView(session) {
      return {
        runId: session.runId,
        producer: session.producer,
        classification: session.classification,
        status: session.status,
        attempt: session.attempt,
        restartStrategy: session.restartStrategy,
        progress: { ...session.progress },
        inputIdentity: { ...session.inputIdentity },
        attention: session.attention ? { ...session.attention } : null,
        startedAt: session.startedAt,
        updatedAt: session.updatedAt,
        finishedAt: session.finishedAt,
      };
    }

    async function publish(view) {
      let tabs;
      try {
        tabs = await chromeApi.tabs.query({ url: webUrlPatterns });
      } catch {
        return;
      }
      await Promise.allSettled(
        tabs
          .filter((tab) => Number.isInteger(tab.id))
          .map((tab) =>
            chromeApi.scripting.executeScript({
              target: { tabId: tab.id },
              func(detail) {
                window.dispatchEvent(
                  new CustomEvent('kiditem:browser-collection-session', {
                    detail,
                  }),
                );
              },
              args: [view],
            }),
          ),
      );
    }

    function transition(runId, patch) {
      return enqueueStorageMutation(storageKey, async () => {
        const sessions = await readSessions();
        const current = sessions[runId];
        if (!current) return null;
        if (current.status === 'cancelled') return toPublicView(current);
        const resolvedPatch =
          typeof patch === 'function' ? patch(current) : patch;
        const next = {
          ...current,
          ...resolvedPatch,
          updatedAt: Math.max(now(), current.updatedAt + 1),
        };
        sessions[runId] = next;
        await writeSessions(prune(sessions));
        const publicView = toPublicView(next);
        await publish(publicView);
        return publicView;
      });
    }

    function start(input) {
      return enqueueStorageMutation(storageKey, async () => {
        const sessions = await readSessions();
        const timestamp = now();
        const session = {
          runId: input.runId,
          producer: input.producer,
          classification: input.classification,
          status: 'running',
          attempt: 1,
          restartStrategy: input.restartStrategy,
          progress: emptyProgress(),
          inputIdentity: sanitizeInputIdentity(input.inputIdentity),
          attention: null,
          startedAt: timestamp,
          updatedAt: timestamp,
          finishedAt: null,
        };
        sessions[input.runId] = session;
        await writeSessions(prune(sessions));
        const publicView = toPublicView(session);
        await publish(publicView);
        return publicView;
      });
    }

    async function attachTab(runId, tab) {
      const view = await transition(runId, {
        _managedTabId: tab.tabId,
        _managedWindowId: tab.windowId,
        _managedTabCloseOnRestart: tab.closeOnRestart !== false,
      });
      if (
        view?.status === 'cancelled' &&
        tab.closeOnRestart !== false &&
        Number.isInteger(tab.tabId)
      ) {
        await chromeApi.tabs.remove(tab.tabId).catch(() => undefined);
      }
      return view;
    }

    function progress(runId, nextProgress) {
      return transition(runId, {
        status: 'running',
        progress: { ...nextProgress },
        attention: null,
        finishedAt: null,
      });
    }

    function requireAttention(runId, attention) {
      return transition(runId, (current) => ({
        status: 'attention_required',
        attention: {
          reason: attention.reason,
          message: attention.message,
          canOpenTab:
            Number.isInteger(current._managedTabId) &&
            Number.isInteger(current._managedWindowId),
        },
        finishedAt: null,
      }));
    }

    function succeed(runId) {
      return transition(runId, {
        status: 'succeeded',
        attention: null,
        finishedAt: now(),
      });
    }

    function fail(runId) {
      return transition(runId, {
        status: 'failed',
        attention: null,
        finishedAt: now(),
      });
    }

    function cancel(runId, cancelOptions = {}) {
      return enqueueStorageMutation(storageKey, async () => {
        const sessions = await readSessions();
        const current = sessions[runId];
        if (!current) return null;

        if (
          cancelOptions.closeManagedTab === true &&
          Number.isInteger(current._managedTabId) &&
          current._managedTabCloseOnRestart !== false
        ) {
          await chromeApi.tabs.remove(current._managedTabId).catch(() => undefined);
        }

        const next = {
          ...current,
          status: 'cancelled',
          attention: null,
          updatedAt: Math.max(now(), current.updatedAt + 1),
          finishedAt: now(),
        };
        if (cancelOptions.closeManagedTab === true) {
          delete next._managedTabId;
          delete next._managedWindowId;
          delete next._managedTabCloseOnRestart;
        }
        sessions[runId] = next;
        await writeSessions(prune(sessions));
        const publicView = toPublicView(next);
        await publish(publicView);
        return publicView;
      });
    }

    function restart(runId, restartOptions = {}) {
      return enqueueStorageMutation(storageKey, async () => {
        const sessions = await readSessions();
        const current = sessions[runId];
        if (!current) return null;

        if (
          restartOptions.closeManagedTab === true &&
          Number.isInteger(current._managedTabId) &&
          current._managedTabCloseOnRestart !== false
        ) {
          await chromeApi.tabs.remove(current._managedTabId).catch(() => undefined);
        }

        const next = {
          ...current,
          status: 'running',
          attempt: current.attempt + 1,
          progress: emptyProgress(),
          attention: null,
          updatedAt: Math.max(now(), current.updatedAt + 1),
          finishedAt: null,
        };
        if (restartOptions.closeManagedTab === true) {
          delete next._managedTabId;
          delete next._managedWindowId;
          delete next._managedTabCloseOnRestart;
        }
        sessions[runId] = next;
        await writeSessions(prune(sessions));
        const publicView = toPublicView(next);
        await publish(publicView);
        return publicView;
      });
    }

    function get(runId) {
      return enqueueStorageMutation(storageKey, async () => {
        const sessions = await readSessions();
        return sessions[runId] ? toPublicView(sessions[runId]) : null;
      });
    }

    function list() {
      return enqueueStorageMutation(storageKey, async () => {
        const sessions = await readSessions();
        return Object.values(sessions).map(toPublicView);
      });
    }

    function openAttentionTab(runId) {
      return enqueueStorageMutation(storageKey, async () => {
        const sessions = await readSessions();
        const session = sessions[runId];
        if (!session || session.status !== 'attention_required') {
          throw new Error('Collection session does not require attention');
        }
        if (
          !Number.isInteger(session._managedTabId) ||
          !Number.isInteger(session._managedWindowId)
        ) {
          throw new Error('Collection session has no managed attention tab');
        }
        await chromeApi.tabs.update(session._managedTabId, { active: true });
        await chromeApi.windows.update(session._managedWindowId, {
          focused: true,
        });
        return toPublicView(session);
      });
    }

    return {
      start,
      attachTab,
      progress,
      requireAttention,
      succeed,
      fail,
      cancel,
      restart,
      get,
      list,
      openAttentionTab,
    };
  }

  global.KidItemCollectionSession = Object.freeze({ create });
})(globalThis);
