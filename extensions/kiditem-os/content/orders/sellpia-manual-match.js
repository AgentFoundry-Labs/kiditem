// 셀피아 수동상품매칭 근거 읽기(ISOLATED world, KID-363 L3 — 옛 `sellpia-manual-match.js`
// `requestSellpiaManualMatchSnapshot` 이식). 사이트 `extensions/src/sites/sellpia/manual-match.ts`가 수동상품매칭 화면
// (`product_manual_match.html`) 탭에 `page-call/bridge.js`와 함께 주입하고 두 호출을 묶음마다 부른다:
//   - `sellpia.manualMatchSearch` — 대상 코드마다 매칭 검색(동시 4), 매칭 제목·수량·md5 후보를 돌려준다.
//   - `sellpia.manualMatchStatus` — md5 100개 이하의 매칭 종류(M·P·E)를 돌려준다(화면의 shop uid로).
// 같은 출처 POST만 하고 읽기만 한다. 원문 응답은 돌려주지 않고 허용한 칸만 싣는다.
(function installSellpiaManualMatch() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  const EXPECTED_ORIGIN = "https://kiditem.sellpia.com";
  const PAGE_PATH = "/product_manual_match.html";
  const CODE_PATTERN = /^\d+(?:-\d+)*$/;
  const POSTGRES_INTEGER_MAX = 2147483647;
  const MAX_RESPONSE_CHARS = 2 * 1024 * 1024;
  const MAX_ROWS = 100000;
  const REQUEST_TIMEOUT_MS = 15000;
  const SEARCH_CONCURRENCY = 4;
  const STATUS_BATCH_SIZE = 100;

  class Stop extends Error {
    constructor(answer) {
      super(answer.status);
      this.answer = answer;
    }
  }
  const drift = (stage) => {
    throw new Stop({ status: "contract_drift", stage });
  };

  function cleanText(value, maximum) {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const normalized = String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return normalized && normalized.length <= maximum ? normalized : null;
  }

  function positiveInteger(value) {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const normalized = String(value).replace(/,/g, "").trim();
    if (!/^\d+$/.test(normalized)) return null;
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= POSTGRES_INTEGER_MAX ? parsed : null;
  }

  function sellpiaCode(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const productCode = cleanText(value.product_code, 100);
    const optionCode = value.option_code === "" || value.option_code == null ? null : cleanText(value.option_code, 100);
    if (!productCode || !/^\d+$/.test(productCode)) return null;
    if (optionCode !== null && !/^\d+$/.test(optionCode)) return null;
    return optionCode === null ? productCode : `${productCode}-${optionCode}`;
  }

  function onManualMatchPage() {
    return location.origin === EXPECTED_ORIGIN
      && location.pathname === PAGE_PATH
      && !/login/i.test(location.pathname)
      && !document.querySelector('input[type="password"]');
  }

  async function requestJson(body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      let response;
      try {
        response = await fetch(PAGE_PATH, { method: "POST", body, credentials: "same-origin", cache: "no-store", signal: controller.signal });
      } catch (error) {
        throw new Stop(error && error.name === "AbortError" ? { status: "timeout" } : { status: "network_failed" });
      }
      const responseUrl = new URL(response.url || PAGE_PATH, location.origin);
      if (
        response.status === 401
        || response.status === 403
        || response.redirected
        || responseUrl.origin !== location.origin
        || /login/i.test(responseUrl.pathname)
      ) throw new Stop({ status: "login_required" });
      if (!response.ok) throw new Stop({ status: "http_error", httpStatus: response.status });
      const text = await response.text();
      if (text.length < 1 || text.length > MAX_RESPONSE_CHARS) throw new Stop({ status: "invalid_response" });
      if (/^\s*(?:<!doctype\s+html|<html|<form)/i.test(text)) throw new Stop({ status: "login_required" });
      try {
        return JSON.parse(text);
      } catch {
        return drift("response-json");
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async function mapConcurrent(values, concurrency, worker) {
    const results = new Array(values.length);
    let cursor = 0;
    const runners = Array.from({ length: Math.min(concurrency, Math.max(1, values.length)) }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(values[index]);
      }
    });
    await Promise.all(runners);
    return results;
  }

  async function answer(work) {
    if (!onManualMatchPage()) return { status: "login_required" };
    try {
      return await work();
    } catch (error) {
      if (error instanceof Stop) return error.answer;
      return { status: "network_failed" };
    }
  }

  calls["sellpia.manualMatchSearch"] = (args) => answer(async () => {
    const codes = Array.isArray(args && args.codes) ? args.codes : null;
    if (!codes || codes.some((code) => typeof code !== "string" || !CODE_PATTERN.test(code))) {
      return { status: "invalid_response" };
    }
    const searched = await mapConcurrent(codes, SEARCH_CONCURRENCY, async (targetCode) => {
      const response = await requestJson(new URLSearchParams({
        modekey: "get_product_search_matched",
        search_value: targetCode,
        search_type: "product_code",
      }));
      if (response === null || response === false) return [];
      if (!Array.isArray(response) || response.length > MAX_ROWS) drift(`search-response:${targetCode}`);
      return response.flatMap((entry) => {
        const code = sellpiaCode(entry);
        const aliasTitle = cleanText(entry && entry.match_title, 500);
        const matchMd5 = cleanText(entry && entry.match_md5, 128);
        if (code !== targetCode || !matchMd5 || !/^[a-f0-9]{16,128}$/i.test(matchMd5)) drift(`search-row:${targetCode}`);
        if (!aliasTitle) return [];
        const itemCount = positiveInteger(entry && entry.item_count);
        if (itemCount === null) drift(`search-quantity:${targetCode}`);
        return [{ productCode: code, aliasTitle, matchMd5, itemCount }];
      });
    });
    return { status: "ok", candidates: searched.flat() };
  });

  calls["sellpia.manualMatchStatus"] = (args) => answer(async () => {
    const md5s = Array.isArray(args && args.matchMd5s) ? args.matchMd5s : null;
    if (!md5s || md5s.length > STATUS_BATCH_SIZE || md5s.some((value) => typeof value !== "string" || !/^[a-f0-9]{16,128}$/i.test(value))) {
      return { status: "invalid_response" };
    }
    const shopUid = cleanText(document.querySelector("#makeshop_uid") && document.querySelector("#makeshop_uid").value, 100);
    if (!shopUid) return { status: "contract_drift", stage: "shop-uid" };
    const body = new URLSearchParams({ modekey: "get_match_data", shop_uid: shopUid });
    md5s.forEach((matchMd5) => body.append("data[]", matchMd5));
    const response = await requestJson(body);
    if (!response || typeof response !== "object" || Array.isArray(response)) drift("status-response");
    const types = {};
    for (const matchMd5 of md5s) {
      const matchedType = cleanText(response[matchMd5] && response[matchMd5].matched_type, 1);
      if (matchedType !== "M" && matchedType !== "P" && matchedType !== "E") drift(`status-row:${matchMd5.slice(0, 12)}`);
      types[matchMd5] = matchedType;
    }
    return { status: "ok", types };
  });
})();
