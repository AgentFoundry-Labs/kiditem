// 쿠팡 WING 상품등록(formV2) 런타임 호환(MAIN world, KID-256 — 옛 `background/coupang/wing-form-runtime-compat.js`의 페이지
// 함수 이식). formV2 번들이 lodash 전역 `_` 대신 다른 값을 `_`로 잡은 채 `_.isEmpty`·`_.filter`를 불러 옵션 화면이 그려지지
// 않는 것을 막는다(2026-07-28 실측). 두 길로 들어온다:
//  1. 문서가 뜨기 전(`installAtDocumentStart`) — 확장 런타임이 쓰기 탭을 formV2로 옮길 때 이 파일을 새 문서 스크립트로 먼저
//     등록한다(`TabPage.navigate`의 `bootstrapFile`, 디버거 `Page.addScriptToEvaluateOnNewDocument`). 매니페스트 content script
//     (document_start)도 같은 파일이다 — 사람이 연 formV2 탭도 같은 보완을 받는다.
//  2. 다 뜬 뒤(`wing.compat` 페이지 호출) — 채우기 직전에 필요한 기능이 있는지 확인하고 없으면 채운다.
// Wing이 고치면 아무것도 하지 않는다.
(function installWingFormCompat() {
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

  if (
    globalThis.location?.hostname === "wing.coupang.com" &&
    globalThis.location?.pathname === "/tenants/seller-web/vendor-inventory/formV2"
  ) {
    installAtDocumentStart();
  }
  const calls = globalThis.__kiditemPageCalls || (globalThis.__kiditemPageCalls = {});
  calls["wing.compat"] = () => installInPage();
})();
