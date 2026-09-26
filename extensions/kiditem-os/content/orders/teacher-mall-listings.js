// 티쳐몰(shop.teacherville.co.kr, 퍼스트몰 selleradmin) 등록 상품 목록 읽기(ISOLATED world, KID-381 — 옛 `mall-admin-listings.js`
// `readTeacherListings` 이식, 본문 그대로). 사이트 `extensions/src/sites/teacher-mall/listings.ts`가 판매상품 목록 화면 탭에
// `page-call/bridge.js`와 함께 주입하고 `teacher-mall.listings`를 부른다. 조회만 한다. 답은 옛 읽기기의 결과 모양 그대로다.
(function installTeacherListings() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  // 옛 수집기의 요청 제한·간격·동시 수(30초 · 150ms · 3).
  const REQUEST_TIMEOUT_MS = 30000;
  const REQUEST_DELAY_MS = 150;
  const CONCURRENCY = 3;

  // 티쳐몰(퍼스트몰 selleradmin) 안에서 돈다. 판매상품 목록(`/selleradmin/goods/catalog`)을 100개씩 1쪽부터 읽는다(라이브
  // 2026-09-19: 1,365개). 칸은 머리 이름으로 찾는다 — 상품명 머리가 두 칸(사진 · 이름)을 덮어 머리를 칸 수만큼 편다. 상품명
  // 칸에는 "[상품번호: …]" 링크와 이름 링크가 함께 있어 이름 링크만 고른다. 상태 칸은 승인(승인 · 미승인)과 판매 상태(정상 ·
  // 품절 · 재고확보중 · 판매중지), 노출 칸은 노출 · 미노출이다. 전체 수를 따로 주지 않아 한 쪽이 덜 차면 끝이다.
  async function readTeacherListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
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

    async function page(number) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const params = new URLSearchParams({ page: String(number), perpage: String(plan.pageSize) });
        const response = await fetch(`/selleradmin/goods/catalog?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== location.origin || landed.pathname !== "/selleradmin/goods/catalog") {
          throw new Error("LOGIN_REQUIRED");
        }
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const doc = new DOMParser().parseFromString(await response.text(), "text/html");
        if (doc.querySelector('input[type="password"]')) throw new Error("LOGIN_REQUIRED");
        return doc;
      } finally {
        clearTimeout(timer);
      }
    }

    function columns(box) {
      const table = box.closest("table");
      const headRow = table ? [...table.querySelectorAll("tr")].find((tr) => tr.querySelector("th")) : null;
      if (!headRow) drift("head");
      const heads = [];
      for (const cell of headRow.cells) {
        for (let span = 0; span < Math.max(1, cell.colSpan || 1); span += 1) heads.push(cell.textContent.replace(/\s+/g, ""));
      }
      const at = (prefix) => heads.findIndex((head) => head.startsWith(prefix));
      const found = { price: at("판매가"), state: at("상태"), shown: at("노출"), date: at("등록일") };
      if (found.state < 0) drift("state_column");
      return found;
    }

    try {
      const rows = [];
      const seen = new Set();
      let pages = 0;
      for (let number = 1; ; number += 1) {
        if (pages >= PAGE_LIMIT) drift("page_limit");
        if (pages > 0 && requestDelayMs > 0) await wait(requestDelayMs);
        const doc = await page(number);
        pages += 1;
        const boxes = [...doc.querySelectorAll('input[name="goods_seq[]"]')];
        if (number === 1 && boxes.length === 0 && !doc.querySelector("table")) drift("list");
        const at = boxes.length > 0 ? columns(boxes[0]) : null;
        let fresh = 0;
        for (const box of boxes) {
          const mallProductCode = String(box.value ?? "");
          if (!/^\d{3,10}$/.test(mallProductCode)) drift("goods_seq");
          // 마지막 쪽을 넘긴 쪽 번호에 마지막 쪽을 다시 주는 목록이 있다 — 겹치면 끝이다.
          if (seen.has(mallProductCode)) continue;
          seen.add(mallProductCode);
          fresh += 1;
          const cells = [...(box.closest("tr")?.cells ?? [])];
          const numberLink = /^\[상품번호:\s*\d+\]$/;
          const nameCell = cells.find((cell) => [...cell.querySelectorAll("a")].some((anchor) => numberLink.test(anchor.textContent.trim())));
          const productName = text([...(nameCell?.querySelectorAll("a") ?? [])]
            .map((anchor) => anchor.textContent)
            .find((value) => !numberLink.test(value.trim()) && value.trim().length > 1) ?? "", 400);
          if (!productName) drift("goods_name");
          const stateText = (cells[at.state]?.textContent ?? "").replace(/\s+/g, "");
          const state = /(미승인|승인)(정상|품절|재고확보중|판매중지)/.exec(stateText);
          if (!state) drift("state");
          const shown = at.shown >= 0 ? text(cells[at.shown]?.textContent ?? "", 20) : null;
          const digits = at.price >= 0 ? String(cells[at.price]?.textContent ?? "").replace(/[,\s원]/g, "") : "";
          const registered = at.date >= 0 ? /(\d{4})-(\d{2})-(\d{2})/.exec(cells[at.date]?.textContent ?? "") : null;
          const src = cells.map((cell) => cell.querySelector("img")?.getAttribute("src") ?? "").find(Boolean) ?? "";
          const image = /^https:\/\//.test(src) && src.length <= 2000 ? src : null;
          rows.push({
            mallProductCode,
            productName,
            sellpiaName: null,
            sellerCode: null,
            salePrice: /^\d{1,10}$/.test(digits) ? Number(digits) : null,
            statusWords: [state[1], state[2], ...(shown ? [shown] : [])],
            registeredOn: registered ? `${registered[1]}-${registered[2]}-${registered[3]}` : null,
            ...(image ? { imageUrl: image } : {}),
          });
          if (rows.length > ROW_LIMIT) drift("row_limit");
        }
        if (boxes.length < plan.pageSize || fresh === 0) break;
      }
      rows.sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode));
      const totalPages = Math.max(1, Math.ceil(rows.length / plan.pageSize));
      return {
        success: true,
        snapshot: {
          collection: {
            totalRecords: rows.length,
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

  calls["teacher-mall.listings"] = (args) => readTeacherListings(args && args.plan, REQUEST_TIMEOUT_MS, REQUEST_DELAY_MS, CONCURRENCY);
})();
