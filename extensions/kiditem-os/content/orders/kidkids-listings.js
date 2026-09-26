// 키드키즈(partner.kidkids.net) 등록 상품 목록 읽기(ISOLATED world, KID-363 L2 — 옛 `mall-admin-listings.js` `readKidkidsListings` 이식, 본문 그대로).
// 사이트 `extensions/src/sites/kidkids`의 `readListings`가 그 몰 관리자 화면 탭에 `page-call/bridge.js`와 함께 주입하고
// `kidkids.listings`를 부른다. 조회만 한다. 답은 옛 읽기기의 결과 모양(`{success, snapshot: {collection, rows, proof}}` 또는
// `{success: false, errorCode, stage}`) 그대로다 — 원문 응답·토큰은 싣지 않는다.
(function installKidkidsListings() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  // 옛 수집기의 요청 제한·간격·동시 수(30초 · 150ms · 3).
  const REQUEST_TIMEOUT_MS = 30000;
  const REQUEST_DELAY_MS = 150;
  const CONCURRENCY = 3;

  // 키드키즈 파트너센터 안에서 돈다. 목록 화면은 수정일 순이라 같은 날짜가 많아 쪽 경계에서
  // 상품이 겹치고 빠진다(라이브 실측: 3,478개 중 쪽으로는 2,222개만). 그래서 화면이 제공하는
  // "상품리스트 다운받기"(엑셀=HTML 표)를 그대로 받아 전체를 한 번에 읽는다. 그 링크는
  // 판매사가 자기 상품만 고르도록 몰이 만들어 둔 것이고, 우리는 그대로 다시 부르기만 한다.
  // 목록 화면의 "( 1/87, 수량 : 3,478개 )" 로 다운로드가 전체를 담았는지 검사한다.
  async function readKidkidsListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const LIST_PATH = "/sales/goods_list_renewal.htm";
    const ROW_LIMIT = 20_000;
    const MAX_LIST_BYTES = 8 * 1024 * 1024;
    const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;
    const COUNTER = /<strong[^>]*>\s*\d+\s*<\/strong>\s*\/\s*\d+\s*,\s*수량\s*:\s*([\d,]+)\s*개/;
    const fail = (errorCode, stage) => ({ success: false, errorCode, ...(stage ? { stage } : {}) });
    const drift = (stage) => {
      throw new Error(`CONTRACT_DRIFT:${stage}`);
    };
    const decoder = new TextDecoder("euc-kr");

    function text(value, maximum) {
      if (typeof value !== "string") return null;
      const normalized = value.replace(/\s+/g, " ").trim();
      return normalized && normalized.length <= maximum ? normalized : null;
    }
    function price(value) {
      const normalized = String(value ?? "").replace(/[,\s]/g, "");
      if (!/^\d{1,10}$/.test(normalized)) return null;
      const parsed = Number(normalized);
      return parsed <= 1_000_000_000 ? parsed : null;
    }

    async function get(path, maxBytes) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(path, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== plan.sourceOrigin || /login/i.test(landed.pathname)) {
          throw new Error("LOGIN_REQUIRED");
        }
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > maxBytes) throw new Error("INVALID_RESPONSE");
        return decoder.decode(buffer);
      } finally {
        clearTimeout(timer);
      }
    }

    try {
      if (location.origin !== plan.sourceOrigin) return fail("mall_login_required");

      // 1) 목록 화면 — 전체 건수와 다운로드 링크를 읽는다.
      const listHtml = await get(`${LIST_PATH}?pNum=1`, MAX_LIST_BYTES);
      const listDoc = new DOMParser().parseFromString(listHtml, "text/html");
      if (listDoc.querySelector('input[type="password"]')) throw new Error("LOGIN_REQUIRED");
      const counter = COUNTER.exec(listHtml);
      if (!counter) drift("counter");
      const total = Number(counter[1].replace(/,/g, ""));
      if (!Number.isSafeInteger(total) || total < 0) drift("total");
      if (total > ROW_LIMIT) return fail("mall_invalid_snapshot", "row_limit");
      const anchor = [...listDoc.querySelectorAll('a[href*="glist_dn.htm"]')]
        .find((candidate) => !/glist_dn_(?:wb|op)/.test(candidate.getAttribute("href") || ""));
      if (!anchor) drift("download_link");
      const downloadUrl = new URL(anchor.getAttribute("href"), `${plan.sourceOrigin}${LIST_PATH}`);
      // 몰이 만든 링크만 따른다 — 같은 서버의 상품리스트 다운로드여야 한다.
      if (downloadUrl.origin !== plan.sourceOrigin || !/\/glist_dn\.htm$/.test(downloadUrl.pathname)) {
        drift("download_url");
      }

      // 2) 상품리스트 다운로드 — 엑셀(HTML 표) 전체.
      const downloadHtml = await get(
        `${downloadUrl.pathname}${downloadUrl.search}`,
        MAX_DOWNLOAD_BYTES,
      );
      const doc = new DOMParser().parseFromString(downloadHtml, "text/html");
      const table = [...doc.querySelectorAll("table")]
        .sort((left, right) => right.rows.length - left.rows.length)[0];
      if (!table || table.rows.length < 1) drift("download_table");
      const headers = [...table.rows[0].cells].map((cell) => cell.textContent.replace(/\s+/g, " ").trim());
      const column = (name) => {
        const index = headers.indexOf(name);
        if (index < 0) drift(`column:${name}`);
        return index;
      };
      const codeCol = column("상품코드");
      const nameCol = column("상품명");
      const invoiceCol = column("송장용 상품명");
      const priceCol = column("판매가");
      const soldCol = column("품절여부");
      // 자체상품코드 칸. 등록할 때 셀피아 코드를 심어 두면 여기로 나온다(아직 거의 빈다).
      const sellerCol = headers.indexOf("P 코드");

      const seen = new Set();
      const rows = [];
      for (let index = 1; index < table.rows.length; index += 1) {
        const cells = [...table.rows[index].cells];
        const code = text(cells[codeCol]?.textContent, 30);
        if (!code || !/^\d+$/.test(code)) drift("code");
        // 다운로드는 상품마다 한 줄이다. 겹치면 형식이 바뀐 것이다.
        if (seen.has(code)) drift("duplicate");
        seen.add(code);
        const productName = text(cells[nameCol]?.textContent, 400);
        if (!productName) drift("goods_name");
        const status = text(cells[soldCol]?.textContent, 20);
        if (!status) drift("status");
        rows.push({
          mallProductCode: code,
          productName,
          sellpiaName: text(cells[invoiceCol]?.textContent, 400),
          sellerCode: sellerCol < 0 ? null : text(cells[sellerCol]?.textContent, 60),
          salePrice: price(cells[priceCol]?.textContent),
          statusWords: [status],
          registeredOn: null,
        });
      }
      // 다운로드가 목록 전체를 담았는지 — 한 줄이라도 어긋나면 저장하지 않는다.
      if (rows.length !== total) drift("row_count");
      rows.sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode));
      return {
        success: true,
        snapshot: {
          collection: {
            totalRecords: total,
            recordsRead: rows.length,
            pagesRead: 1,
            totalPages: 1,
            detailsRead: 0,
            detailsMissing: 0,
          },
          rows,
          proof: { mallKey: plan.mallKey, pageSize: plan.pageSize, validatedList: true },
        },
      };
    } catch (error) {
      if (error?.name === "AbortError") return fail("mall_timeout");
      if (error?.message === "LOGIN_REQUIRED") return fail("mall_login_required");
      if (error?.message === "INVALID_RESPONSE") return fail("mall_invalid_snapshot");
      if (error?.message?.startsWith("CONTRACT_DRIFT:")) {
        return fail("mall_contract_drift", error.message.slice("CONTRACT_DRIFT:".length, 160));
      }
      return fail("mall_network_failed");
    }
  }

  calls["kidkids.listings"] = (args) => readKidkidsListings(args && args.plan, REQUEST_TIMEOUT_MS, REQUEST_DELAY_MS, CONCURRENCY);
})();
