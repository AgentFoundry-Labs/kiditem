(function initializeInteractiveTabs(root) {
  "use strict";

  // 병합 전에는 도메인마다 같은 이름의 사본을 따로 실었기 때문에 reason 집합이
  // 갈라져 있었다. 하나의 서비스워커에서는 전역 이름이 하나뿐이므로 마지막에
  // 실린 사본이 나머지를 덮어쓴다. 세 도메인의 reason을 합쳐 단일 정본으로 둔다.
  const reasons = Object.freeze({
    PRODUCT_EDIT: "product_edit",
    THUMBNAIL_REGISTRATION: "thumbnail_registration",
    AD_MUTATION: "ad_mutation",
    ORDER_FILE_UPLOAD: "order_file_upload",
    SHIPMENT_PAGE: "shipment_page",
    SHIPMENT_DOWNLOAD: "shipment_download",
    TRACKING_MUTATION: "tracking_mutation",
    MANUAL_PRODUCT_COLLECTION: "manual_product_collection",
    MALL_PRODUCT_REGISTER: "mall_product_register",
    // 품절을 보내려고 목록을 읽는 탭. 보내고 나면 우리가 닫는다.
    MALL_AVAILABILITY_SEND: "mall_availability_send",
  });
  const allowedReasons = new Set(Object.values(reasons));

  function requireReason(reason) {
    if (!allowedReasons.has(reason)) {
      throw new Error("A valid interactive reason is required");
    }
  }

  // 병합 전 사본들이 콜백형과 Promise형 chrome.tabs 호출로 갈려 있었다. 실제
  // Chrome MV3는 둘 다 지원하므로 어느 쪽이든 받아 넘긴다.
  function callChromeApi(invoke) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const succeed = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      let returned;
      try {
        returned = invoke(succeed);
      } catch (error) {
        fail(error);
        return;
      }
      if (returned && typeof returned.then === "function") {
        returned.then(succeed, fail);
      }
    });
  }

  function create(options) {
    const chromeApi = options.chrome;

    async function createTab(input) {
      requireReason(input?.reason);
      const tab = await callChromeApi((done) =>
        chromeApi.tabs.create({ url: input.url, active: true }, done),
      );
      if (chromeApi.runtime?.lastError || !tab?.id) {
        throw new Error(
          chromeApi.runtime?.lastError?.message ||
            "Interactive tab creation failed",
        );
      }
      return tab;
    }

    async function focusTab(tabId, reason) {
      requireReason(reason);
      const tab = await callChromeApi((done) =>
        chromeApi.tabs.update(tabId, { active: true }, done),
      );
      if (chromeApi.runtime?.lastError || !tab?.id) {
        throw new Error(
          chromeApi.runtime?.lastError?.message ||
            "Interactive tab activation failed",
        );
      }
      if (!Number.isInteger(tab.windowId)) return tab;
      await callChromeApi((done) =>
        chromeApi.windows.update(tab.windowId, { focused: true }, done),
      );
      return tab;
    }

    return Object.freeze({ createTab, focusTab });
  }

  root.KidItemInteractiveTabs = Object.freeze({ create, reasons });
})(globalThis);
