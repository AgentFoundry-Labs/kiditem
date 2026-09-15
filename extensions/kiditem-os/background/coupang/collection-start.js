(function installCoupangCollectionStart(root) {
  "use strict";

  // The one start for collections that need a browser resource one collection
  // holds at a time in a browser environment (KID-147,
  // `@kiditem/shared/collection-start`): the Coupang collection window, and
  // the Wing login a catalog import reads through. A start is answered once it
  // is decided, never when the collection ends: the source owner's attempt
  // carries the collection's state from then on.
  const START_ACTION = "startCollection";
  // Collections that take turns in the Coupang collection window.
  const COLLECTION_NAMES = Object.freeze({
    "advertising.ad_sync": "쿠팡 광고 캠페인",
    "advertising.ad_keyword": "쿠팡 광고 키워드",
    "advertising.profitability_import": "쿠팡 상품별 광고 보고서",
    "dashboard.wing_sales": "쿠팡 Wing 트래픽",
    "dashboard.wing_kpi": "쿠팡 Wing 아이템위너",
  });
  // The extension opens every attempt with its source owner, as the web app
  // did before this contract.
  const BEGIN_PATHS = Object.freeze({
    "advertising.ad_sync": "/api/ads/ad-campaigns/attempts",
    "advertising.ad_keyword": "/api/ads/ad-keywords/attempts",
    "advertising.profitability_import": "/api/ads/profitability-imports",
    "dashboard.wing_sales": "/api/ads/traffic/attempts",
    "dashboard.wing_kpi": "/api/ads/wing-itemwinner/attempts",
  });
  // The Wing catalog import does not use the collection window. It reads Wing
  // through the browser's single Wing login, so a browser imports one store
  // account at a time; the catalog import module admits it.
  const CATALOG_IMPORT_PRODUCER = "channels.coupang_catalog";
  // Keeps the holder's name within the contract's 100 characters.
  const CATALOG_ACCOUNT_NAME_MAX = 80;
  const START_PRODUCERS = Object.freeze([...Object.keys(BEGIN_PATHS), CATALOG_IMPORT_PRODUCER]);
  const REQUEST_KEYS = ["action", "producer", "idempotencyKey", "scope"];
  // The shared schema validates with zod 3. These are its `z.string().uuid()`
  // and `z.string().date()` patterns, so both sides accept the same requests.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const CALENDAR_DATE =
    /^((\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\d|3[01])|(0[469]|11)-(0[1-9]|[12]\d|30)|(02)-(0[1-9]|1\d|2[0-8])))$/;
  const MANUAL_REPORT_DAYS = Object.freeze({ "7d": 7, "1d": 1 });
  const DAY_MS = 86_400_000;

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function hasOnlyKeys(value, keys) {
    return Object.keys(value).every((key) => keys.includes(key));
  }

  function optionalUuid(value) {
    return value === undefined || (typeof value === "string" && UUID.test(value));
  }

  function calendarDate(value) {
    return typeof value === "string" && CALENDAR_DATE.test(value);
  }

  // Same arithmetic as `shiftBusinessDateKey` in `@kiditem/shared/common`.
  function shiftDateKey(value, days) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      return null;
    }
    return new Date(parsed.getTime() + days * DAY_MS).toISOString().slice(0, 10);
  }

  function accountScope(scope) {
    return hasOnlyKeys(scope, ["channelAccountId"]) && optionalUuid(scope.channelAccountId);
  }

  // A manual campaign report covers exactly its 7-day or 1-day period.
  function manualReportScope(scope) {
    return scope.captureMode === "manual_report" &&
      hasOnlyKeys(scope, ["captureMode", "channelAccountId", "period", "startDate", "endDate"]) &&
      optionalUuid(scope.channelAccountId) &&
      Object.hasOwn(MANUAL_REPORT_DAYS, scope.period) &&
      calendarDate(scope.startDate) &&
      calendarDate(scope.endDate) &&
      shiftDateKey(scope.startDate, MANUAL_REPORT_DAYS[scope.period] - 1) === scope.endDate;
  }

  function trafficScope(scope) {
    return hasOnlyKeys(scope, ["channelAccountId", "startDate", "endDate"]) &&
      optionalUuid(scope.channelAccountId) &&
      calendarDate(scope.startDate) &&
      calendarDate(scope.endDate) &&
      scope.startDate <= scope.endDate;
  }

  // A catalog import names exactly one store account.
  function catalogImportScope(scope) {
    return hasOnlyKeys(scope, ["channelAccountId"]) &&
      typeof scope.channelAccountId === "string" &&
      UUID.test(scope.channelAccountId);
  }

  function validScope(producer, scope) {
    if (!isRecord(scope)) return false;
    switch (producer) {
      case "advertising.ad_sync":
        return manualReportScope(scope) || accountScope(scope);
      case "advertising.ad_keyword":
      case "dashboard.wing_kpi":
        return accountScope(scope);
      case "advertising.profitability_import":
        return Object.keys(scope).length === 0;
      case "dashboard.wing_sales":
        return trafficScope(scope);
      case CATALOG_IMPORT_PRODUCER:
        return catalogImportScope(scope);
      default:
        return false;
    }
  }

  // External messages are untrusted: only an exact start request passes.
  function parseRequest(message) {
    if (
      !isRecord(message) ||
      !hasOnlyKeys(message, REQUEST_KEYS) ||
      message.action !== START_ACTION ||
      typeof message.producer !== "string" ||
      !START_PRODUCERS.includes(message.producer) ||
      typeof message.idempotencyKey !== "string" ||
      !UUID.test(message.idempotencyKey) ||
      !validScope(message.producer, message.scope)
    ) {
      throw new Error("Invalid collection start request");
    }
    return {
      producer: message.producer,
      idempotencyKey: message.idempotencyKey,
      scope: { ...message.scope },
    };
  }

  // Names only the collections that take turns in the collection window; a
  // session of any other producer never protects that window.
  function collectionName(producer) {
    return typeof producer === "string" && Object.hasOwn(COLLECTION_NAMES, producer)
      ? COLLECTION_NAMES[producer]
      : null;
  }

  function started(producer, attemptId) {
    return { success: true, outcome: "started", producer, attemptId };
  }

  function running(producer, attemptId) {
    return { success: true, outcome: "running", producer, attemptId: attemptId ?? null };
  }

  function refused(producer, holder) {
    const name = COLLECTION_NAMES[holder.producer];
    return {
      success: true,
      outcome: "refused",
      producer,
      holder: { producer: holder.producer, name, attemptId: holder.attemptId ?? null },
      message: `${name} 수집이 수집 창을 쓰고 있습니다. 끝난 뒤 다시 시작해 주세요.`,
    };
  }

  // The same collection already holds the window, or another one does.
  function occupied(producer, holder) {
    return holder.producer === producer
      ? running(producer, holder.attemptId)
      : refused(producer, holder);
  }

  // A run that is not admitted through a start, such as a recovery, is refused
  // the window the same way a start is.
  function turnRefusal(producer, holder) {
    const error = new Error(refused(producer, holder).message);
    error.code = "collection_window_owner_conflict";
    return error;
  }

  function logRunFailure(error) {
    console.error("[KIDITEM] 쿠팡 수집 실행 실패:", error?.message || error);
  }

  function create(options) {
    const windowFor = options.windowFor;
    const request = options.request;
    const keepAlive = options.keepAlive;
    const runs = options.runs;
    const manualReportUrl = options.manualReportUrl;
    const catalogImport = options.catalogImport;

    // A manual campaign report begins with the report page the collection
    // window will open, which the owner freezes as the report's target.
    function beginBody({ scope }) {
      return scope.captureMode === "manual_report"
        ? { ...scope, targetUrl: manualReportUrl(scope) }
        : scope;
    }

    async function begin(environmentId, startRequest) {
      const response = await request(environmentId, BEGIN_PATHS[startRequest.producer], {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": startRequest.idempotencyKey,
        },
        body: JSON.stringify(beginBody(startRequest)),
      });
      const body = await response.json().catch(() => null);
      // The owner already runs this source: the same source must not open twice.
      if (
        response.status === 409 &&
        (body?.code ?? body?.error) === "ATTEMPT_IN_PROGRESS" &&
        typeof body?.attemptId === "string" &&
        UUID.test(body.attemptId)
      ) {
        return { inProgress: true, attemptId: body.attemptId };
      }
      if (!response.ok) {
        const error = new Error(
          typeof body?.message === "string" && body.message.trim()
            ? body.message
            : `수집을 시작하지 못했습니다 (HTTP ${response.status}).`,
        );
        error.code = "SOURCE_OWNER_REQUEST_FAILED";
        throw error;
      }
      // An idempotent replay may return an attempt that already ended. The
      // profitability owner answers with its plan, which carries no state.
      const state = body?.state === undefined ? "RUNNING" : body.state;
      if (
        typeof body?.attemptId !== "string" ||
        !UUID.test(body.attemptId) ||
        !["RUNNING", "COMPLETE", "FAILED"].includes(state)
      ) {
        throw new Error("수집 시도 응답이 올바르지 않습니다.");
      }
      return { attemptId: body.attemptId, state };
    }

    async function start(startRequest, environmentId) {
      if (startRequest.producer === CATALOG_IMPORT_PRODUCER) {
        return startCatalogImport(startRequest, environmentId);
      }
      const { producer, idempotencyKey } = startRequest;
      const windowTurn = windowFor(environmentId);
      // The claim is taken before anything is awaited, so a start that arrives
      // while this one is still being admitted already finds the window held.
      const turn = windowTurn.claimTurn({ producer });
      if (!turn) return occupied(producer, windowTurn.turnHolder());
      let collection = null;
      try {
        // Sessions of attempts that already ended are leftovers, including one an
        // operator stopped on the server. Clearing them first frees their window.
        await windowTurn.clearEndedSessions(environmentId);
        const protecting = await windowTurn.protectingSession(environmentId);
        if (protecting) return occupied(producer, protecting);
        const opened = await begin(environmentId, startRequest);
        if (opened.inProgress) return running(producer, opened.attemptId);
        // Nothing runs for an ended attempt; the web app reads its end from the owner.
        if (opened.state !== "RUNNING") return started(producer, opened.attemptId);
        turn.setAttempt(opened.attemptId);
        collection = keepAlive.during(Promise.resolve().then(() =>
          runs[producer]({ environmentId, attemptId: opened.attemptId, idempotencyKey })));
        return started(producer, opened.attemptId);
      } finally {
        if (collection) {
          // The run keeps the turn until it settles, whatever its outcome.
          collection.then(turn.release, turn.release);
          collection.catch(logRunFailure);
        } else {
          turn.release();
        }
      }
    }

    // The catalog import module takes the browser's import turn, opens the
    // basics attempt and runs the import; this contract answers for it.
    async function startCatalogImport(startRequest, environmentId) {
      const decision = await catalogImport.admit(startRequest, environmentId);
      if (decision.outcome === "started") return started(CATALOG_IMPORT_PRODUCER, decision.attemptId);
      if (decision.outcome === "running") return running(CATALOG_IMPORT_PRODUCER, decision.attemptId);
      return refusedByCatalogImport(environmentId, decision.holder);
    }

    // The refusal names the store account whose import holds the browser when
    // the owner can name it; an unreadable account list still refuses.
    async function refusedByCatalogImport(environmentId, holder) {
      const accountName = await storeAccountName(environmentId, holder.channelAccountId);
      const name = accountName ? `${accountName} 계정의 쿠팡 상품 수집` : "다른 계정의 쿠팡 상품 수집";
      return {
        success: true,
        outcome: "refused",
        producer: CATALOG_IMPORT_PRODUCER,
        holder: { producer: CATALOG_IMPORT_PRODUCER, name, attemptId: holder.attemptId ?? null },
        message: `${name}이 이 브라우저에서 진행 중입니다. 한 브라우저에서는 쿠팡 계정 하나씩만 상품을 받을 수 있습니다. 끝난 뒤 다시 시작해 주세요.`,
      };
    }

    async function storeAccountName(environmentId, channelAccountId) {
      try {
        const response = await request(environmentId, "/api/channels/accounts", { method: "GET" });
        if (!response.ok) return null;
        const accounts = await response.json();
        const account = Array.isArray(accounts)
          ? accounts.find((entry) => entry?.id === channelAccountId)
          : null;
        const name = typeof account?.name === "string"
          ? account.name.trim().slice(0, CATALOG_ACCOUNT_NAME_MAX).trim()
          : "";
        return name || null;
      } catch {
        return null;
      }
    }

    // A source owner runs its collection inside the window's turn. The turn
    // never waits: an admission already holds it for the collection it
    // started, and any other run takes it only when the window is free.
    async function takeTurn(environmentId, producer, operation) {
      const windowTurn = windowFor(environmentId);
      const turn = windowTurn.claimTurn({ producer });
      if (!turn) {
        const holder = windowTurn.turnHolder();
        if (holder.producer !== producer) throw turnRefusal(producer, holder);
        return operation();
      }
      try {
        await windowTurn.clearEndedSessions(environmentId);
        const protecting = await windowTurn.protectingSession(environmentId);
        // A session of the same collection is its owner's to reconcile.
        if (protecting && protecting.producer !== producer) throw turnRefusal(producer, protecting);
        return await operation();
      } finally {
        turn.release();
      }
    }

    return Object.freeze({ start, takeTurn });
  }

  root.KidItemCoupangCollectionStart = Object.freeze({
    collectionName,
    create,
    parseRequest,
  });
})(globalThis);
