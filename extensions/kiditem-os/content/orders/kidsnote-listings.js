// 키즈노트(shop.kidsnote.com) 등록 상품 목록 읽기(ISOLATED world, KID-381 — 옛 `mall-admin-listings.js` `readKidsnoteListings` 이식, 본문 그대로).
// 사이트 `extensions/src/sites/kidsnote/listings.ts`가 판매 상품 내역 화면 탭에 `page-call/bridge.js`와 함께 주입하고
// `kidsnote.listings`를 부른다. 조회만 한다. 답은 옛 읽기기의 결과 모양 그대로다.
(function installKidsnoteListings() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  // 옛 수집기의 요청 제한·간격·동시 수(30초 · 150ms · 3).
  const REQUEST_TIMEOUT_MS = 30000;
  const REQUEST_DELAY_MS = 150;
  const CONCURRENCY = 3;

  // 키즈노트(WISA 스마트윙 관리자) 안에서 돈다. 판매 상품 내역(`body=2010`)을 100개씩 1쪽부터 끝까지 읽는다(라이브
  // 2026-09-19: 1,107개 = 12쪽). 전체 수는 화면의 "현재 검색된 모든 상품(1,107개)" 이다. 몰 상품코드는 상품번호(pno)이고
  // 상태는 상태 칸(정상 · 품절 · 숨김) 그대로다. 칸은 머리 이름으로 찾는다.
  async function readKidsnoteListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const ROW_LIMIT = 20_000;
    const PAGE_LIMIT = 1_000;
    const fail = (errorCode, stage) => ({ success: false, errorCode, ...(stage ? { stage } : {}) });
    const drift = (stage) => {
      throw new Error(`CONTRACT_DRIFT:${stage}`);
    };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function text(value, maximum) {
      if (typeof value !== "string") return null;
      const normalized = value.replace(/\s+/g, " ").trim();
      return normalized && normalized.length <= maximum ? normalized : null;
    }

    function price(value) {
      const digits = String(value ?? "").replace(/[,\s원]/g, "");
      if (!/^\d{1,10}$/.test(digits)) return null;
      const amount = Number(digits);
      return amount <= 1_000_000_000 ? amount : null;
    }

    async function page(number) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const params = new URLSearchParams({ body: "2010", row: String(plan.pageSize), page: String(number) });
        const response = await fetch(`/_manage/?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== location.origin || /login/i.test(landed.pathname + landed.search)) {
          throw new Error("LOGIN_REQUIRED");
        }
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const doc = new DOMParser().parseFromString(await response.text(), "text/html");
        const list = doc.querySelector('form[name="prdFrm"], form#prdFrm');
        if (!list) {
          if (doc.querySelector('input[type="password"]')) throw new Error("LOGIN_REQUIRED");
          drift("list_form");
        }
        return doc;
      } finally {
        clearTimeout(timer);
      }
    }

    function totalOf(doc) {
      const match = /모든\s*상품\s*\(\s*([0-9,]+)\s*개\s*\)/.exec(doc.body?.textContent ?? "");
      if (!match) drift("total");
      return Number(match[1].replace(/,/g, ""));
    }

    function columns(doc) {
      const box = doc.querySelector('form[name="prdFrm"] input[name="check_pno[]"], form#prdFrm input[name="check_pno[]"]');
      const table = box?.closest("table");
      if (!table) return null;
      const headRow = [...table.querySelectorAll("tr")].find((tr) => tr.querySelector("th"));
      const heads = headRow ? [...headRow.cells].map((cell) => cell.textContent.replace(/\s+/g, "")) : [];
      const at = (name) => heads.indexOf(name);
      const found = { name: at("상품명"), date: at("등록일"), price: at("판매가"), state: at("상태"), image: at("이미지") };
      if (found.name < 0 || found.state < 0) drift("columns");
      return found;
    }

    try {
      const first = await page(1);
      const total = totalOf(first);
      if (!Number.isInteger(total) || total < 0) drift("total");
      if (total > ROW_LIMIT) drift("row_limit");
      const totalPages = Math.max(1, Math.ceil(total / plan.pageSize));
      if (totalPages > PAGE_LIMIT) drift("page_limit");
      const rows = [];
      const seen = new Set();
      for (let number = 1; number <= totalPages; number += 1) {
        if (number > 1 && requestDelayMs > 0) await wait(requestDelayMs);
        const doc = number === 1 ? first : await page(number);
        if (totalOf(doc) !== total) return fail("mall_total_changed");
        const at = columns(doc);
        const boxes = [...doc.querySelectorAll('form[name="prdFrm"] input[name="check_pno[]"], form#prdFrm input[name="check_pno[]"]')];
        if (boxes.length > 0 && !at) drift("columns");
        for (const box of boxes) {
          const mallProductCode = String(box.value ?? "");
          if (!/^\d{2,10}$/.test(mallProductCode)) drift("pno");
          if (seen.has(mallProductCode)) return fail("mall_total_changed");
          seen.add(mallProductCode);
          const cells = [...(box.closest("tr")?.cells ?? [])];
          const nameCell = cells[at.name];
          const productName = text(nameCell?.querySelector("a")?.textContent ?? nameCell?.textContent ?? "", 400);
          if (!productName) drift("product_name");
          const state = text(cells[at.state]?.textContent ?? "", 20);
          if (!state) drift("state");
          const registered = at.date >= 0 ? /(\d{2})\/(\d{2})\/(\d{2})/.exec(cells[at.date]?.textContent ?? "") : null;
          const src = at.image >= 0 ? cells[at.image]?.querySelector("img")?.getAttribute("src") ?? "" : "";
          const image = /^https:\/\//.test(src) && src.length <= 2000 ? src : null;
          rows.push({
            mallProductCode,
            productName,
            sellpiaName: null,
            sellerCode: null,
            salePrice: at.price >= 0 ? price(cells[at.price]?.textContent) : null,
            statusWords: [state],
            registeredOn: registered ? `20${registered[1]}-${registered[2]}-${registered[3]}` : null,
            ...(image ? { imageUrl: image } : {}),
          });
          if (rows.length > ROW_LIMIT) drift("row_limit");
        }
      }
      if (rows.length !== total) return fail("mall_total_changed");
      rows.sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode));
      return {
        success: true,
        snapshot: {
          collection: {
            totalRecords: total,
            recordsRead: rows.length,
            pagesRead: totalPages,
            totalPages,
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

  calls["kidsnote.listings"] = (args) => readKidsnoteListings(args && args.plan, REQUEST_TIMEOUT_MS, REQUEST_DELAY_MS, CONCURRENCY);
})();
