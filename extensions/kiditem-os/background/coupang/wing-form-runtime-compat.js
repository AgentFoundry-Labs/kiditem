(function (globalScope) {
  "use strict";

  /**
   * Runs in Coupang's MAIN world. Keep this function self-contained because
   * chrome.scripting serializes it without this file's lexical scope.
   */
  function installInPage() {
    const expectedHost = "wing.coupang.com";
    const expectedPath =
      "/tenants/seller-web/vendor-inventory/formV2";
    if (
      globalThis.location?.hostname !== expectedHost ||
      globalThis.location?.pathname !== expectedPath
    ) {
      return {
        ok: false,
        status: "wrong-page",
        error: "WING 상품등록 formV2 페이지가 아닙니다.",
      };
    }

    function patchLexicalStringAlias() {
      const prototype = String.prototype;
      const hasIsEmpty = typeof prototype.isEmpty === "function";
      const hasFilter = typeof prototype.filter === "function";
      if (hasIsEmpty && hasFilter) {
        return { ok: true, status: "already-compatible" };
      }
      if (!Object.isExtensible(prototype)) {
        return {
          ok: false,
          status: "unsupported",
          error: "WING 문자열 런타임에 호환 기능을 추가할 수 없습니다.",
        };
      }

      const isEmpty = (value) => {
        if (value == null) return true;
        if (typeof value === "string" || Array.isArray(value)) {
          return value.length === 0;
        }
        if (
          typeof Map === "function" &&
          (value instanceof Map || value instanceof Set)
        ) {
          return value.size === 0;
        }
        return Object.keys(Object(value)).length === 0;
      };
      const filter = (collection, predicate) => {
        if (collection == null) return [];
        const values = Array.isArray(collection)
          ? collection
          : Object.values(Object(collection));
        const matches =
          typeof predicate === "function"
            ? predicate
            : (value) => Boolean(value);
        return values.filter((value, index) =>
          matches(value, index, collection),
        );
      };

      try {
        if (!hasIsEmpty) {
          Object.defineProperty(prototype, "isEmpty", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: isEmpty,
          });
        }
        if (!hasFilter) {
          Object.defineProperty(prototype, "filter", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: filter,
          });
        }
      } catch {
        return {
          ok: false,
          status: "unsupported",
          error: "WING 문자열 런타임의 누락 기능을 보완하지 못했습니다.",
        };
      }

      return typeof prototype.isEmpty === "function" &&
        typeof prototype.filter === "function"
        ? { ok: true, status: "installed" }
        : {
            ok: false,
            status: "unsupported",
            error: "WING 문자열 런타임 호환 기능을 확인하지 못했습니다.",
          };
    }

    const lexicalStringCompatibility = patchLexicalStringAlias();
    if (!lexicalStringCompatibility.ok) return lexicalStringCompatibility;

    const underscore = globalThis._;
    const underscoreType = typeof underscore;
    if (
      underscore == null ||
      (underscoreType !== "object" && underscoreType !== "function")
    ) {
      return {
        ok: false,
        status: "unsupported",
        error: "WING 전역 '_' 값에 호환 기능을 추가할 수 없습니다.",
      };
    }
    const hasIsEmpty = typeof underscore.isEmpty === "function";
    const hasFilter = typeof underscore.filter === "function";
    if (hasIsEmpty && hasFilter) {
      return { ok: true, status: "already-compatible" };
    }
    if (!Object.isExtensible(underscore)) {
      return {
        ok: false,
        status: "unsupported",
        error: "WING 전역 '_' 객체가 잠겨 있어 호환 기능을 추가할 수 없습니다.",
      };
    }

    const isEmpty = (value) => {
      if (value == null) return true;
      if (typeof value === "string" || Array.isArray(value)) {
        return value.length === 0;
      }
      if (
        typeof Map === "function" &&
        (value instanceof Map || value instanceof Set)
      ) {
        return value.size === 0;
      }
      return Object.keys(Object(value)).length === 0;
    };
    const filter = (collection, predicate) => {
      if (collection == null) return [];
      const values = Array.isArray(collection)
        ? collection
        : Object.values(Object(collection));
      const matches =
        typeof predicate === "function"
          ? predicate
          : (value) => Boolean(value);
      return values.filter((value, index) => matches(value, index, collection));
    };

    try {
      if (!hasIsEmpty) {
        Object.defineProperty(underscore, "isEmpty", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: isEmpty,
        });
      }
      if (!hasFilter) {
        Object.defineProperty(underscore, "filter", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: filter,
        });
      }
    } catch {
      return {
        ok: false,
        status: "unsupported",
        error: "WING 전역 '_' 객체의 누락 기능을 보완하지 못했습니다.",
      };
    }

    return typeof underscore.isEmpty === "function" &&
      typeof underscore.filter === "function"
      ? { ok: true, status: "installed" }
      : {
          ok: false,
          status: "unsupported",
          error: "WING 런타임 호환 기능을 확인하지 못했습니다.",
        };
  }

  /**
   * MAIN-world document_start에서 실행된다. Wing이 전역 `_`를 나중에
   * 할당하는 경우 첫 할당을 가로채 필요한 기능을 앱 번들 실행 전에 보완한다.
   */
  function installAtDocumentStart() {
    const expectedHost = "wing.coupang.com";
    const expectedPath =
      "/tenants/seller-web/vendor-inventory/formV2";
    if (
      globalThis.location?.hostname !== expectedHost ||
      globalThis.location?.pathname !== expectedPath
    ) {
      return { ok: false, status: "wrong-page" };
    }

    /**
     * 2026-07-28 Wing formV2 번들은 일부 scope 에서 lodash 전역 `_` 대신
     * UUID 문자열을 `_` 로 캡처한 채 `_.isEmpty(...)` / `_.filter(...)` 를
     * 호출한다. 이 값은 lexical binding 이라 globalThis._ 패치로는 닿지 않는다.
     * 문자열 property lookup 이 String.prototype 을 거치는 점을 이용해 이 Wing
     * document 에서만 필요한 두 함수를 non-enumerable 로 제공한다.
     */
    function patchLexicalStringAlias() {
      const prototype = String.prototype;
      const hasIsEmpty = typeof prototype.isEmpty === "function";
      const hasFilter = typeof prototype.filter === "function";
      if (hasIsEmpty && hasFilter) {
        return { ok: true, status: "already-compatible" };
      }
      if (!Object.isExtensible(prototype)) {
        return {
          ok: false,
          status: "unsupported",
          error: "WING 문자열 런타임에 호환 기능을 추가할 수 없습니다.",
        };
      }

      const isEmpty = (value) => {
        if (value == null) return true;
        if (typeof value === "string" || Array.isArray(value)) {
          return value.length === 0;
        }
        if (
          typeof Map === "function" &&
          (value instanceof Map || value instanceof Set)
        ) {
          return value.size === 0;
        }
        return Object.keys(Object(value)).length === 0;
      };
      const filter = (collection, predicate) => {
        if (collection == null) return [];
        const values = Array.isArray(collection)
          ? collection
          : Object.values(Object(collection));
        const matches =
          typeof predicate === "function"
            ? predicate
            : (value) => Boolean(value);
        return values.filter((value, index) =>
          matches(value, index, collection),
        );
      };

      try {
        if (!hasIsEmpty) {
          Object.defineProperty(prototype, "isEmpty", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: isEmpty,
          });
        }
        if (!hasFilter) {
          Object.defineProperty(prototype, "filter", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: filter,
          });
        }
      } catch {
        return {
          ok: false,
          status: "unsupported",
          error: "WING 문자열 런타임의 누락 기능을 보완하지 못했습니다.",
        };
      }

      return typeof prototype.isEmpty === "function" &&
        typeof prototype.filter === "function"
        ? { ok: true, status: "installed" }
        : {
            ok: false,
            status: "unsupported",
            error: "WING 문자열 런타임 호환 기능을 확인하지 못했습니다.",
          };
    }

    const lexicalStringCompatibility = patchLexicalStringAlias();
    if (!lexicalStringCompatibility.ok) return lexicalStringCompatibility;

    function patchCurrent(underscore) {
      const underscoreType = typeof underscore;
      if (
        underscore == null ||
        (underscoreType !== "object" && underscoreType !== "function")
      ) {
        return { ok: true, status: "waiting-for-runtime" };
      }
      const hasIsEmpty = typeof underscore.isEmpty === "function";
      const hasFilter = typeof underscore.filter === "function";
      if (hasIsEmpty && hasFilter) {
        return { ok: true, status: "already-compatible" };
      }
      if (!Object.isExtensible(underscore)) {
        return {
          ok: false,
          status: "unsupported",
          error: "WING 전역 '_' 객체가 잠겨 있어 호환 기능을 추가할 수 없습니다.",
        };
      }

      const isEmpty = (value) => {
        if (value == null) return true;
        if (typeof value === "string" || Array.isArray(value)) {
          return value.length === 0;
        }
        if (
          typeof Map === "function" &&
          (value instanceof Map || value instanceof Set)
        ) {
          return value.size === 0;
        }
        return Object.keys(Object(value)).length === 0;
      };
      const filter = (collection, predicate) => {
        if (collection == null) return [];
        const values = Array.isArray(collection)
          ? collection
          : Object.values(Object(collection));
        const matches =
          typeof predicate === "function"
            ? predicate
            : (value) => Boolean(value);
        return values.filter((value, index) =>
          matches(value, index, collection),
        );
      };

      try {
        if (!hasIsEmpty) {
          Object.defineProperty(underscore, "isEmpty", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: isEmpty,
          });
        }
        if (!hasFilter) {
          Object.defineProperty(underscore, "filter", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: filter,
          });
        }
      } catch {
        return {
          ok: false,
          status: "unsupported",
          error: "WING 전역 '_' 객체의 누락 기능을 보완하지 못했습니다.",
        };
      }

      return { ok: true, status: "installed" };
    }

    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "_");
    if (descriptor && descriptor.configurable === false) {
      return patchCurrent(globalThis._);
    }

    const current = globalThis._;
    const installed = patchCurrent(current);
    if (!installed.ok) return installed;

    let assigned = current;
    try {
      Object.defineProperty(globalThis, "_", {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get() {
          return assigned;
        },
        set(value) {
          assigned = value;
          patchCurrent(assigned);
        },
      });
    } catch {
      return {
        ok: false,
        status: "unsupported",
        error: "WING 전역 '_' 초기화를 가로채지 못했습니다.",
      };
    }

    return { ok: true, status: "waiting-for-runtime" };
  }

  function create({ chrome: chromeApi }) {
    const wingFormUrl =
      "https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2";

    async function prepareNavigation(tabId, url) {
      if (!Number.isInteger(tabId) || tabId <= 0) {
        return {
          ok: false,
          status: "invalid-tab",
          error: "WING 상품등록 탭을 확인하지 못했습니다.",
        };
      }
      if (url !== wingFormUrl) {
        return {
          ok: false,
          status: "wrong-page",
          error: "WING 상품등록 주소가 올바르지 않습니다.",
        };
      }
      if (
        typeof chromeApi?.debugger?.attach !== "function" ||
        typeof chromeApi?.debugger?.sendCommand !== "function" ||
        typeof chromeApi?.debugger?.detach !== "function"
      ) {
        return {
          ok: false,
          status: "unsupported",
          error: "WING 페이지 초기화 순서를 제어할 수 없습니다.",
        };
      }

      const target = { tabId };
      let attached = false;
      try {
        await chromeApi.debugger.attach(target, "1.3");
        attached = true;
        await chromeApi.debugger.sendCommand(target, "Page.enable");
        const bootstrap = await chromeApi.debugger.sendCommand(
          target,
          "Page.addScriptToEvaluateOnNewDocument",
          { source: `(${installAtDocumentStart.toString()})();` },
        );
        if (typeof bootstrap?.identifier !== "string") {
          throw new Error("WING 초기화 스크립트 등록 결과를 확인하지 못했습니다.");
        }
        const navigation = await chromeApi.debugger.sendCommand(
          target,
          "Page.navigate",
          { url },
        );
        if (navigation?.errorText) {
          throw new Error(`WING 페이지 이동 실패: ${navigation.errorText}`);
        }
        return { ok: true, status: "prepared" };
      } catch (error) {
        return {
          ok: false,
          status: "bootstrap-failed",
          error:
            error?.message ||
            "WING 페이지가 실행되기 전에 호환 기능을 준비하지 못했습니다.",
        };
      } finally {
        if (attached) {
          await chromeApi.debugger.detach(target).catch(() => undefined);
        }
      }
    }

    async function insertText(tabId, url, value) {
      if (!Number.isInteger(tabId) || tabId <= 0) {
        return {
          ok: false,
          status: "invalid-tab",
          error: "WING 카테고리 입력 탭을 확인하지 못했습니다.",
        };
      }
      const isWingForm =
        url === wingFormUrl ||
        url?.startsWith(`${wingFormUrl}?`) ||
        url?.startsWith(`${wingFormUrl}#`);
      if (!isWingForm) {
        return {
          ok: false,
          status: "wrong-page",
          error: "WING 상품등록 페이지의 입력 요청이 아닙니다.",
        };
      }
      if (
        typeof value !== "string" ||
        value.length === 0 ||
        value.length > 100 ||
        /[\r\n\0]/.test(value)
      ) {
        return {
          ok: false,
          status: "invalid-text",
          error: "WING 카테고리 검색어가 올바르지 않습니다.",
        };
      }
      if (
        typeof chromeApi?.debugger?.attach !== "function" ||
        typeof chromeApi?.debugger?.sendCommand !== "function" ||
        typeof chromeApi?.debugger?.detach !== "function"
      ) {
        return {
          ok: false,
          status: "unsupported",
          error: "WING 카테고리 검색 입력을 실행할 수 없습니다.",
        };
      }

      const target = { tabId };
      let attached = false;
      try {
        await chromeApi.debugger.attach(target, "1.3");
        attached = true;
        await chromeApi.debugger.sendCommand(target, "Input.insertText", {
          text: value,
        });
        return { ok: true, status: "inserted" };
      } catch (error) {
        return {
          ok: false,
          status: "input-failed",
          error:
            error?.message ||
            "WING 카테고리 검색어를 브라우저 입력으로 전달하지 못했습니다.",
        };
      } finally {
        if (attached) {
          await chromeApi.debugger.detach(target).catch(() => undefined);
        }
      }
    }

    async function ensure(tabId) {
      if (!Number.isInteger(tabId) || tabId <= 0) {
        return {
          ok: false,
          status: "invalid-tab",
          error: "WING 상품등록 탭을 확인하지 못했습니다.",
        };
      }
      if (typeof chromeApi?.scripting?.executeScript !== "function") {
        return {
          ok: false,
          status: "unsupported",
          error: "WING 메인 실행영역에 접근할 수 없습니다.",
        };
      }

      try {
        const [injection] = await chromeApi.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func: installInPage,
        });
        const result = injection?.result;
        if (result?.ok === true) return result;
        return {
          ok: false,
          status: result?.status || "unsupported",
          error:
            result?.error ||
            "WING 상품등록 화면의 런타임 호환성을 확인하지 못했습니다.",
        };
      } catch (error) {
        return {
          ok: false,
          status: "injection-failed",
          error:
            error?.message ||
            "WING 상품등록 화면의 런타임 호환성 확인에 실패했습니다.",
        };
      }
    }

    return Object.freeze({ ensure, insertText, prepareNavigation });
  }

  const runtimeCompat = Object.freeze({
    create,
    installAtDocumentStart,
    installInPage,
  });
  globalScope.KidItemWingFormRuntimeCompat = runtimeCompat;

  if (
    globalScope.location?.hostname === "wing.coupang.com" &&
    globalScope.location?.pathname ===
      "/tenants/seller-web/vendor-inventory/formV2"
  ) {
    runtimeCompat.installAtDocumentStart();
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
