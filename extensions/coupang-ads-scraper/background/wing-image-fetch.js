(function initializeWingImageFetch(root) {
  "use strict";

  const ACTION = "fetchImageAsDataUrl";
  const WING_FORM_ORIGIN = "https://wing.coupang.com";
  const WING_FORM_PATH =
    /^\/tenants\/seller-web\/vendor-inventory\/formV2\/?$/;
  const LOCAL_IMAGE_ORIGIN = "http://localhost:9000";
  const LOCAL_IMAGE_PATH_PREFIX = "/kiditem/";

  function parseUrl(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      return new URL(value);
    } catch {
      return null;
    }
  }

  function isAllowedSender(sender, runtimeId) {
    if (!runtimeId || sender?.id !== runtimeId) return false;
    const senderUrl = parseUrl(sender?.url || sender?.tab?.url);
    return Boolean(
      senderUrl &&
        senderUrl.origin === WING_FORM_ORIGIN &&
        WING_FORM_PATH.test(senderUrl.pathname),
    );
  }

  function allowedImageUrl(value) {
    const url = parseUrl(value);
    if (
      !url ||
      url.origin !== LOCAL_IMAGE_ORIGIN ||
      !url.pathname.startsWith(LOCAL_IMAGE_PATH_PREFIX)
    ) {
      return null;
    }
    return url.href;
  }

  function blobToDataUrl(blob, FileReaderCtor) {
    return new Promise((resolve, reject) => {
      const reader = new FileReaderCtor();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("이미지 인코딩 실패"));
      reader.readAsDataURL(blob);
    });
  }

  function create({ runtimeId, fetchFn, FileReaderCtor }) {
    async function fetchImageAsDataUrl(message, sender) {
      if (!isAllowedSender(sender, runtimeId)) {
        throw new Error("허용되지 않은 이미지 요청 발신자입니다.");
      }

      const url = allowedImageUrl(message?.url);
      if (!url) {
        throw new Error("허용되지 않은 이미지 URL입니다.");
      }

      const response = await fetchFn(url);
      if (!response.ok) {
        throw new Error(`이미지 다운로드 실패 (${response.status})`);
      }
      return blobToDataUrl(await response.blob(), FileReaderCtor);
    }

    function handleMessage(message, sender, sendResponse) {
      if (message?.action !== ACTION) return undefined;
      fetchImageAsDataUrl(message, sender)
        .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error?.message || "이미지 다운로드 실패",
          }),
        );
      return true;
    }

    return Object.freeze({ handleMessage });
  }

  root.KidItemWingImageFetch = Object.freeze({ create });
})(globalThis);
