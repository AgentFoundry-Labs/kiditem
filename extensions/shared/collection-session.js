(function installCollectionSession(global) {
  'use strict';

  const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
  const MAX_PROGRESS_COUNT = 1_000_000;
  const ATTENTION_REASONS = new Set([
    'extension_missing',
    'extension_outdated',
    'kiditem_auth',
    'marketplace_login',
    'captcha',
    'permission',
    'background_timeout',
    'rate_limited',
    'manual_confirmation',
    'unknown',
  ]);
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

  function cloneProgress(progress) {
    return {
      current: progress.current,
      total: progress.total,
      completed: progress.completed,
      failed: progress.failed,
      label: progress.label ?? null,
    };
  }

  function isValidAttemptId(attemptId) {
    return typeof attemptId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        attemptId,
      );
  }

  function assertAttemptId(attemptId) {
    if (!isValidAttemptId(attemptId)) {
      throw new Error('Owner attempt ID is required');
    }
    return attemptId;
  }

  function assertProgress(progress) {
    const value = progress || {};
    const counts = ['current', 'total', 'completed', 'failed'];
    for (const key of counts) {
      if (
        !Number.isInteger(value[key]) ||
        value[key] < 0 ||
        value[key] > MAX_PROGRESS_COUNT
      ) {
        throw new Error('Invalid progress bounds');
      }
    }
    if (
      value.current > value.total ||
      value.completed + value.failed > value.total
    ) {
      throw new Error('Invalid progress bounds');
    }
    if (value.label !== null && value.label !== undefined) {
      if (typeof value.label !== 'string' || value.label.length > 300) {
        throw new Error('Invalid progress label');
      }
    }
    return {
      current: value.current,
      total: value.total,
      completed: value.completed,
      failed: value.failed,
      label: value.label ?? null,
    };
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
    const environmentContext = options.environmentContext || null;
    const now = options.now || Date.now;

    function requireEnvironmentId(environmentId) {
      if (environmentId !== 'local' && environmentId !== 'office') {
        throw new Error('Collection environment is required');
      }
      environmentContext?.requireEnvironment(environmentId);
      return environmentId;
    }

    function prune(sessions) {
      const cutoff = now() - RETENTION_MS;
      return Object.fromEntries(
        Object.entries(sessions).filter(([, session]) => {
          return (
            isValidAttemptId(session?.attemptId) &&
            typeof session.producer === 'string' &&
            session.progress &&
            (!Number.isInteger(session.updatedAt) || session.updatedAt >= cutoff)
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
      const view = {
        attemptId: session.attemptId,
        producer: session.producer,
        progress: cloneProgress(session.progress),
        attention: session.attention ? { ...session.attention } : null,
      };
      if (session.environmentId !== undefined) {
        view.environmentId = session.environmentId;
      }
      return view;
    }

    function clonePublicView(session) {
      return toPublicView(session);
    }

    async function publish(view) {
      if (environmentContext) {
        try {
          await environmentContext.publish(
            view.environmentId,
            'kiditem:browser-collection-session',
            view,
          );
        } catch {
          // Persistence is the source of truth when a web tab is unavailable.
        }
        return;
      }
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
              func: function publishCollectionSession(detail) {
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

    function transition(attemptId, patch) {
      return enqueueStorageMutation(storageKey, async () => {
        const sessions = await readSessions();
        const current = sessions[attemptId];
        if (!current) return null;
        const resolvedPatch =
          typeof patch === 'function' ? patch(current) : patch;
        const next = {
          ...current,
          ...resolvedPatch,
          updatedAt: Math.max(now(), current.updatedAt + 1),
        };
        if (next.progress) next.progress = assertProgress(next.progress);
        sessions[attemptId] = next;
        await writeSessions(prune(sessions));
        const publicView = toPublicView(next);
        await publish(publicView);
        return publicView;
      });
    }

    function start(input) {
      return enqueueStorageMutation(storageKey, async () => {
        const sessions = await readSessions();
        const attemptId = assertAttemptId(input?.attemptId);
        const producer = input?.producer;
        if (typeof producer !== 'string' || producer.length === 0) {
          throw new Error('Collection producer is required');
        }
        const environmentId =
          input.environmentId === undefined
            ? undefined
            : requireEnvironmentId(input.environmentId);
        const existing = sessions[attemptId];
        if (existing) {
          if (
            existing.producer !== producer ||
            existing.environmentId !== environmentId
          ) {
            throw new Error('Owner attempt is already used by another collection');
          }
          const resumed = { ...existing, updatedAt: Math.max(now(), existing.updatedAt) };
          sessions[attemptId] = resumed;
          await writeSessions(prune(sessions));
          return clonePublicView(resumed);
        }
        const timestamp = now();
        const session = {
          ...(environmentId === undefined ? {} : { environmentId }),
          attemptId,
          producer,
          progress: emptyProgress(),
          attention: null,
          updatedAt: timestamp,
        };
        sessions[attemptId] = session;
        await writeSessions(prune(sessions));
        const publicView = toPublicView(session);
        await publish(publicView);
        return publicView;
      });
    }

    async function removeManagedTab(tabId) {
      try {
        await chromeApi.tabs.remove(tabId);
        return;
      } catch {
        let tabStillExists = true;
        try {
          const tabs = await chromeApi.tabs.query({});
          tabStillExists = tabs.some((tab) => tab.id === tabId);
        } catch {
          // Keep ownership if Chrome cannot establish whether the tab remains.
        }
        if (tabStillExists) {
          throw new Error('Managed collection tab could not be removed');
        }
      }
    }

    async function detachTabInternal(sessions, attemptId, tabId, closeManagedTab) {
      const current = sessions[attemptId];
      if (!Number.isInteger(tabId)) {
        throw new Error('Managed collection tab ID is required');
      }
      const matchesCurrent = current?._managedTabId === tabId;
      const canClose =
        matchesCurrent && current._managedTabCloseOnCancel !== false;
      if (closeManagedTab && canClose) await removeManagedTab(tabId);
      if (!current || !matchesCurrent) return current ? toPublicView(current) : null;
      const next = {
        ...current,
        updatedAt: Math.max(now(), current.updatedAt + 1),
      };
      delete next._managedTabId;
      delete next._managedWindowId;
      delete next._managedTabCloseOnCancel;
      sessions[attemptId] = next;
      await writeSessions(prune(sessions));
      const publicView = toPublicView(next);
      await publish(publicView);
      return publicView;
    }

    async function attachTab(attemptId, tab) {
      const view = await transition(attemptId, {
        _managedTabId: tab.tabId,
        _managedWindowId: tab.windowId,
        _managedTabCloseOnCancel: tab.closeOnCancel !== false,
      });
      if (!view && tab.closeOnCancel !== false && Number.isInteger(tab.tabId)) {
        await removeManagedTab(tab.tabId);
      }
      return view;
    }

    function detachTab(attemptId, detachOptions = {}) {
      return enqueueStorageMutation(storageKey, async () => {
        const sessions = await readSessions();
        return detachTabInternal(
          sessions,
          attemptId,
          detachOptions.tabId,
          detachOptions.closeManagedTab === true,
        );
      });
    }

    function progress(attemptId, nextProgress) {
      return transition(attemptId, {
        progress: assertProgress(nextProgress),
        attention: null,
      });
    }

    function requireAttention(attemptId, attention) {
      if (!ATTENTION_REASONS.has(attention?.reason)) {
        throw new Error('Unknown collection attention reason');
      }
      if (
        typeof attention.message !== 'string' ||
        attention.message.length < 1 ||
        attention.message.length > 2_000
      ) {
        throw new Error('Invalid collection attention message');
      }
      return transition(attemptId, (current) => ({
        attention: {
          reason: attention.reason,
          message: attention.message,
          canOpenTab:
            Number.isInteger(current._managedTabId) &&
            Number.isInteger(current._managedWindowId),
        },
      }));
    }

    function cancel(attemptId, cancelOptions = {}) {
      return enqueueStorageMutation(storageKey, async () => {
        const sessions = await readSessions();
        const current = sessions[attemptId];
        if (!current) return null;

        if (typeof cancelOptions.ownerFailure === 'function') {
          let ownerResult;
          try {
            ownerResult = await cancelOptions.ownerFailure({
              attemptId: current.attemptId,
            });
          } catch (error) {
            throw new Error(
              `Owner did not accept collection cancellation: ${error?.message || error}`,
            );
          }
          if (!ownerResult || ownerResult.accepted !== true) {
            throw new Error('Owner did not accept collection cancellation');
          }
        }

        if (
          cancelOptions.closeManagedTab === true &&
          Number.isInteger(current._managedTabId) &&
          current._managedTabCloseOnCancel !== false
        ) {
          await removeManagedTab(current._managedTabId);
        }
        delete sessions[attemptId];
        await writeSessions(prune(sessions));
        return toPublicView(current);
      });
    }

    function remove(attemptId) {
      return enqueueStorageMutation(storageKey, async () => {
        const sessions = await readSessions();
        const current = sessions[attemptId];
        if (!current) return null;
        delete sessions[attemptId];
        await writeSessions(prune(sessions));
        return toPublicView(current);
      });
    }

    function get(attemptId) {
      return enqueueStorageMutation(storageKey, async () => {
        const sessions = await readSessions();
        return sessions[attemptId] ? toPublicView(sessions[attemptId]) : null;
      });
    }

    function getOwned(attemptId, environmentId) {
      const ownerEnvironmentId = requireEnvironmentId(environmentId);
      return enqueueStorageMutation(storageKey, async () => {
        const sessions = await readSessions();
        const session = sessions[attemptId];
        return session?.environmentId === ownerEnvironmentId
          ? toPublicView(session)
          : null;
      });
    }

    function list(environmentId) {
      if (environmentId !== undefined) requireEnvironmentId(environmentId);
      return enqueueStorageMutation(storageKey, async () => {
        const sessions = await readSessions();
        return Object.values(sessions)
          .filter(
            (session) =>
              environmentId === undefined ||
              session.environmentId === environmentId,
          )
          .map(toPublicView);
      });
    }

    function listAll() {
      return list();
    }

    function openAttentionTab(attemptId) {
      return enqueueStorageMutation(storageKey, async () => {
        const sessions = await readSessions();
        const session = sessions[attemptId];
        if (!session || session.attention === null) {
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
      detachTab,
      progress,
      requireAttention,
      cancel,
      remove,
      get,
      getOwned,
      list,
      listAll,
      openAttentionTab,
    };
  }

  global.KidItemCollectionSession = Object.freeze({ create });
})(globalThis);
