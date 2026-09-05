(function (root) {
  "use strict";
  const SOURCE = "coupang_shipment_summary";
  const PATH = "/api/coupang-shipments/date-summary/attempts";

  function create({ chrome, request, collect, sessions }) {
    const wire = root.KidItemSourcingAttemptWire.create({
      chrome,
      sourcePath: PATH,
      requestFailureMessage: "쉽먼트 조회 상태를 서버에서 확인하지 못했습니다",
    });

    function parse(value, attemptId) {
      if (
        value?.attemptId !== attemptId ||
        typeof value.attemptToken !== "string" ||
        value.plan?.sourceType !== SOURCE ||
        value.plan?.parserVersion !== "shipment-summary-v1" ||
        !Number.isFinite(value.plan.maxPages) ||
        value.plan.maxPages < 1 ||
        value.plan.maxPages > 60 ||
        !["RUNNING", "COMPLETE", "FAILED"].includes(value.state) ||
        !Number.isFinite(Date.parse(value.expiresAt))
      )
        throw new Error("SHIPMENT_SUMMARY_PLAN_INVALID");
      if (
        value.state === "RUNNING" &&
        Date.parse(value.expiresAt) <= Date.now()
      )
        throw new Error("ATTEMPT_EXPIRED");
      return value;
    }
    function result(attempt) {
      return {
        success: attempt.state === "COMPLETE",
        attemptId: attempt.attemptId,
        terminalState: attempt.state,
        ...(attempt.state === "FAILED"
          ? { errorCode: attempt.errorCode, error: attempt.errorMessage }
          : {}),
      };
    }
    async function cleanup(attemptId) {
      await sessions.cancel(attemptId, { closeManagedTab: true });
    }
    async function run({ environmentId, attemptId }) {
      const config = {
        apiBase: "",
        headers: { "Content-Type": "application/json" },
        request: (path, init) => request(environmentId, path, init),
      };
      const read = () =>
        wire
          .requestJson(config, `${PATH}/${encodeURIComponent(attemptId)}`, {
            method: "GET",
          })
          .then((value) => parse(value, attemptId));
      const attempt = await read();
      if (attempt.state !== "RUNNING") return result(attempt);
      await sessions.start({
        environmentId,
        attemptId,
        producer: "orders.coupang_shipment_summary",
      });
      let observed;
      try {
        observed = await collect({
          maxPages: attempt.plan.maxPages,
          attemptId,
          environmentId,
        });
      } catch (error) {
        observed = { success: false, error: error?.message };
      }
      if (!(await sessions.get(attemptId)))
        observed = {
          success: false,
          errorCode: "COLLECTION_CANCELLED",
          error: "쉽먼트 조회가 취소되었습니다.",
        };
      const failure = wire.failure(
        { code: observed?.errorCode, message: observed?.error },
        "coupang_shipment_summary_failed",
        "쿠팡 쉽먼트 발송일 조회에 실패했습니다.",
      );
      const submission =
        observed?.success === true
          ? {
              method: "PUT",
              suffix: "",
              body: {
                items: observed.dates,
                scannedPages: observed.scannedPages,
                totalRows: observed.totalRows,
                proof: observed.proof,
              },
            }
          : { method: "POST", suffix: "/fail", body: failure };
      let terminal;
      try {
        terminal = await wire.terminal(config, attempt, submission, (value) =>
          parse(value, attemptId),
        );
      } catch (error) {
        // A lost terminal reply is not provider failure. Read the exact owner;
        // never issue a contradictory fail after an uncertain complete upload.
        terminal = await read().catch(() => null);
        if (!terminal || terminal.state === "RUNNING")
          return {
            success: false,
            attemptId,
            terminalState: "RUNNING",
            errorCode: "SOURCE_RESULT_UNCONFIRMED",
            error: String(
              error?.message || "서버 저장 결과를 확인해주세요.",
            ).slice(0, 300),
          };
      }
      if (
        terminal.state === "FAILED" &&
        terminal.errorCode === "coupang_shipment_session_required"
      ) {
        await sessions.requireAttention(attemptId, {
          reason: "marketplace_login",
          message: terminal.errorMessage || "Supplier Hub 로그인이 필요합니다.",
        });
      } else if (terminal.state !== "RUNNING") await cleanup(attemptId);
      return result(terminal);
    }
    async function cancel({ environmentId, attemptId }) {
      const session = await sessions.getOwned(attemptId, environmentId);
      if (session?.producer !== "orders.coupang_shipment_summary") return null;
      const config = {
        apiBase: "",
        headers: { "Content-Type": "application/json" },
        request: (path, init) => request(environmentId, path, init),
      };
      const attempt = parse(
        await wire.requestJson(
          config,
          `${PATH}/${encodeURIComponent(attemptId)}`,
          { method: "GET" },
        ),
        attemptId,
      );
      const terminal =
        attempt.state !== "RUNNING"
          ? attempt
          : await wire.terminal(
              config,
              attempt,
              {
                method: "POST",
                suffix: "/fail",
                body: {
                  code: "COLLECTION_CANCELLED",
                  message: "쉽먼트 조회가 취소되었습니다.",
                },
              },
              (value) => parse(value, attemptId),
            );
      if (terminal.state !== "RUNNING") await cleanup(attemptId);
      return result(terminal);
    }
    return Object.freeze({ run, cancel });
  }
  root.KidItemCoupangShipmentSummarySourceOwner = Object.freeze({ create });
})(globalThis);
