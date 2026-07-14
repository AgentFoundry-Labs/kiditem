(function installCollectionSession(global) {
  'use strict';

  const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
  const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
  const SECRET_KEY_PATTERN =
    /token|password|secret|cookie|credential|file|rows|payload/i;

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
    return Object.fromEntries(
      Object.entries(inputIdentity || {}).filter(
        ([key]) => !SECRET_KEY_PATTERN.test(key),
      ),
    );
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
      const tabs = await chromeApi.tabs.query({ url: webUrlPatterns });
      await Promise.all(
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

    async function transition(runId, patch) {
      const sessions = await readSessions();
      const current = sessions[runId];
      if (!current) return null;
      const next = { ...current, ...patch, updatedAt: now() };
      sessions[runId] = next;
      await writeSessions(prune(sessions));
      const publicView = toPublicView(next);
      await publish(publicView);
      return publicView;
    }

    async function start(input) {
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
    }

    function attachTab(runId, tab) {
      return transition(runId, {
        _managedTabId: tab.tabId,
        _managedWindowId: tab.windowId,
      });
    }

    function progress(runId, nextProgress) {
      return transition(runId, {
        status: 'running',
        progress: { ...nextProgress },
        attention: null,
        finishedAt: null,
      });
    }

    async function requireAttention(runId, attention) {
      const sessions = await readSessions();
      const current = sessions[runId];
      if (!current) return null;
      return transition(runId, {
        status: 'attention_required',
        attention: {
          reason: attention.reason,
          message: attention.message,
          canOpenTab:
            Number.isInteger(current._managedTabId) &&
            Number.isInteger(current._managedWindowId),
        },
        finishedAt: null,
      });
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

    function cancel(runId) {
      return transition(runId, {
        status: 'cancelled',
        attention: null,
        finishedAt: now(),
      });
    }

    async function restart(runId) {
      const sessions = await readSessions();
      const current = sessions[runId];
      if (!current) return null;
      return transition(runId, {
        status: 'running',
        attempt: current.attempt + 1,
        progress: emptyProgress(),
        attention: null,
        finishedAt: null,
      });
    }

    async function get(runId) {
      const sessions = await readSessions();
      return sessions[runId] ? toPublicView(sessions[runId]) : null;
    }

    async function list() {
      const sessions = await readSessions();
      return Object.values(sessions).map(toPublicView);
    }

    async function openAttentionTab(runId) {
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

