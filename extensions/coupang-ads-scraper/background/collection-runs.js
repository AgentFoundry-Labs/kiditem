(function initializeCollectionRuns(root) {
  "use strict";

  const DASHBOARD_PRODUCERS = new Set([
    "dashboard.wing_sales",
    "dashboard.rocket_sales",
    "dashboard.coupang_ads",
    "dashboard.coupang_products",
    "dashboard.wing_kpi",
  ]);
  const SCRAPE_PRODUCERS = new Set([
    ...DASHBOARD_PRODUCERS,
    "advertising.ad_sync",
    "advertising.scrape_targets",
  ]);
  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const ACTIVE_SESSION_STATUSES = new Set(["pending", "running"]);

  function create(options) {
    const chromeApi = options.chrome;
    const sessions = options.sessions;
    const collectionWindow = options.collectionWindow;
    const now = options.now || Date.now;

    function createRunId() {
      if (typeof options.randomUUID === "function") return options.randomUUID();
      if (typeof root.crypto?.randomUUID === "function") {
        return root.crypto.randomUUID();
      }
      return `${now()}-${Math.random().toString(36).slice(2)}`;
    }

    function resolveScrapeTargetProducer(value) {
      return typeof value === "string" && SCRAPE_PRODUCERS.has(value)
        ? value
        : null;
    }

    function isDashboardProducer(value) {
      return DASHBOARD_PRODUCERS.has(value);
    }

    function validateScrapeTargets(value) {
      if (!Array.isArray(value) || value.length === 0 || value.length > 500) {
        return null;
      }
      const targets = [];
      for (const item of value) {
        if (!item || typeof item.url !== "string") return null;
        let parsed;
        try {
          parsed = new URL(item.url.replace(/#kiditemBatch=1$/, ""));
        } catch {
          return null;
        }
        if (
          parsed.protocol !== "https:" ||
          !["wing.coupang.com", "advertising.coupang.com"].includes(
            parsed.hostname,
          )
        ) {
          return null;
        }
        targets.push({
          id:
            typeof item.id === "string" || typeof item.id === "number"
              ? item.id
              : null,
          url: parsed.toString(),
          label:
            typeof item.label === "string" ? item.label.slice(0, 200) : null,
        });
      }
      return targets;
    }

    async function beginWebCollection(
      producer,
      inputIdentity,
      requestedRunId,
      stableOwnerKeys = [],
    ) {
      const hasRequestedRunId = requestedRunId !== undefined;
      if (
        hasRequestedRunId &&
        (typeof requestedRunId !== "string" ||
          !UUID_PATTERN.test(requestedRunId))
      ) {
        throw new Error("Collection run ID must be a UUID");
      }
      const runId = hasRequestedRunId ? requestedRunId : createRunId();
      const existing = hasRequestedRunId ? await sessions.get(runId) : null;
      if (existing) {
        if (existing.producer !== producer) {
          throw new Error("Collection session owner does not match producer");
        }
        if (existing.restartStrategy !== "web") {
          throw new Error("Collection session restart strategy is not web");
        }
        if (ACTIVE_SESSION_STATUSES.has(existing.status)) {
          throw new Error("Collection session is already active");
        }
        for (const key of stableOwnerKeys) {
          if (
            typeof key !== "string" ||
            existing.inputIdentity?.[key] !== inputIdentity?.[key]
          ) {
            throw new Error("Collection session input owner does not match");
          }
        }
        if (SCRAPE_PRODUCERS.has(producer)) {
          await collectionWindow.close(runId);
          await sessions.restart(runId);
        } else {
          await sessions.restart(runId, { closeManagedTab: true });
        }
        return runId;
      }
      await sessions.start({
        runId,
        producer,
        classification: "background_preferred",
        restartStrategy: "web",
        inputIdentity,
      });
      return runId;
    }

    function getTab(tabId) {
      return new Promise((resolve) => {
        chromeApi.tabs.get(tabId, (tab) => {
          if (chromeApi.runtime.lastError || !tab?.id) {
            resolve(null);
            return;
          }
          resolve(tab);
        });
      });
    }

    async function attachTab(runId, tabOrId) {
      const tab =
        typeof tabOrId === "number" ? await getTab(tabOrId) : tabOrId;
      if (!tab?.id || !Number.isInteger(tab.windowId)) return null;
      await sessions.attachTab(runId, {
        tabId: tab.id,
        windowId: tab.windowId,
      });
      return tab;
    }

    async function requireAttention(runId, tabId, reason, message) {
      const session = await sessions.requireAttention(runId, { reason, message });
      if (session?.status === "cancelled") {
        return { success: false, cancelled: true, runId, tabId };
      }
      return {
        success: false,
        attentionRequired: true,
        runId,
        tabId,
        error: message,
      };
    }

    async function startCatalog(message) {
      const runId =
        typeof message?.runId === "string" ? message.runId : createRunId();
      await sessions.start({
        runId,
        producer: "channels.coupang_catalog",
        classification: "background_preferred",
        restartStrategy: "extension",
        inputIdentity: {
          runId,
          channelAccountId:
            typeof message?.channelAccountId === "string"
              ? message.channelAccountId
              : null,
          startedAt: now(),
        },
      });
      try {
        return await options.startCatalog(message);
      } catch (error) {
        await sessions.fail(runId);
        throw error;
      }
    }

    async function cancel(runId) {
      if (typeof runId !== "string" || !runId) {
        return { success: false, cancelled: false, error: "runId required" };
      }
      const session = await sessions.get(runId);
      if (!session) return { success: true, cancelled: false, runId };
      if (
        isDashboardProducer(session.producer) ||
        session.producer === "advertising.ad_sync" ||
        session.producer === "advertising.scrape_targets"
      ) {
        await options.cancelScrape(runId);
        return { success: true, cancelled: true, runId };
      }
      if (session.producer === "channels.coupang_catalog") {
        await options.cancelCatalog(runId);
        return { success: true, cancelled: true, runId };
      }

      await sessions.cancel(runId, { closeManagedTab: true });
      if (session.producer === "advertising.wing_rank") {
        await options.cancelWingRank(runId);
      } else if (session.producer === "advertising.keyword_rank") {
        await options.cancelKeywordRank(runId);
      } else if (session.producer === "advertising.competitor_catalog") {
        await options.cancelCompetitorCatalog(runId);
      }
      return { success: true, cancelled: true, runId };
    }

    async function manualConfirmation(runId, message) {
      await sessions.requireAttention(runId, {
        reason: "manual_confirmation",
        message,
      });
      return sessions.get(runId);
    }

    async function restart(runId) {
      const session = await sessions.get(runId);
      if (!session) throw new Error("Collection session not found");
      if (session.restartStrategy !== "extension") {
        return manualConfirmation(
          runId,
          "현재 화면에서 수집 대상을 다시 확인한 뒤 처음부터 실행해주세요.",
        );
      }

      await sessions.restart(
        runId,
        session.producer === "advertising.wing_rank"
          ? { closeManagedTab: true }
          : undefined,
      );
      try {
        if (session.producer === "advertising.scrape_targets") {
          const targets = await options.loadScheduledTargets();
          await options.startScheduledScrape({
            targets,
            runId,
            startedAt: now(),
            startIndex: 0,
            sessionStarted: true,
          });
        } else if (session.producer === "advertising.wing_rank") {
          await options.startWingRank({
            forceRestart: true,
            runId,
            restartStrategy: "extension",
            sessionStarted: true,
          });
        } else if (session.producer === "channels.coupang_catalog") {
          await options.restartCatalog(runId);
        } else {
          throw new Error("Collection restart source is no longer valid");
        }
        return sessions.get(runId);
      } catch (error) {
        return manualConfirmation(
          runId,
          error?.message ||
            "최신 수집 대상을 확인할 수 없습니다. 화면에서 다시 시작해주세요.",
        );
      }
    }

    async function recover() {
      const active = await sessions.list();
      for (const session of active) {
        if (
          session.status !== "running" &&
          session.status !== "attention_required"
        ) {
          continue;
        }
        const owned = await collectionWindow.reattach(session.runId);
        if (owned) {
          await sessions.attachTab(session.runId, {
            tabId: owned.tabId,
            windowId: owned.windowId,
          });
        }
        if (session.status === "attention_required") continue;
        if (session.restartStrategy === "extension") {
          await restart(session.runId);
        } else {
          await manualConfirmation(
            session.runId,
            "브라우저 수집 실행이 중단되었습니다. 현재 화면에서 처음부터 다시 실행해주세요.",
          );
        }
      }
    }

    async function isCancelled(runId) {
      return (await sessions.get(runId))?.status === "cancelled";
    }

    return Object.freeze({
      attachTab,
      beginWebCollection,
      cancel,
      createRunId,
      isCancelled,
      isDashboardProducer,
      recover,
      requireAttention,
      resolveScrapeTargetProducer,
      restart,
      startCatalog,
      validateScrapeTargets,
    });
  }

  root.KidItemCollectionRuns = Object.freeze({ create });
})(globalThis);
