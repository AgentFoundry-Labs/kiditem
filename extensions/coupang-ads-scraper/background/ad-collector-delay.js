// KIDITEM OS — 광고 수집용 비활성 탭 대기

(function (global) {
  "use strict";

  const ACTION = "waitForAdCollectorDelay";
  const MAX_DELAY_MS = 5_000;

  function normalizeDelayMs(value) {
    const milliseconds = Number(value);
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 0;
    return Math.min(MAX_DELAY_MS, Math.round(milliseconds));
  }

  function create(options = {}) {
    const schedule = options.schedule || global.setTimeout;
    return function handleMessage(message, _sender, sendResponse) {
      if (message?.action !== ACTION) return false;
      const milliseconds = normalizeDelayMs(message.milliseconds);
      schedule(() => {
        try {
          sendResponse({ success: true, milliseconds });
        } catch {
          // 수집 탭이 이동/종료된 경우 응답 포트가 이미 닫혔을 수 있다.
        }
      }, milliseconds);
      return true;
    };
  }

  global.KidItemAdCollectorDelay = Object.freeze({
    ACTION,
    MAX_DELAY_MS,
    create,
    handleMessage: create(),
    normalizeDelayMs,
  });
})(globalThis);
