(function installMallAdminListingsCollector(root) {
  "use strict";

  // 몰 관리자 화면에서 등록 상품 목록을 읽는다(KID-246 2단계). 조회만 한다 — 상품 목록과
  // 상품 보기(읽기 전용) 화면을 GET 으로 부르고, 저장 · 수정 · 승인요청 화면은 열지 않는다.
  const DEFAULT_TAB_READY_TIMEOUT_MS = 45_000;
  const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
  // 몰 서버에 부담을 주지 않게 요청 사이를 띄우고, 동시에 세 개까지만 부른다.
  const DEFAULT_REQUEST_DELAY_MS = 150;
  const DEFAULT_CONCURRENCY = 3;

  function failure(errorCode, stage) {
    return { success: false, errorCode, ...(stage ? { stage } : {}) };
  }

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

  // 아이스크림 PO 안에서 돈다. 상품 정보 관리 화면이 부르는 목록 조회를 같은 검색 폼(보안
  // 서명 포함)으로 기간 없이 부르고, 셀피아 상품 이름은 상품 보기(type=R)의 고시 '품명 및
  // 모델명'(174)에서 읽는다. 목록 원문은 넘기지 않는다.
  async function readIcecreamListings(plan, requestTimeoutMs, requestDelayMs, concurrency) {
    const LIST_PATH = "/goods/goodsMgmt.getGoodsList.do";
    const VIEW_PATH = "/goods/goodsCommon.goodsView.do";
    const PAGE_LIMIT = 1000;
    const ROW_LIMIT = 20_000;
    const MAX_LIST_CHARS = 64 * 1024 * 1024;
    const MAX_VIEW_CHARS = 8 * 1024 * 1024;
    const NAME_NOTICE = /"goodsNotiItemCd"\s*:\s*"174"\s*,\s*"notiItemCmt"\s*:\s*"((?:[^"\\]|\\.)*)"/;
    const fail = (errorCode, stage) => ({ success: false, errorCode, ...(stage ? { stage } : {}) });
    const drift = (stage) => {
      throw new Error(`CONTRACT_DRIFT:${stage}`);
    };
    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

    function text(value, maximum) {
      if (typeof value !== "string" && typeof value !== "number") return null;
      const normalized = String(value).replace(/\s+/g, " ").trim();
      return normalized && normalized.length <= maximum ? normalized : null;
    }
    function price(value) {
      if (value === null || value === undefined || value === "") return null;
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 1_000_000_000 ? parsed : null;
    }
    function isoDate(value) {
      const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? ""));
      return match ? match[1] : null;
    }

    async function get(path, headers) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(path, {
          credentials: "include",
          cache: "no-store",
          headers,
          signal: controller.signal,
        });
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== plan.sourceOrigin || /login/i.test(landed.pathname)) {
          throw new Error("LOGIN_REQUIRED");
        }
        if (!response.ok) throw new Error("NETWORK_FAILED");
        return await response.text();
      } finally {
        clearTimeout(timer);
      }
    }

    function rowFrom(item) {
      if (!item || typeof item !== "object" || Array.isArray(item)) drift("row");
      const code = text(item.goodsNo, 30);
      if (!code || !/^\d+$/.test(code)) drift("goods_no");
      const productName = text(item.goodsNm, 400);
      if (!productName) drift("goods_name");
      const saleStatus = text(item.saleStatNm, 20);
      if (!saleStatus) drift("sale_status");
      if (item.dispYn !== "Y" && item.dispYn !== "N") drift("display");
      return {
        mallProductCode: code,
        productName,
        sellpiaName: null,
        // 업체상품코드. 등록할 때 셀피아 코드를 심어 두면 목록에 그대로 실려 온다.
        sellerCode: text(item.entrGoodsNo, 60),
        salePrice: price(item.salePrc),
        statusWords: [saleStatus, item.dispYn === "Y" ? "전시" : "전시안함"],
        registeredOn: isoDate(item.aprvDt) ?? isoDate(item.sysRegDtm),
      };
    }

    try {
      if (location.origin !== plan.sourceOrigin) return fail("mall_login_required");
      const form = document.getElementById("goodsInfoGridForm");
      if (!form) {
        return document.querySelector('input[type="password"]')
          ? fail("mall_login_required")
          : fail("mall_contract_drift", "search_form");
      }
      // 화면의 조회 버튼과 같은 순서 — 기간 조건, 검색 폼 전체, 쪽 크기와 쪽 번호.
      const searchForm = new URLSearchParams();
      for (const [name, value] of new FormData(form)) {
        if (typeof value === "string") searchForm.append(name, value);
      }
      const today = new Date();
      const pad = (value) => String(value).padStart(2, "0");
      const endOfToday = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}T23:59:59`;

      async function readList(pageIdx) {
        const params = new URLSearchParams({
          goodsStartDtm: "2000-01-01T00:00:00",
          goodsEndDtm: endOfToday,
          goodsDtmIgnoreOption: "check",
        });
        for (const [name, value] of searchForm) params.append(name, value);
        params.append("rowsPerPage", String(plan.pageSize));
        params.append("pageIdx", String(pageIdx));
        const body = await get(`${LIST_PATH}?${params}`, { Accept: "application/json" });
        if (body.length > MAX_LIST_CHARS) throw new Error("INVALID_RESPONSE");
        let json;
        try {
          json = JSON.parse(body);
        } catch {
          if (/type=["']?password/i.test(body)) throw new Error("LOGIN_REQUIRED");
          drift("json");
        }
        if (json?.succeeded === false) drift("succeeded");
        const total = Number(json?.totalCount);
        if (!Number.isSafeInteger(total) || total < 0) drift("total");
        if (!Array.isArray(json?.payloads)) drift("payloads");
        return { total, list: json.payloads };
      }

      const first = await readList(1);
      if (first.total > ROW_LIMIT) return fail("mall_invalid_snapshot", "row_limit");
      const pages = Math.max(1, Math.ceil(first.total / plan.pageSize));
      if (pages > PAGE_LIMIT) return fail("mall_invalid_snapshot", "page_limit");
      const seen = new Set();
      const rows = [];
      for (let pageIdx = 1; pageIdx <= pages; pageIdx += 1) {
        if (pageIdx > 1 && requestDelayMs > 0) await wait(requestDelayMs);
        const page = pageIdx === 1 ? first : await readList(pageIdx);
        if (page.total !== first.total) return fail("mall_total_changed");
        const expected = pageIdx < pages ? plan.pageSize : first.total - plan.pageSize * (pages - 1);
        if (page.list.length !== expected) drift("page_size");
        for (const item of page.list) {
          const row = rowFrom(item);
          if (seen.has(row.mallProductCode)) return fail("mall_total_changed");
          seen.add(row.mallProductCode);
          rows.push(row);
        }
      }

      let detailsRead = 0;
      let detailsMissing = 0;
      let cursor = 0;
      let halted = false;
      async function detailWorker() {
        while (!halted && cursor < rows.length) {
          const row = rows[cursor];
          cursor += 1;
          try {
            const params = new URLSearchParams({ type: "R", goodsNo: row.mallProductCode });
            const html = await get(`${VIEW_PATH}?${params}`);
            if (html.length > MAX_VIEW_CHARS) throw new Error("INVALID_RESPONSE");
            if (!html.includes("goodsNotiItemCd") && /type=["']?password/i.test(html)) {
              throw new Error("LOGIN_REQUIRED");
            }
            const notice = NAME_NOTICE.exec(html);
            row.sellpiaName = notice ? text(JSON.parse(`"${notice[1]}"`), 400) : null;
            detailsRead += 1;
          } catch (error) {
            if (error?.message === "LOGIN_REQUIRED") {
              halted = true;
              throw error;
            }
            // 상세 하나를 못 읽어도 목록은 온전하다. 그 상품은 상품명으로만 잇는다.
            detailsMissing += 1;
          }
          if (requestDelayMs > 0) await wait(requestDelayMs);
        }
      }
      await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, rows.length)) }, detailWorker));

      rows.sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode));
      return {
        success: true,
        snapshot: {
          collection: {
            totalRecords: first.total,
            recordsRead: rows.length,
            pagesRead: pages,
            totalPages: pages,
            detailsRead,
            detailsMissing,
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

  // 온채널 공급사 안에서 돈다. 등록 상품 관리 화면이 쪽마다 15줄을 HTML 로 주고, 쪽 수는
  // 쪽 번호 링크가 말한다. 셀피아 이름도 자체코드 칸도 없어 상품명으로만 잇는다 — 상태 칸은
  // 판매상태와 재고상태를 함께 담는다(`판매중 / 일시품절`).
  async function readOnchannelListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const LIST_PATH = "/products_management.php";
    const ROW_LIMIT = 20_000;
    const MAX_PAGE_BYTES = 8 * 1024 * 1024;
    const fail = (errorCode, stage) => ({ success: false, errorCode, ...(stage ? { stage } : {}) });
    const drift = (stage) => {
      throw new Error(`CONTRACT_DRIFT:${stage}`);
    };

    function text(value, maximum) {
      if (typeof value !== "string") return null;
      const normalized = value.replace(/\s+/g, " ").trim();
      return normalized && normalized.length <= maximum ? normalized : null;
    }
    function price(value) {
      const normalized = String(value ?? "").replace(/[,\s원]/g, "");
      if (!/^\d{1,10}$/.test(normalized)) return null;
      const parsed = Number(normalized);
      return parsed <= 1_000_000_000 ? parsed : null;
    }

    async function getPage(page) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(`${LIST_PATH}?page=${page}`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== plan.sourceOrigin || /login/i.test(landed.pathname)) {
          throw new Error("LOGIN_REQUIRED");
        }
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const body = await response.text();
        if (body.length > MAX_PAGE_BYTES) throw new Error("INVALID_RESPONSE");
        return new DOMParser().parseFromString(body, "text/html");
      } finally {
        clearTimeout(timer);
      }
    }

    // 상품 줄만 담긴 표. 상품코드 칸(3번째)이 `CH` 로 시작하는 표를 고른다 — 화면의 다른
    // 표(검색 · 안내)를 잡으면 줄 수가 맞아도 내용이 비어 온다.
    function goodsTable(doc) {
      const tables = [...doc.querySelectorAll("table")];
      return tables.find((table) => [...table.rows].slice(1).some(
        (row) => /^CH\d+$/.test((row.cells[2]?.textContent || "").trim()),
      )) || null;
    }

    function maxPage(doc) {
      const pages = [...doc.querySelectorAll("a")]
        .map((anchor) => Number((anchor.getAttribute("href") || "").match(/[?&]page=(\d+)/)?.[1] || 0))
        .filter((value) => Number.isSafeInteger(value) && value > 0);
      return pages.length > 0 ? Math.max(...pages) : 1;
    }

    try {
      const first = await getPage(1);
      const totalPages = maxPage(first);
      if (totalPages < 1 || totalPages > 1_000) drift("total_pages");
      const rows = [];
      const seen = new Set();
      let pagesRead = 0;
      for (let page = 1; page <= totalPages; page += 1) {
        const doc = page === 1 ? first : await getPage(page);
        pagesRead += 1;
        const table = goodsTable(doc);
        // 마지막 쪽 뒤에 빈 쪽이 오는 일은 없다. 표가 없으면 화면이 바뀐 것이다.
        if (!table) drift("goods_table");
        for (const row of [...table.rows].slice(1)) {
          const cells = row.cells;
          const mallProductCode = text(cells[2]?.textContent, 60);
          if (!mallProductCode || !/^CH\d+$/.test(mallProductCode)) continue;
          if (seen.has(mallProductCode)) continue;
          seen.add(mallProductCode);
          const productName = text(cells[5]?.textContent, 400);
          if (!productName) drift("goods_name");
          // `판매중 / 일시품절` 처럼 판매상태와 재고상태가 한 칸에 온다. 둘 다 남긴다.
          const statusWords = (cells[3]?.textContent || "")
            .split(/\s*\n\s*|\s{2,}/)
            .map((word) => text(word, 20))
            .filter(Boolean)
            .slice(0, 4);
          if (statusWords.length === 0) drift("status");
          const imageUrl = cells[4]?.querySelector("img")?.getAttribute("src") || null;
          rows.push({
            mallProductCode,
            productName,
            sellpiaName: null,
            sellerCode: null,
            salePrice: price(cells[7]?.textContent),
            statusWords,
            registeredOn: null,
            ...(imageUrl && /^https:\/\//.test(imageUrl) ? { imageUrl } : {}),
          });
          if (rows.length > ROW_LIMIT) drift("row_limit");
        }
        if (page < totalPages && requestDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, requestDelayMs));
        }
      }
      if (rows.length === 0) drift("empty_list");
      rows.sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode));
      return {
        success: true,
        snapshot: {
          collection: {
            totalRecords: rows.length,
            recordsRead: rows.length,
            pagesRead,
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

  // 꼬망세(EduPre) 입점관리자 안에서 돈다. 배송상품 목록이 `listmaxcount` 로 한 쪽 크기를
  // 정해 줘서 전체를 한 번에 받는다(라이브 2026-09-18: 2,602개). 셀피아 이름도 자체코드
  // 칸도 없어 상품명으로만 잇는다.
  async function readKkomangseListings(plan, requestTimeoutMs, _requestDelayMs, _concurrency) {
    const LIST_PATH = "/subAdmin/_product.list.php";
    const ROW_LIMIT = 20_000;
    const MAX_LIST_BYTES = 32 * 1024 * 1024;
    const CODE = /chk_pcode\[([A-Za-z0-9-]{1,60})\]/;
    const fail = (errorCode, stage) => ({ success: false, errorCode, ...(stage ? { stage } : {}) });
    const drift = (stage) => {
      throw new Error(`CONTRACT_DRIFT:${stage}`);
    };

    function text(value, maximum) {
      if (typeof value !== "string") return null;
      const normalized = value.replace(/\s+/g, " ").trim();
      return normalized && normalized.length <= maximum ? normalized : null;
    }
    // 판매가 칸은 정가와 실제 판매가를 위아래로 담는다. 아래(마지막) 값이 실제로 파는 값이다.
    function price(cell) {
      const amounts = (cell?.textContent || "").match(/[\d,]+\s*원/g) || [];
      const last = amounts[amounts.length - 1];
      const normalized = String(last ?? "").replace(/[,\s원]/g, "");
      if (!/^\d{1,10}$/.test(normalized)) return null;
      const parsed = Number(normalized);
      return parsed <= 1_000_000_000 ? parsed : null;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      let doc;
      try {
        const response = await fetch(`${LIST_PATH}?listmaxcount=${plan.pageSize}`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== plan.sourceOrigin || /login/i.test(landed.pathname)) {
          throw new Error("LOGIN_REQUIRED");
        }
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const body = await response.text();
        if (body.length > MAX_LIST_BYTES) throw new Error("INVALID_RESPONSE");
        doc = new DOMParser().parseFromString(body, "text/html");
      } finally {
        clearTimeout(timer);
      }

      // 상품 줄에는 상품코드를 담은 체크박스가 있다. 그 체크박스를 가진 표가 상품 목록이다 —
      // 검색 폼의 표도 줄이 많아 줄 수로 고르면 엉뚱한 표를 잡는다.
      const table = [...doc.querySelectorAll("table")].find(
        (candidate) => candidate.querySelector('input[name^="chk_pcode["]'),
      );
      if (!table) drift("goods_table");

      const rows = [];
      const seen = new Set();
      for (const row of [...table.rows].slice(1)) {
        const checkbox = row.querySelector('input[name^="chk_pcode["]');
        const mallProductCode = text(CODE.exec(checkbox?.getAttribute("name") || "")?.[1], 60);
        if (!mallProductCode || seen.has(mallProductCode)) continue;
        seen.add(mallProductCode);
        const cells = row.cells;
        // 상품정보 칸에 상품명 · 상품코드 · 몰 내부번호가 함께 온다. 이름만 남긴다 —
        // 끝에 붙는 `[17726127426200]` 를 떼지 않으면 셀피아 이름과 영영 맞지 않는다
        // (라이브 2026-09-18: 판매중 449개 중 9개만 이어졌다).
        const info = (cells[3]?.textContent || "").replace(/\s+/g, " ").trim();
        const productName = text(
          info.replace(mallProductCode, " ").replace(/\[\s*\d{7,20}\s*\]/g, " "),
          400,
        );
        if (!productName) drift("goods_name");
        const status = text(cells[2]?.textContent, 20);
        if (!status) drift("status");
        const imageUrl = cells[3]?.querySelector("img")?.getAttribute("src") || null;
        rows.push({
          mallProductCode,
          productName,
          sellpiaName: null,
          sellerCode: null,
          salePrice: price(cells[5]),
          statusWords: [status],
          registeredOn: null,
          ...(imageUrl && /^https:\/\//.test(imageUrl) ? { imageUrl } : {}),
        });
        if (rows.length > ROW_LIMIT) drift("row_limit");
      }
      if (rows.length === 0) drift("empty_list");
      // 한 쪽에 다 담겼는지 — 쪽 크기만큼 꽉 찼으면 뒤가 잘렸다는 뜻이다.
      if (rows.length >= plan.pageSize) drift("row_count");
      rows.sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode));
      return {
        success: true,
        snapshot: {
          collection: {
            totalRecords: rows.length,
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

  /**
   * 올웨이즈 판매자센터 상품 목록(라이브 2026-09-19). 상품 조회/수정 화면이 부르는 백엔드 목록 API 를 **화면 안에서**
   * 부른다 — 인증 토큰은 이 화면의 localStorage 에 있고 x-access-token 으로 싣는다. 토큰은 이 함수 밖으로 나가지
   * 않는다. 먼저 전체 수(`v2/count-request`)를 읽고 1쪽부터 쪽을 다 돈다(`v2/list-request`, page 는 1부터).
   * 상품코드는 몰 상품 고유번호(`_id`), 상태는 soldOut 한 칸(품절 · 판매중)이다.
   */
  async function readAlwayzListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const BACKEND = "https://alwayz-seller-back.ilevit.com";
    const TOKEN_KEY = "@alwayz@seller@token@";
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

    const token = (() => {
      try {
        return localStorage.getItem(TOKEN_KEY);
      } catch {
        return null;
      }
    })();
    if (!token) return fail("mall_login_required");

    async function post(path, body) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(`${BACKEND}${path}`, {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json", "x-access-token": token },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) throw new Error("LOGIN_REQUIRED");
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const json = await response.json().catch(() => null);
        if (!json || typeof json !== "object") throw new Error("INVALID_RESPONSE");
        return json;
      } finally {
        clearTimeout(timer);
      }
    }

    // 등록일은 한국 날짜로 둔다(몰 화면이 그렇게 보인다).
    function koreanDay(value) {
      const time = Date.parse(String(value ?? ""));
      if (!Number.isFinite(time)) return null;
      return new Date(time + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    }

    try {
      const condition = { type: "item", itemCondition: {} };
      const count = await post("/sellers/items/v2/count-request", { condition });
      if (Number(count.status) !== 200 || !Number.isInteger(count.data) || count.data < 0) drift("count");
      const total = count.data;
      if (total > ROW_LIMIT) drift("row_limit");
      const totalPages = Math.max(1, Math.ceil(total / plan.pageSize));
      if (totalPages > PAGE_LIMIT) drift("page_limit");

      const rows = [];
      const seen = new Set();
      for (let page = 1; page <= totalPages; page += 1) {
        if (page > 1 && requestDelayMs > 0) await wait(requestDelayMs);
        const list = await post("/sellers/items/v2/list-request", { condition, page, pageLimit: plan.pageSize });
        if (Number(list.status) !== 2000 || !Array.isArray(list.data?.itemsInfo)) drift("list");
        for (const item of list.data.itemsInfo) {
          const mallProductCode = text(String(item?._id ?? ""), 60);
          if (!mallProductCode || !/^[0-9a-f]{24}$/i.test(mallProductCode)) drift("item_id");
          if (seen.has(mallProductCode)) continue;
          seen.add(mallProductCode);
          const productName = text(item.itemTitle, 400);
          if (!productName) drift("item_title");
          if (typeof item.soldOut !== "boolean") drift("sold_out");
          const price = Number(item.teamPurchasePrice);
          const image = Array.isArray(item.mainImageUris) ? item.mainImageUris[0] : null;
          rows.push({
            mallProductCode,
            productName,
            sellpiaName: null,
            // [코드기입] 칸. 판매자가 적어 둔 코드가 있으면 그 코드로 잇는다(지금은 전부 비어 있다).
            sellerCode: text(item.manualItemCode, 60),
            salePrice: Number.isInteger(price) && price >= 0 && price <= 1_000_000_000 ? price : null,
            statusWords: [item.soldOut ? "품절" : "판매중"],
            registeredOn: koreanDay(item.createdAt),
            ...(typeof image === "string" && /^https:\/\//.test(image) && image.length <= 2000 ? { imageUrl: image } : {}),
          });
          if (rows.length > ROW_LIMIT) drift("row_limit");
        }
      }
      // 읽는 사이 상품이 늘거나 줄면 한 번에 찍은 목록이 아니다.
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

  /**
   * 아트공구(카페24 공급사 관리자) 상품목록(라이브 2026-09-19: 550개). 목록 화면(ProductManage)을 100개씩 1쪽부터
   * 끝까지 읽는다 — 등록일 순으로 쪽을 돌아도 겹치지 않았다(6쪽에 고유 550개). 줄의 체크박스가 상품번호와
   * 진열 · 판매 상태를 들고 있고([판매함] · [판매안함] 버튼도 이 값을 읽는다), 이름은 상품명 링크, 값은 '판매가'
   * 칸이다. 셀피아 이름도 자체상품코드 칸도 목록에 없어 상품명으로만 잇는다.
   */
  async function readArt09Listings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const LIST_PATH = "/disp/admin/shop1/product/ProductManage";
    const ROW_LIMIT = 20_000;
    const PAGE_LIMIT = 1_000;
    const MAX_PAGE_BYTES = 16 * 1024 * 1024;
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
      const normalized = String(value ?? "").replace(/[,\s원]/g, "");
      if (!/^\d{1,10}$/.test(normalized)) return null;
      const parsed = Number(normalized);
      return parsed <= 1_000_000_000 ? parsed : null;
    }
    function counter(doc) {
      const value = Number(String(doc.querySelector(".total strong")?.textContent || "").replace(/[^\d]/g, ""));
      return Number.isSafeInteger(value) ? value : null;
    }

    async function page(number) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const params = new URLSearchParams({ orderby: "regist_d", limit: String(plan.pageSize), page: String(number) });
        const response = await fetch(`${LIST_PATH}?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        // 로그인이 풀렸으면 목록 화면이 아닌 곳(로그인)으로 넘어간다.
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== plan.sourceOrigin || landed.pathname.toLowerCase() !== LIST_PATH.toLowerCase()) {
          throw new Error("LOGIN_REQUIRED");
        }
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const body = await response.text();
        if (body.length > MAX_PAGE_BYTES) throw new Error("INVALID_RESPONSE");
        const doc = new DOMParser().parseFromString(body, "text/html");
        if (!doc.querySelector("#eProductSearchForm")) throw new Error("LOGIN_REQUIRED");
        return doc;
      } finally {
        clearTimeout(timer);
      }
    }

    try {
      if (location.origin !== plan.sourceOrigin) return fail("mall_login_required");
      const first = await page(1);
      const total = counter(first);
      if (total === null || total < 0) drift("total");
      if (total > ROW_LIMIT) drift("row_limit");
      const totalPages = Math.max(1, Math.ceil(total / plan.pageSize));
      if (totalPages > PAGE_LIMIT) drift("page_limit");

      const rows = [];
      const seen = new Set();
      for (let number = 1; number <= totalPages; number += 1) {
        if (number > 1 && requestDelayMs > 0) await wait(requestDelayMs);
        const doc = number === 1 ? first : await page(number);
        // 읽는 사이 상품이 늘거나 줄면 한 번에 찍은 목록이 아니다.
        if (counter(doc) !== total) return fail("mall_total_changed");
        const boxes = [...doc.querySelectorAll("input._product_no")];
        if (boxes.length === 0) {
          if (total === 0) break;
          drift("goods_table");
        }
        const table = boxes[0].closest("table");
        const headers = [...(table?.tHead?.rows?.[0]?.cells || [])]
          .map((cell) => cell.textContent.replace(/\s+/g, " ").trim());
        const priceIndex = headers.indexOf("판매가");
        if (priceIndex < 0) drift("column:판매가");
        for (const box of boxes) {
          const mallProductCode = text(String(box.value ?? ""), 60);
          if (!mallProductCode || !/^\d{1,12}$/.test(mallProductCode)) drift("product_no");
          // 쪽이 겹치면 정렬이 흔들린 것이다 — 빠진 상품이 있다는 뜻이라 저장하지 않는다.
          if (seen.has(mallProductCode)) drift("page_overlap");
          seen.add(mallProductCode);
          const row = box.closest("tr");
          const productName = text(row?.querySelector("a.ec-product-list-productname")?.textContent, 400);
          if (!productName) drift("product_name");
          const display = box.getAttribute("is_display");
          const selling = box.getAttribute("is_selling");
          if (!/^[TF]$/.test(display || "") || !/^[TF]$/.test(selling || "")) drift("state");
          const source = row.querySelector("img")?.getAttribute("src") || "";
          const imageUrl = source.startsWith("//") ? `https:${source}` : source;
          rows.push({
            mallProductCode,
            productName,
            sellpiaName: null,
            sellerCode: null,
            salePrice: price(row.cells[priceIndex]?.textContent),
            statusWords: [selling === "T" ? "판매함" : "판매안함", display === "T" ? "진열함" : "진열안함"],
            registeredOn: null,
            ...(/^https:\/\//.test(imageUrl) && imageUrl.length <= 2000 ? { imageUrl } : {}),
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

  /**
   * 떠리몰(샵바이 파트너 어드민) 상품정보 조회/수정 목록(라이브 2026-09-19: 479개 = 5쪽). 목록 화면(partner-remote
   * iframe)이 부르는 상품 검색 API 를 겉 화면(partner.shopby.co.kr) 안에서 그대로 부른다 — admin-api.e-ncp.com
   * `POST /products/search`, 머리 accessToken(파트너 로그인 쿠키) · Version 1.0 · ClientLocation(목록 화면 주소 — 없으면
   * 403 "권한이 없습니다"). 토큰은 이 함수 안에서만 쓴다. 등록일 전 기간 · 떠리몰(mallNo 78859)만 100개씩 1쪽부터 끝까지
   * 읽는다. 상태는 승인상태 · 판매설정 · 판매상태 · 품절 여부가 따로 와서 몰 글자 여럿으로 넘기고, 이름 끝의
   * "(업체별도 무료배송)"은 몰이 모든 상품에 붙이는 말이라 뗀다.
   */
  async function readThirtymallListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const API = "https://admin-api.e-ncp.com";
    const CLIENT_LOCATION = "https://partner-remote.shopby.co.kr/product/management/list";
    const TOKEN_COOKIE = "SHOPBY_PARTNER_SESSAT";
    const MALL_NO = 78859;
    const ROW_LIMIT = 20_000;
    const PAGE_LIMIT = 1_000;
    const APPLY = ["REGISTRATION_READY", "APPROVAL_READY", "APPROVAL_REJECTION", "SALE_AGREEMENT_READY",
      "SALE_AGREEMENT_REJECTION", "FINISHED", "AFTER_APPROVAL_READY", "AFTER_APPROVAL_REJECTION"];
    const SALE = ["PRE_APPROVAL_STATUS", "ON_PRE_SALE", "WAITING_SALE", "ON_SALE", "END_SALE"];
    const SETTING = ["AVAILABLE_FOR_SALE", "STOP_SELLING", "PROHIBITION_SALE"];
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

    const token = (() => {
      try {
        const hit = document.cookie.split(";").map((part) => part.trim())
          .find((part) => part.startsWith(`${TOKEN_COOKIE}=`));
        return hit ? decodeURIComponent(hit.slice(TOKEN_COOKIE.length + 1)) : "";
      } catch {
        return "";
      }
    })();
    if (!token) return fail("mall_login_required");

    // 목록 화면의 기본 검색 조건 그대로에 기간만 전체로 넓힌다(화면 기본은 등록일 최근 3개월).
    const condition = {
      adminNo: null, allowsFrontDisplay: "ALL", allowsPromotion: "ALL", allowsShippingTogether: "ALL",
      applyStatusTypes: APPLY.slice(), brandNo: null, canApplyAdditionalDiscount: "ALL", canApplyCoupon: "ALL",
      categoryCondition: { type: "DISPLAY", depth: null, no: null, nos: [] }, classType: null,
      commission: { type: "ALL", range: { min: 0, max: 100 } }, customPropertyValueNos: [], deliverable: "ALL",
      deliveryFeeType: "ALL", exceptedMallProductNos: [], excludeSalesEndProduct: false, hasAdditionalDiscount: "ALL",
      keywordInfo: { ignoreCase: false, type: "PRODUCT_NAME", keywords: [] }, mallNos: [MALL_NO], marketingChannels: [],
      marketingDisplayYn: "ALL", memberGradeNo: null, memberGroupNo: null, needsAdditionalDiscountInfo: "N",
      onlyAccessUrl: "ALL", onlyGlobalProduct: "ALL", onlyMappingProduct: "ALL", onlyParentProduct: "ALL",
      onlySingleProduct: "ALL", partnerNo: null,
      periodInfo: { type: "REGISTER_DATE", period: { startYmdt: "2000-01-01 00:00:00", endYmdt: "2999-12-31 23:59:59" } },
      platformType: "ALL", remainsSaleDays: 0, saleMethodType: "ALL",
      salePriceRange: { type: "ALL", minSalePrice: null, maxSalePrice: null },
      saleSettingStatus: { isAll: true, types: [] }, saleStatus: { isAll: true, types: [] }, shippingAreaType: "ALL",
      sort: null, stockRange: { type: "ALL", stockCnt: null, minStockCnt: null, maxStockCnt: null },
    };

    async function search(page) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(`${API}/products/search`, {
          method: "POST",
          cache: "no-store",
          headers: {
            accessToken: token,
            Version: "1.0",
            ClientLocation: CLIENT_LOCATION,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...condition, page, size: plan.pageSize }),
          signal: controller.signal,
        });
        if (response.status === 401) throw new Error("LOGIN_REQUIRED");
        // 403 은 화면 주소(ClientLocation) 권한이 바뀐 것이다 — 로그인 문제가 아니다.
        if (response.status === 403) drift("forbidden");
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const json = await response.json().catch(() => null);
        if (!json || typeof json !== "object") throw new Error("INVALID_RESPONSE");
        return json;
      } finally {
        clearTimeout(timer);
      }
    }

    function words(product) {
      const apply = String(product.applyStatusType ?? "");
      const sale = String(product.saleStatusType ?? "");
      const setting = String(product.saleSettingStatusType ?? "");
      if (!APPLY.includes(apply)) drift("apply_status");
      if (!SALE.includes(sale)) drift("sale_status");
      if (!SETTING.includes(setting)) drift("sale_setting");
      if (typeof product.isSoldOut !== "boolean") drift("sold_out");
      const out = [];
      if (/REJECTION$/.test(apply)) out.push("승인거부");
      else if (/READY$/.test(apply)) out.push("승인대기");
      if (setting === "PROHIBITION_SALE") out.push("판매금지");
      else if (setting === "STOP_SELLING") out.push("판매중지");
      if (sale === "END_SALE") out.push("판매종료");
      else if (sale === "WAITING_SALE") out.push("판매대기");
      if (product.isSoldOut) out.push("품절");
      return out.length > 0 ? out : ["판매중"];
    }

    function imageOf(value) {
      if (typeof value !== "string") return null;
      // 샵바이 사진 주소는 스킴 없이 온다(//shopby-images.cdn-nhncommerce.com/…).
      const absolute = value.startsWith("//") ? `https:${value}` : value;
      return /^https:\/\//.test(absolute) && absolute.length <= 2000 ? absolute : null;
    }

    try {
      const first = await search(1);
      const total = first.totalCount;
      if (!Number.isInteger(total) || total < 0) drift("total");
      if (total > ROW_LIMIT) drift("row_limit");
      const totalPages = Math.max(1, Math.ceil(total / plan.pageSize));
      if (totalPages > PAGE_LIMIT) drift("page_limit");
      if (total > 0 && first.totalPage !== totalPages) drift("total_page");

      const rows = [];
      const seen = new Set();
      for (let page = 1; page <= totalPages; page += 1) {
        if (page > 1 && requestDelayMs > 0) await wait(requestDelayMs);
        const list = page === 1 ? first : await search(page);
        if (!Array.isArray(list.contents)) drift("contents");
        for (const product of list.contents) {
          if (Number(product?.mallNo) !== MALL_NO) drift("mall_no");
          const mallProductCode = String(product?.mallProductNo ?? "");
          if (!/^\d{6,12}$/.test(mallProductCode)) drift("product_no");
          if (seen.has(mallProductCode)) continue;
          seen.add(mallProductCode);
          const productName = text(String(product.productName ?? "").replace(/\s*\(업체별도 무료배송\)\s*$/, ""), 400);
          if (!productName) drift("product_name");
          const price = Number(product.salePrice);
          const registered = String(product.registerDateTime ?? "");
          const image = imageOf(product.mainImageUrl);
          rows.push({
            mallProductCode,
            productName,
            sellpiaName: null,
            // 판매자관리코드 칸. 셀피아 코드를 심어 두면 코드로 잇는다(지금은 전부 비어 있다).
            sellerCode: text(product.productManagementCd, 60),
            salePrice: Number.isInteger(price) && price >= 0 && price <= 1_000_000_000 ? price : null,
            statusWords: words(product),
            registeredOn: /^\d{4}-\d{2}-\d{2}/.test(registered) ? registered.slice(0, 10) : null,
            ...(image ? { imageUrl: image } : {}),
          });
          if (rows.length > ROW_LIMIT) drift("row_limit");
        }
      }
      // 읽는 사이 상품이 늘거나 줄면 한 번에 찍은 목록이 아니다.
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

  // 도매꾹 상품공급사센터 안에서 돈다. 상품조회/수정 목록(`/sc/item/lstAll`)이 부르는 목록 조회(`/sc/item/lst`, JSON)를
  // 검색 폼 기본값 그대로(상품번호 칸만 비움) 한 쪽 500개씩 읽는다(라이브 2026-09-19: 493개 = 1쪽). 답의 `cnt` 가 전체 수다.
  // 몰 상품코드는 도매꾹 상품번호(no)이고, 상태는 진행상태(진행중 · 기간종료 · 승인대기)와 진열(진열함 · 진열안함) 두 칸이다.
  async function readDomeggookListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const ROW_LIMIT = 20_000;
    const PAGE_LIMIT = 1_000;
    const BASE = [["ktype", "no"], ["nos", ""], ["ttl", ""], ["st", ""], ["chn[]", "dome"], ["chn[]", "supply"],
      ["sec[]", "sell"], ["sec[]", "shop"], ["ca1", "00"], ["ca2", "00"], ["ca3", "00"], ["ca4", "00"], ["idx", ""],
      ["qty", ""], ["disp", ""], ["rmp", ""], ["format", "grid"], ["so", "rd"]];
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

    function imageOf(html) {
      const match = /(?:src|href)=["'](https:\/\/[^"']+\.(?:jpe?g|png|gif|webp)[^"']*)["']/i.exec(String(html ?? ""));
      return match && match[1].length <= 2000 ? match[1] : null;
    }

    async function list(page) {
      const params = new URLSearchParams();
      for (const [key, value] of BASE) params.append(key, value);
      params.append("pg", String(page));
      params.append("sz", String(plan.pageSize));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(`/sc/item/lst?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
          headers: { accept: "application/json", "x-requested-with": "XMLHttpRequest" },
          signal: controller.signal,
        });
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== location.origin || /login/i.test(landed.pathname)) throw new Error("LOGIN_REQUIRED");
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const json = await response.json().catch(() => null);
        if (!json || typeof json !== "object") throw new Error("INVALID_RESPONSE");
        if (json.res !== true) {
          if (/로그인|login/i.test(String(json.msg ?? ""))) throw new Error("LOGIN_REQUIRED");
          drift("res");
        }
        if (!Array.isArray(json.dat)) drift("dat");
        return json;
      } finally {
        clearTimeout(timer);
      }
    }

    try {
      const first = await list(1);
      const total = Number(first.cnt);
      if (!Number.isInteger(total) || total < 0) drift("total");
      if (total > ROW_LIMIT) drift("row_limit");
      const totalPages = Math.max(1, Math.ceil(total / plan.pageSize));
      if (totalPages > PAGE_LIMIT) drift("page_limit");
      const rows = [];
      const seen = new Set();
      for (let page = 1; page <= totalPages; page += 1) {
        if (page > 1 && requestDelayMs > 0) await wait(requestDelayMs);
        const answer = page === 1 ? first : await list(page);
        if (Number(answer.cnt) !== total) return fail("mall_total_changed");
        for (const item of answer.dat) {
          const mallProductCode = String(item?.no ?? "");
          if (!/^\d{5,10}$/.test(mallProductCode)) drift("item_no");
          if (seen.has(mallProductCode)) return fail("mall_total_changed");
          seen.add(mallProductCode);
          const productName = text(item.title, 400);
          if (!productName) drift("title");
          const progress = text(item.status, 20);
          const shown = text(item.disp, 20);
          if (!progress || !shown) drift("status");
          const registered = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(String(item.dateReg ?? ""));
          const image = imageOf(item.img);
          rows.push({
            mallProductCode,
            productName,
            sellpiaName: null,
            // 자체상품코드 칸. 셀피아 코드를 심어 두면 코드로 잇는다(지금은 전부 비어 있다).
            sellerCode: text(item.code, 60),
            salePrice: price(item.amt_dome),
            statusWords: [progress, shown],
            registeredOn: registered ? `${registered[1]}-${registered[2]}-${registered[3]}` : null,
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

  // 11번가 셀러오피스(상품조회/수정) 안에서 돈다. 목록 조회(`getSellProductListJSON`)를 검색 폼 기본값 그대로(상품번호
  // 칸만 비움) 100개씩 앞에서부터 읽는다(라이브 2026-09-19: 900개 = 9쪽). 이 조회의 TOTAL_COUNT 는 전체 수가 아니라
  // "한 쪽 + 1"(다음이 있다는 표시)이라, 한 쪽이 덜 차면 끝이다. 판매상태 코드는 목록 화면의 표 그대로다.
  async function read11stListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const ROW_LIMIT = 20_000;
    const PAGE_LIMIT = 1_000;
    const STATUS = { 101: "승인대기", 102: "전시전", 103: "판매중", 104: "품절", 105: "판매중지", 106: "판매종료", 108: "판매금지", 109: "승인거부" };
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

    async function list(start) {
      const params = new URLSearchParams({
        method: "getSellProductListJSON", srchTyp: "prdNew", start: String(start), limit: String(plan.pageSize),
        prdNo: "", prdNm: "", searchType: "PRDNO", dateType: "CREATE", category1: "", category2: "", category3: "",
        category4: "", chkSelStatCds: "", selMthdCd: "", createDt: "", createDtTo: "", stckQty: "", remainSelDt: "",
        premiumAplDt: "", dlvCstInstBasiCd: "", dlvCstPayTypCd: "", premiumPlusAplDt: "", dlvClf: "", dlvClfDtl: "",
        data: "", searchListingItemClsf: "", mobilePrdYn: "", shopNo: "", prdTypCd: "", omPrdYn: "", svcAreaCd: "",
        isPaging: "Y", reglDlvYn: "N", mnbdClfCd: "", stdPrdYn: "", sendClfCd: "ALL", selStopRsnCd: "",
      });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(`/product/SellProductAjaxAction.tmall?${params.toString()}`, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== location.origin || /login/i.test(landed.pathname)) throw new Error("LOGIN_REQUIRED");
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const body = (await response.text()).trim();
        if (!/^[({]/.test(body)) {
          if (/login|로그인/i.test(body)) throw new Error("LOGIN_REQUIRED");
          throw new Error("INVALID_RESPONSE");
        }
        let json = null;
        try {
          json = JSON.parse(body.replace(/^\(/, "").replace(/\)$/, ""));
        } catch {
          throw new Error("INVALID_RESPONSE");
        }
        if (!Array.isArray(json?.DATA_LIST)) drift("data_list");
        return json.DATA_LIST;
      } finally {
        clearTimeout(timer);
      }
    }

    try {
      const rows = [];
      const seen = new Set();
      let pages = 0;
      for (let start = 0; ; start += plan.pageSize) {
        if (pages >= PAGE_LIMIT) drift("page_limit");
        if (pages > 0 && requestDelayMs > 0) await wait(requestDelayMs);
        const items = await list(start);
        pages += 1;
        for (const item of items) {
          const mallProductCode = String(item?.prdNo ?? "");
          if (!/^\d{6,12}$/.test(mallProductCode)) drift("prd_no");
          // 앞에서부터 세는 쪽이라, 읽는 사이 상품이 늘면 같은 상품이 다음 쪽에 또 온다.
          if (seen.has(mallProductCode)) return fail("mall_total_changed");
          seen.add(mallProductCode);
          const productName = text(item.prdNm, 400);
          if (!productName) drift("prd_nm");
          const status = STATUS[String(item.selStatCd ?? "")];
          if (!status) drift("sel_stat_cd");
          const amount = Number(item.selPrc);
          const registered = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(String(item.createDt ?? ""));
          const sellerCode = text(String(item.sellerPrdCd ?? ""), 60);
          rows.push({
            mallProductCode,
            productName,
            sellpiaName: null,
            // 판매자 상품코드 칸. 셀피아 코드를 심어 두면 코드로 잇는다.
            sellerCode: sellerCode && sellerCode !== "null" ? sellerCode : null,
            salePrice: Number.isInteger(amount) && amount >= 0 && amount <= 1_000_000_000 ? amount : null,
            statusWords: [status],
            registeredOn: registered ? `${registered[1]}-${registered[2]}-${registered[3]}` : null,
          });
          if (rows.length > ROW_LIMIT) drift("row_limit");
        }
        if (items.length < plan.pageSize) break;
      }
      rows.sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode));
      // 전체 수를 따로 주지 않는 목록이다 — 끝까지 읽은 줄 수가 전체다. 쪽 수는 그 수로 센다.
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

  // 지마켓 · 옥션(ESM Plus 상품 조회/수정) 안에서 돈다. 목록 검색(`POST /api/ea/goods/search`)을 검색 조건 없이 500개씩
  // 1쪽부터 읽는다(라이브 2026-09-19: 마스터 1,584개 = 4쪽, 지마켓 934 · 옥션 754). 한 마스터가 두 사이트에 함께 있을 수
  // 있어 계획의 몰(gmarket → gmkt, auction → iac)에 올라간 것만 고른다. 몰 상품코드는 사방넷이 쓰던 모양 그대로
  // `{사이트상품번호}_{마스터상품번호}` 이고, 사방넷이 사이트 번호만 준 상품이 있어 그 번호를 다른 코드로 함께 싣는다.
  // 판매상태 코드는 목록 화면의 칸 그대로다(01 등록대기 · 11 판매가능 · 21 판매중지 · 22 판매불가 · 31 SKU품절).
  async function readEsmListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const ROW_LIMIT = 20_000;
    const PAGE_LIMIT = 1_000;
    const SITE = { gmarket: "gmkt", auction: "iac" }[plan.mallKey];
    const STATUS = { "01": "등록대기", 11: "판매중", 21: "판매중지", 22: "판매불가", 31: "SKU품절" };
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

    async function search(pageIndex) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch("/api/ea/goods/search", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json, text/plain, */*", "Content-Type": "application/json" },
          body: JSON.stringify({
            query: { goodsIds: "", sellStatus: [], category: {}, registrationDate: {}, shipping: {}, additionalService: [] },
            pageIndex,
            pageSize: plan.pageSize,
          }),
          signal: controller.signal,
        });
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== location.origin || /login|signin/i.test(landed.pathname)) throw new Error("LOGIN_REQUIRED");
        if (response.status === 401 || response.status === 403) throw new Error("LOGIN_REQUIRED");
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const json = await response.json().catch(() => null);
        if (!json || typeof json !== "object") throw new Error("INVALID_RESPONSE");
        const data = json.data;
        if (!data || !Array.isArray(data.items)) drift("items");
        return data;
      } finally {
        clearTimeout(timer);
      }
    }

    try {
      if (!SITE) drift("site");
      const first = await search(1);
      const total = first.totalCount;
      if (!Number.isInteger(total) || total < 0) drift("total");
      if (total > ROW_LIMIT) drift("row_limit");
      const masterPages = Math.max(1, Math.ceil(total / plan.pageSize));
      if (masterPages > PAGE_LIMIT) drift("page_limit");
      const rows = [];
      const masters = new Set();
      const seen = new Set();
      for (let pageIndex = 1; pageIndex <= masterPages; pageIndex += 1) {
        if (pageIndex > 1 && requestDelayMs > 0) await wait(requestDelayMs);
        const data = pageIndex === 1 ? first : await search(pageIndex);
        if (data.totalCount !== total) return fail("mall_total_changed");
        for (const item of data.items) {
          const goodsNo = String(item?.goodsNo ?? "");
          if (!/^\d{6,12}$/.test(goodsNo)) drift("goods_no");
          if (masters.has(goodsNo)) return fail("mall_total_changed");
          masters.add(goodsNo);
          const siteNo = item?.siteGoodsNo?.[SITE];
          if (siteNo === null || siteNo === undefined || siteNo === "") continue;
          const siteGoodsNo = String(siteNo);
          if (!/^[A-Z]?\d{6,12}$/.test(siteGoodsNo)) drift("site_goods_no");
          const mallProductCode = `${siteGoodsNo}_${goodsNo}`;
          if (seen.has(mallProductCode)) return fail("mall_total_changed");
          seen.add(mallProductCode);
          const productName = text(item.goodsName, 400);
          if (!productName) drift("goods_name");
          const status = STATUS[String(item?.sellStatus?.[SITE] ?? "")];
          if (!status) drift("sell_status");
          const amount = Number(item?.price?.[SITE]);
          const registered = /^(\d{4}-\d{2}-\d{2})/.exec(String(item.createdDate ?? ""));
          const image = typeof item.imgUrl === "string" && /^https?:\/\//.test(item.imgUrl)
            ? item.imgUrl.replace(/^http:\/\//, "https://")
            : null;
          rows.push({
            mallProductCode,
            // 사방넷은 마스터 번호 없이 사이트 번호만 준 상품이 있다 — 그 번호로 이미 이어진 리스팅을 쓴다.
            alternateCodes: [siteGoodsNo],
            productName,
            sellpiaName: null,
            // 판매자관리코드 칸. 셀피아 코드를 심어 두면 코드로 잇는다.
            sellerCode: text(item.managedCode, 60),
            salePrice: Number.isInteger(amount) && amount >= 0 && amount <= 1_000_000_000 ? amount : null,
            statusWords: [status],
            registeredOn: registered ? registered[1] : null,
            ...(image && image.length <= 2000 ? { imageUrl: image } : {}),
          });
          if (rows.length > ROW_LIMIT) drift("row_limit");
        }
      }
      if (masters.size !== total) return fail("mall_total_changed");
      rows.sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode));
      // 마스터 목록을 끝까지 읽고 이 사이트 것만 골랐다 — 이 몰의 전체는 고른 줄 수다.
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

  // 카카오 톡스토어 판매자센터 안에서 돈다. 상품조회 화면이 부르는 목록 API(`GET /api/tstore/products`)를 100개씩 0쪽부터
  // 읽는다(라이브 2026-09-19: 386개 = 4쪽). 몰 상품코드는 톡스토어 상품번호(id)이고, 상태는 판매상태(판매중 · 판매중지 ·
  // 품절 · 판매금지)와 전시(전시함 · 전시안함) 두 칸이다.
  async function readKakaoListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
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

    async function list(page) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const params = new URLSearchParams({ size: String(plan.pageSize), page: String(page) });
        const response = await fetch(`/api/tstore/products?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== location.origin || response.status === 401 || response.status === 403) {
          throw new Error("LOGIN_REQUIRED");
        }
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const json = await response.json().catch(() => null);
        if (!json || typeof json !== "object") throw new Error("INVALID_RESPONSE");
        if (!Array.isArray(json.contents)) drift("contents");
        return json;
      } finally {
        clearTimeout(timer);
      }
    }

    try {
      const first = await list(0);
      const total = first.totalCount;
      if (!Number.isInteger(total) || total < 0) drift("total");
      if (total > ROW_LIMIT) drift("row_limit");
      const totalPages = Math.max(1, Math.ceil(total / plan.pageSize));
      if (totalPages > PAGE_LIMIT) drift("page_limit");
      const rows = [];
      const seen = new Set();
      for (let page = 0; page < totalPages; page += 1) {
        if (page > 0 && requestDelayMs > 0) await wait(requestDelayMs);
        const answer = page === 0 ? first : await list(page);
        if (answer.totalCount !== total) return fail("mall_total_changed");
        for (const product of answer.contents) {
          const mallProductCode = String(product?.id ?? "");
          if (!/^\d{5,12}$/.test(mallProductCode)) drift("product_id");
          if (seen.has(mallProductCode)) return fail("mall_total_changed");
          seen.add(mallProductCode);
          const productName = text(product.name, 400);
          if (!productName) drift("product_name");
          const sale = text(product.displayedSaleStatus, 20);
          const shown = text(product.displayStatus, 20);
          if (!sale || !shown) drift("status");
          const digits = String(product.salePrice ?? "").replace(/[,\s원]/g, "");
          const amount = /^\d{1,10}$/.test(digits) ? Number(digits) : null;
          const code = text(product.storeManagementCode, 60);
          const registered = /^(\d{4}-\d{2}-\d{2})/.exec(String(product.createdAt ?? ""));
          const image = typeof product.imageUrl === "string" && /^https:\/\//.test(product.imageUrl)
            && product.imageUrl.length <= 2000 ? product.imageUrl : null;
          rows.push({
            mallProductCode,
            productName,
            sellpiaName: null,
            // 판매자관리코드 칸. 셀피아 코드를 심어 두면 코드로 잇는다(비었으면 "-").
            sellerCode: code && code !== "-" ? code : null,
            salePrice: amount !== null && amount <= 1_000_000_000 ? amount : null,
            statusWords: [sale, shown],
            registeredOn: registered ? registered[1] : null,
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

  // 롯데ON 판매자센터 화면 안(MAIN)에서 돈다. 상품 조회(`selectProductList`, soapi)를 우리 거래처(화면의 로그인 정보
  // `gcm.user` 의 거래처그룹 · 거래처번호)로 좁혀 100개씩 1쪽부터 전체 수(`totalCount`)만큼 읽는다 — 거래처 없이 부르면 롯데ON
  // 전체 상품(1억 건대)이 온다(라이브 2026-09-19). 롯데ON 은 탭마다 로그인이라 로그인된 판매자센터 탭을 빌려 읽는다. 요청 머리
  // (토큰 · 시간대 · 기기)는 화면이 요청마다 쓰는 함수(`gcm._sbm_setRequestHeader`)로 붙이고 토큰은 밖으로 나가지 않는다. 몰
  // 상품코드는 판매자상품번호(spdNo, `LO…`)다. 모든 줄이 우리 거래처 것인지 확인한다.
  async function readLotteonListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const ROW_LIMIT = 20_000;
    const PAGE_LIMIT = 1_000;
    const API = "https://soapi.lotteon.com/soapi/v1/product/information/selectProductList";
    const STATUS = { SALE: "판매중", SOUT: "품절", STP: "판매중지", END: "판매종료" };
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

    function first(row, keys) {
      for (const key of keys) {
        const value = row?.[key];
        if (value !== undefined && value !== null && value !== "") return value;
      }
      return null;
    }

    try {
      const deadline = Date.now() + 20_000;
      const ready = () => typeof gcm !== "undefined" && gcm && typeof gcm._sbm_setRequestHeader === "function"
        && Boolean(sessionStorage.getItem("AuthToken"));
      while (!ready()) {
        if (/login/i.test(location.href) || Date.now() > deadline) return fail("mall_login_required");
        await wait(500);
      }
      // 로그인 화면에도 토큰 칸이 있다 — 거래처 정보가 없으면 로그인되지 않은 탭이다.
      if (/login/i.test(location.href)) return fail("mall_login_required");
      let trade = null;
      try {
        trade = { trGrpCd: gcm.user.getTrGrpCd(), trNo: gcm.user.getTrNo() };
      } catch {
        trade = null;
      }
      if (!trade || !trade.trNo || !trade.trGrpCd) return fail("mall_login_required");
      const post = (body) => new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", API, true);
        xhr.timeout = requestTimeoutMs;
        xhr.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
        xhr.setRequestHeader("Accept", "application/json");
        gcm._sbm_setRequestHeader(xhr);
        xhr.onload = () => {
          if (xhr.status === 401 || xhr.status === 403) return reject(new Error("LOGIN_REQUIRED"));
          if (xhr.status < 200 || xhr.status >= 300) return reject(new Error("NETWORK_FAILED"));
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error("INVALID_RESPONSE"));
          }
        };
        xhr.ontimeout = () => reject(Object.assign(new Error("timeout"), { name: "AbortError" }));
        xhr.onerror = () => reject(new Error("NETWORK_FAILED"));
        xhr.send(JSON.stringify(body));
      });

      const rows = [];
      const seen = new Set();
      let total = null;
      let totalPages = 1;
      for (let pageNo = 1; pageNo <= totalPages; pageNo += 1) {
        if (pageNo > 1 && requestDelayMs > 0) await wait(requestDelayMs);
        const json = await post({ ...trade, pageNo, rowsPerPage: plan.pageSize });
        if (json?.returnCode !== "SUCCESS") drift("return_code");
        if (!Array.isArray(json.data)) drift("data");
        const count = Number(json.totalCount);
        if (!Number.isInteger(count) || count < 0) drift("total");
        if (total === null) {
          // 우리 거래처로 좁혔는데도 몇만 건이면 좁히기가 먹지 않은 것이다 — 남의 상품을 읽지 않는다.
          if (count > ROW_LIMIT) drift("row_limit");
          total = count;
          totalPages = Math.max(1, Math.ceil(total / plan.pageSize));
          if (totalPages > PAGE_LIMIT) drift("page_limit");
        } else if (count !== total) {
          return fail("mall_total_changed");
        }
        for (const item of json.data) {
          if (String(item?.trNo ?? "") !== String(trade.trNo)) drift("trade_scope");
          const mallProductCode = String(item?.spdNo ?? "");
          if (!/^LO\d{4,20}$/.test(mallProductCode)) drift("spd_no");
          if (seen.has(mallProductCode)) return fail("mall_total_changed");
          seen.add(mallProductCode);
          const productName = text(String(first(item, ["spdNm", "pdNm", "prdNm", "sitmNm"]) ?? ""), 400);
          if (!productName) drift("product_name");
          const code = String(item.slStatCd ?? "");
          const status = STATUS[code] ?? text(String(first(item, ["slStatNm", "slStatCdNm"]) ?? code), 20);
          if (!status) drift("sl_stat_cd");
          const amount = Number(first(item, ["slPrc", "salePrc", "dcPrc"]));
          const registered = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(String(first(item, ["regDttm", "regDt", "fstRegDttm"]) ?? ""));
          const sellerCode = text(String(first(item, ["epdNo", "eitmNo", "trPdNo"]) ?? ""), 60);
          rows.push({
            mallProductCode,
            productName,
            sellpiaName: null,
            sellerCode,
            salePrice: Number.isInteger(amount) && amount >= 0 && amount <= 1_000_000_000 ? amount : null,
            statusWords: [status],
            registeredOn: registered ? `${registered[1]}-${registered[2]}-${registered[3]}` : null,
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

  // 네이버 스마트스토어센터(원상품 목록) 화면 안(MAIN)에서 돈다. 목록 검색(`POST /api/products/list/search`)을 화면 자신의
  // Angular `$http` 로 검색어 없이 100개씩 0쪽부터 읽는다 — 화면 인터셉터가 붙이는 머리가 그대로 실린다. 사방넷이 채널상품번호와
  // 원상품번호를 섞어 줬으므로 채널상품번호를 몰 상품코드로, 원상품번호를 다른 코드로 함께 싣는다(이미 이어진 쪽을 쓴다).
  async function readSmartstoreListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const ROW_LIMIT = 20_000;
    const PAGE_LIMIT = 1_000;
    const STATUS = {
      SALE: "판매중", OUTOFSTOCK: "품절", SUSPENSION: "판매중지", WAIT: "판매대기", UNADMISSION: "승인대기",
      REJECTION: "승인거부", PROHIBITION: "판매금지", CLOSE: "판매종료", DELETE: "삭제",
    };
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

    try {
      const deadline = Date.now() + 20_000;
      let injector = null;
      while (!injector) {
        try {
          injector = window.angular ? window.angular.element(document.body).injector() : null;
        } catch {
          injector = null;
        }
        if (injector) break;
        if (location.hostname !== "sell.smartstore.naver.com" || Date.now() > deadline) return fail("mall_login_required");
        await wait(500);
      }
      const $http = injector.get("$http");
      const search = async (page) => {
        try {
          // 원상품 목록 검색 폼이 처음 가진 값 그대로다(공개 번들 app.js: searchPeriodType · searchKeywordType ·
          // searchOrderType · searchKeyword · searchDynamicPricingType). 기간 칸은 비워 전체다.
          const response = await $http({
            method: "POST",
            url: "/api/products/list/search",
            timeout: requestTimeoutMs,
            data: {
              searchPeriodType: "PROD_REG_DAY",
              searchKeywordType: "CHANNEL_PRODUCT_NO",
              searchOrderType: "REG_DATE",
              searchKeyword: "",
              searchDynamicPricingType: "ALL",
              page,
              size: plan.pageSize,
            },
          });
          return response?.data;
        } catch (failure) {
          const status = Number(failure?.status) || 0;
          if (status === 401 || status === 403) throw new Error("LOGIN_REQUIRED");
          if (status === -1) throw Object.assign(new Error("timeout"), { name: "AbortError" });
          // 어떤 답이었는지 남긴다 — 이 몰은 화면을 직접 보지 못해 답 번호가 고칠 곳을 알려 준다.
          throw new Error(`CONTRACT_DRIFT:http_${status}`);
        }
      };

      const first = await search(0);
      if (!first || !Array.isArray(first.content)) drift("content");
      const total = Number(first.total ?? first.totalElements);
      if (!Number.isInteger(total) || total < 0) drift("total");
      if (total > ROW_LIMIT) drift("row_limit");
      const totalPages = Math.max(1, Math.ceil(total / plan.pageSize));
      if (totalPages > PAGE_LIMIT) drift("page_limit");
      const rows = [];
      const seen = new Set();
      for (let page = 0; page < totalPages; page += 1) {
        if (page > 0 && requestDelayMs > 0) await wait(requestDelayMs);
        const data = page === 0 ? first : await search(page);
        if (!data || !Array.isArray(data.content)) drift("content");
        if (Number(data.total ?? data.totalElements) !== total) return fail("mall_total_changed");
        for (const product of data.content) {
          const originNo = String(product?.id ?? product?.originProductNo ?? "");
          if (!/^\d{6,15}$/.test(originNo)) drift("origin_no");
          const channel = Array.isArray(product.singleChannelProducts) ? product.singleChannelProducts[0] ?? null : null;
          const channelNo = channel?.channelProductNo === undefined || channel?.channelProductNo === null
            ? "" : String(channel.channelProductNo);
          const mallProductCode = /^\d{6,15}$/.test(channelNo) ? channelNo : originNo;
          if (seen.has(mallProductCode)) return fail("mall_total_changed");
          seen.add(mallProductCode);
          const productName = text(String(product.productName ?? product.name ?? channel?.name ?? ""), 400);
          if (!productName) drift("product_name");
          const statusType = String(product.productStatusType ?? channel?.statusType ?? "");
          const status = STATUS[statusType];
          if (!status) drift("status_type");
          const amount = Number(product.salePrice ?? channel?.salePrice);
          const registered = /^(\d{4}-\d{2}-\d{2})/.exec(String(product.regDate ?? product.createdDate ?? ""));
          const code = text(String(product.sellerManagementCode ?? ""), 60);
          const imageSource = product.representImageUrl ?? product.representativeImage?.url ?? null;
          const image = typeof imageSource === "string" && /^https:\/\//.test(imageSource) && imageSource.length <= 2000
            ? imageSource : null;
          rows.push({
            mallProductCode,
            ...(mallProductCode !== originNo ? { alternateCodes: [originNo] } : {}),
            productName,
            sellpiaName: null,
            // 판매자 관리코드 칸. 셀피아 코드를 심어 두면 코드로 잇는다.
            sellerCode: code,
            salePrice: Number.isInteger(amount) && amount >= 0 && amount <= 1_000_000_000 ? amount : null,
            statusWords: [status],
            registeredOn: registered ? registered[1] : null,
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

  // 몰 키 → 읽기기. 서버 계약(`@kiditem/shared/mall-admin-listings`)의 몰 표와 같아야 한다.

  /**
   * 보리보리(트라이시클 셀러클럽) A201 상품관리 목록.
   *
   * 화면은 Vue + jqGrid 라 표를 읽어서는 안 된다 — 주소에 조건을 실어도 화면이 제 기본값
   * (최근 1주일 · 판매중)으로 되돌리고, 스크립트로 폼을 채워 눌러도 Vue 가 무시한다. 그래서
   * 그리드가 부르는 목록 API 를 화면 안에서 그대로 부른다.
   *
   * `POST /product/rest/productRegister/selectPrdNotiItemList` (JSON). 본문은 검색 조건 한 벌이고
   * 비워 두면 조건 없는 조회가 된다 — 상태 배열(`prdSelCdArray` · `prdStatCdArray`)을 비우면
   * 판매중뿐 아니라 판매종료까지 전부 들어온다(라이브 2026-09-22: 판매중만 454, 전부 1,362).
   * 기간은 필수라 가게가 생기기 전부터 오늘까지로 넓게 준다.
   *
   * 몰 상품코드는 `prdNo` 다. 화면이 '상품코드' 라고 적는 칸이고 사방넷이 쓰던 번호와 같다
   * (실측: 기존 리스팅 674개와 일치). `prdCd` 는 '업체상품코드' 라 다른 번호이므로 쓰지 않는다.
   */
  async function readBoriboriListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const LIST_PATH = "/product/rest/productRegister/selectPrdNotiItemList";
    const ROW_LIMIT = 20_000;
    const PAGE_LIMIT = 1_000;
    // 가게가 생기기 한참 전. 기간이 필수라 비울 수 없다.
    const FROM = "2015/01/01";
    // 화면이 제 일을 마치기를 기다리는 예산과, 붙들렸을 때 다시 청하는 횟수.
    const SETTLE_BUDGET_MS = 120_000;
    const SETTLE_SETTLED_MS = 3_000;
    const PAGE_ATTEMPTS = 3;
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
      const normalized = String(value ?? "").replace(/[,\s원]/g, "");
      if (!/^\d{1,10}$/.test(normalized)) return null;
      const parsed = Number(normalized);
      return parsed <= 1_000_000_000 ? parsed : null;
    }
    function today() {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      return `${now.getFullYear()}/${month}/${day}`;
    }
    /**
     * 협력사 번호. 조회에 반드시 실어야 한다 — 비우면 몰이 500 으로 답한다(실측).
     *
     * 상품관리 화면에서 읽지 않는다. 그 화면은 열리는 순간 브라우저를 붙들어서 이 읽기가
     * 그 안에서 돌 수 없다(그래서 가벼운 첫 화면에서 돈다). 몰이 로그인한 판매사를 알려 주는
     * 제 API 에서 받는다.
     */
    async function sellerAccountNo() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch("/product/rest/productRegister/getMemberInfo", {
          credentials: "include",
          cache: "no-store",
          headers: { "X-Requested-With": "XMLHttpRequest" },
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) throw new Error("LOGIN_REQUIRED");
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const payload = await response.json();
        const value = String(payload?.data?.selAcntNo ?? "").trim();
        if (!/^\d{1,12}$/.test(value)) drift("seller_account");
        return value;
      } finally {
        clearTimeout(timer);
      }
    }

    function body(page, selAcntNo) {
      return {
        appId: "prdMngList",
        schDtTyp: "01",
        schDtAuto: "",
        strDt: FROM,
        endDt: today(),
        currentIndex: 0,
        currentPage: page,
        rowCount: plan.pageSize,
        ctgrTyp: "01",
        prdCdTyp: "01",
        prdNmTyp: "01",
        selAcntNo,
        siteCd: "", prdSelCd: "", prdCd: "", prdNm: "", brandCd: "", brandNm: "", brandNo: null,
        mdNo: "", regtr: "", attrCd: "", autoApprYn: "", bizTypCd: "", brandSearchTyp: "",
        ctgrNo1: "", ctgrNo2: "", ctgrNo3: "", dispYn: "", dlvTypCd: "", noDispResnCd: "",
        prdGroupCd: "", prdGroupNm: "", prdGroupNo: null, selAcntNm: "",
        sortCol: "", sortCol2: "", sortCol3: "", sortMode: "",
        aplBgnDy: "", defaultMdNm: "", defaultMdNo: null, tapChange: "",
        // 상태 배열을 모두 비운다 — 이것이 '전체 상태' 다.
        attrCdArray: [], brandCdArray: [], brandNmArray: [], brandNoArray: [], createNoArray: [],
        defaultMdNmArray: [], defaultMdNoArray: [], dispChanTypCdArray: [], dispYnArray: [],
        gendCdArray: [], mdNmArray: [], mdNoArray: [], piInfo: [], prdCdArray: [],
        prdGroupCdArray: [], prdGroupNmArray: [], prdGroupNoArray: [], prdPageList: [],
        prdSelCdArray: [], prdStatCdArray: [], selAcntNmArray: [], selAcntNoArray: [],
      };
    }

    /**
     * 갓 연 이 화면은 제 스크립트가 무거워 한동안 아무 것도 못 하게 붙든다(실측 2026-09-22:
     * 45초 넘게 응답 없음). 그동안 보낸 요청은 30초 시계에 먼저 걸려 `mall_timeout` 으로 끝난다.
     * 그래서 화면이 제 일을 마칠 때까지 기다렸다 읽는다.
     */
    async function settle() {
      const deadline = Date.now() + SETTLE_BUDGET_MS;
      while (Date.now() < deadline) {
        if (document.readyState === "complete" && document.getElementById("searchForm")) {
          // 한 박자 더 — 폼이 붙은 뒤에도 그리드가 첫 조회를 하는 동안은 여전히 바쁘다.
          await wait(SETTLE_SETTLED_MS);
          return;
        }
        await wait(500);
      }
    }

    /** 화면이 붙들려 30초를 넘기면 시계만 새로 주고 다시 청한다. */
    async function pageWithRetry(number, selAcntNo) {
      let lastError = null;
      for (let attempt = 1; attempt <= PAGE_ATTEMPTS; attempt += 1) {
        try {
          return await page(number, selAcntNo);
        } catch (error) {
          if (error?.name !== "AbortError") throw error;
          lastError = error;
          await wait(requestDelayMs > 0 ? requestDelayMs : 200);
        }
      }
      throw lastError;
    }

    async function page(number, selAcntNo) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(LIST_PATH, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify(body(number, selAcntNo)),
          signal: controller.signal,
        });
        // 로그인이 풀리면 이 화면은 로그인으로 밀어낸다.
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== plan.sourceOrigin || /login/i.test(landed.pathname)) {
          throw new Error("LOGIN_REQUIRED");
        }
        if (response.status === 401 || response.status === 403) throw new Error("LOGIN_REQUIRED");
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const payload = await response.json();
        if (payload?.resultStatus?.status !== true) drift("result_status");
        const total = payload?.data?.totalCount;
        const result = payload?.data?.result;
        if (!Number.isSafeInteger(total) || total < 0) drift("total");
        if (!Array.isArray(result)) drift("result");
        return { total, result };
      } finally {
        clearTimeout(timer);
      }
    }

    try {
      if (location.origin !== plan.sourceOrigin) return fail("mall_login_required");
      await settle();
      const acntNo = await sellerAccountNo();
      const first = await pageWithRetry(1, acntNo);
      if (first.total > ROW_LIMIT) drift("row_limit");
      const totalPages = Math.max(1, Math.ceil(first.total / plan.pageSize));
      if (totalPages > PAGE_LIMIT) drift("page_limit");

      const rows = [];
      const seen = new Set();
      for (let number = 1; number <= totalPages; number += 1) {
        if (number > 1 && requestDelayMs > 0) await wait(requestDelayMs);
        const chunk = number === 1 ? first : await pageWithRetry(number, acntNo);
        // 읽는 사이 상품이 늘거나 줄면 한 번에 찍은 목록이 아니다.
        if (chunk.total !== first.total) return fail("mall_total_changed");
        for (const item of chunk.result) {
          const mallProductCode = text(String(item?.prdNo ?? ""), 60);
          if (!mallProductCode || !/^\d{1,15}$/.test(mallProductCode)) drift("prdNo");
          // 쪽이 겹치면 정렬이 흔들린 것이다 — 빠진 상품이 있다는 뜻이라 저장하지 않는다.
          if (seen.has(mallProductCode)) drift("page_overlap");
          seen.add(mallProductCode);
          const productName = text(String(item?.prdNm ?? ""), 400);
          if (!productName) drift("prdNm");
          const statusWords = [item?.prdSelNm, item?.prdStatNm]
            .map((word) => text(String(word ?? ""), 40))
            .filter(Boolean);
          if (statusWords.length === 0) drift("status");
          rows.push({
            mallProductCode,
            productName,
            sellpiaName: null,
            sellerCode: null,
            salePrice: price(item?.selPrc),
            statusWords,
            registeredOn: null,
          });
          if (rows.length > ROW_LIMIT) drift("row_limit");
        }
      }
      if (rows.length !== first.total) return fail("mall_total_changed");
      rows.sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode));
      return {
        success: true,
        snapshot: {
          collection: {
            totalRecords: first.total,
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


  /**
   * GS샵 파트너스 상품조회/수정 목록.
   *
   * 화면이 부르는 BFF 조회를 그대로 부른다 — `POST /bff/product/search?page&size`, 본문은
   * 조회 조건 한 벌이고 응답은 `{ list, totalSize, totalPage, hasNextPage }` 다.
   *
   * ⚠️ 기간은 **최대 1년**이다(화면도 "(최대1년)"이라 적는다). 그래서 오늘부터 1년씩 뒤로
   * 창을 물려 가며 읽고, 빈 창이 나오면 멈춘다(라이브 2026-09-22: 최근 1년 275 · 그 전 19 ·
   * 그 전 141 · 그 전 0 = 435개).
   *
   * 몰 상품코드는 `prdCd`(GS상품코드) 다. 사방넷이 쓰던 번호와 같은 열 자리 수다.
   * `supPrdCd`(협력사상품코드)는 다른 번호이므로 쓰지 않는다.
   */
  async function readGsShopListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const LIST_PATH = "/bff/product/search";
    const ROW_LIMIT = 20_000;
    const PAGE_LIMIT = 1_000;
    // 1년씩 뒤로. 빈 창이 나오면 멈추되, 끝없이 돌지 않게 상한을 둔다.
    const WINDOW_LIMIT = 12;
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
      const normalized = String(value ?? "").replace(/[,\s원]/g, "");
      if (!/^\d{1,10}$/.test(normalized)) return null;
      const parsed = Number(normalized);
      return parsed <= 1_000_000_000 ? parsed : null;
    }
    function day(date) {
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const dayOfMonth = String(date.getDate()).padStart(2, "0");
      return `${date.getFullYear()}-${month}-${dayOfMonth}`;
    }

    function body(from, to, pageIndex) {
      return {
        periodCond: { target: "1", fromDtm: `${from}T00:00:00`, toDtm: `${to}T23:59:59` },
        // 임시저장 · 판매대기 · 판매중 · 일시품절 · 판매종료 — 화면의 '전체'.
        saleStCds: ["1", "2", "3", "5", "4"],
        medias: ["EC", "CA"],
        regSubjCds: ["GS", "SUP"],
        prdCdCond: { target: "GS", codes: [] },
        prdNmCond: { target: "1" },
        saleEndRsnCds: [],
        mdAprvStCd: "0",
        cnsdrAprvStCd: "0",
        qaAprvStCd: "0",
        exposAprvStCd: "0",
        pageIdx: pageIndex,
        rowsPerPage: plan.pageSize,
        prdClsCd: "",
      };
    }

    async function page(from, to, pageIndex) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(`${LIST_PATH}?page=${pageIndex}&size=${plan.pageSize}`, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body(from, to, pageIndex)),
          signal: controller.signal,
        });
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== plan.sourceOrigin) throw new Error("LOGIN_REQUIRED");
        if (response.status === 401 || response.status === 403) throw new Error("LOGIN_REQUIRED");
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const payload = await response.json();
        const list = payload?.list;
        const totalSize = payload?.totalSize;
        if (!Array.isArray(list)) drift("list");
        if (!Number.isSafeInteger(totalSize) || totalSize < 0) drift("total_size");
        return { list, totalSize, totalPage: payload?.totalPage ?? 0 };
      } finally {
        clearTimeout(timer);
      }
    }

    try {
      if (location.origin !== plan.sourceOrigin) return fail("mall_login_required");
      const rows = [];
      const seen = new Set();
      let pagesRead = 0;
      let skipped = 0;
      const end = new Date();
      for (let window = 0; window < WINDOW_LIMIT; window += 1) {
        const to = new Date(end);
        to.setFullYear(to.getFullYear() - window);
        const from = new Date(to);
        from.setFullYear(from.getFullYear() - 1);
        from.setDate(from.getDate() + 1);
        const first = await page(day(from), day(to), 1);
        pagesRead += 1;
        // 이 창에 아무것도 없으면 더 옛날도 없다고 본다.
        if (first.totalSize === 0) break;
        const windowPages = Math.max(1, Math.ceil(first.totalSize / plan.pageSize));
        if (windowPages > PAGE_LIMIT) drift("page_limit");
        for (let index = 1; index <= windowPages; index += 1) {
          if (index > 1) {
            if (requestDelayMs > 0) await wait(requestDelayMs);
            pagesRead += 1;
          }
          const chunk = index === 1 ? first : await page(day(from), day(to), index);
          if (chunk.totalSize !== first.totalSize) return fail("mall_total_changed");
          for (const item of chunk.list) {
            // 판매대기 상품은 GS상품코드가 아직 없다(라이브 2026-09-22: 435줄 중 68줄).
            // 몰 상품코드가 없으면 리스팅이 될 수 없으므로 담지 않고 세어 둔다.
            const mallProductCode = text(String(item?.prdCd ?? ""), 60);
            if (!mallProductCode) { skipped += 1; continue; }
            if (!/^\d{1,15}$/.test(mallProductCode)) drift("prdCd");
            // 창이 겹치면(같은 상품이 두 창에) 건너뛴다 — 경계 하루는 겹칠 수 있다.
            if (seen.has(mallProductCode)) continue;
            seen.add(mallProductCode);
            const productName = text(String(item?.prdNm ?? item?.exposPrdNm ?? ""), 400);
            if (!productName) drift("prdNm");
            const statusWords = [item?.saleStNm, item?.exposStNm]
              .map((word) => text(String(word ?? ""), 40))
              .filter(Boolean);
            if (statusWords.length === 0) drift("status");
            const sellerCode = text(String(item?.supPrdCd ?? ""), 60);
            rows.push({
              mallProductCode,
              productName,
              sellpiaName: null,
              sellerCode,
              salePrice: price(item?.salePrc),
              statusWords,
              registeredOn: text(String(item?.regDtm ?? "").slice(0, 10), 10),
            });
            if (rows.length > ROW_LIMIT) drift("row_limit");
          }
        }
      }
      rows.sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode));
      // 완전성 판정은 '한 목록을 쪽 단위로 끝까지 읽었나' 를 본다
      // (`totalPages === ceil(totalRecords / pageSize)` · `pagesRead === totalPages`).
      // 이 몰은 기간 창을 여러 번 도느라 실제로 부른 쪽 수가 그보다 많다. 거둔 줄이 담길
      // 쪽 수로 적어 그 셈과 맞춘다 — 줄 수와 기록이 어긋나지 않는 것이 이 칸의 뜻이다.
      const coveredPages = Math.max(1, Math.ceil(rows.length / plan.pageSize));
      return {
        success: true,
        snapshot: {
          collection: {
            totalRecords: rows.length,
            recordsRead: rows.length,
            pagesRead: coveredPages,
            totalPages: coveredPages,
            detailsRead: 0,
            detailsMissing: 0,
          },
          rows,
          proof: {
            mallKey: plan.mallKey,
            pageSize: plan.pageSize,
            validatedList: true,
            skippedWithoutMallCode: skipped,
          },
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

  const READERS = Object.freeze({
    kidkids: Object.freeze({
      mallName: "키드키즈",
      origin: "https://partner.kidkids.net",
      pageSize: 20000,
      // 상품 목록 화면 — 전체 건수와 상품리스트 다운로드 링크가 여기 있고, 로그인이 풀렸으면
      // 로그인 화면으로 넘어간다.
      startPath: "/sales/goods_list_renewal.htm?pNum=1",
      read: readKidkidsListings,
    }),
    "icecream-mall": Object.freeze({
      mallName: "아이스크림몰",
      origin: "https://po.i-screammall.co.kr",
      pageSize: 10000,
      // 상품 정보 관리 화면. 목록 조회에 쓰는 검색 폼이 이 화면에 있다.
      startPath: "/goods/goodsMgmt.goodsMgmtView.do",
      read: readIcecreamListings,
    }),
    onch: Object.freeze({
      mallName: "온채널",
      origin: "https://www.onch3.co.kr",
      // 이 화면은 쪽 크기를 고르지 못한다. 한 쪽에 15줄 고정이라 쪽을 다 돈다.
      pageSize: 15,
      startPath: "/products_management.php",
      read: readOnchannelListings,
    }),
    kkomangse: Object.freeze({
      mallName: "꼬망세",
      origin: "https://nstore.edupre.co.kr",
      // 목록이 쪽 크기를 받아 준다. 전체가 한 번에 들어오도록 크게 둔다.
      pageSize: 10000,
      startPath: "/subAdmin/_product.list.php",
      read: readKkomangseListings,
    }),
    always: Object.freeze({
      mallName: "올웨이즈",
      origin: "https://alwayzseller.ilevit.com",
      // 쪽마다 100개. 1쪽부터 전체 수만큼 돈다.
      pageSize: 100,
      // 상품 조회/수정 화면. 목록 API 의 토큰이 이 화면의 localStorage 에 있다.
      startPath: "/items/management",
      read: readAlwayzListings,
    }),
    art09: Object.freeze({
      mallName: "아트공구",
      origin: "https://zzogzzog1.cafe24.com",
      // 상품목록 한 쪽 최대(화면의 '100개씩보기'). 1쪽부터 전체 수만큼 돈다.
      pageSize: 100,
      // 상품목록 화면. 로그인이 풀렸으면 로그인 화면으로 넘어간다.
      startPath: "/disp/admin/shop1/product/ProductManage",
      read: readArt09Listings,
    }),
    thirtymall: Object.freeze({
      mallName: "떠리몰",
      origin: "https://partner.shopby.co.kr",
      // 상품 검색 API 한 쪽(화면 기본 100개). 1쪽부터 전체 쪽 수만큼 돈다.
      pageSize: 100,
      // 상품정보 조회/수정 화면. 로그인이 풀렸으면 로그인 화면으로 넘어가고 파트너 쿠키가 없다.
      startPath: "/product/list",
      read: readThirtymallListings,
    }),
    domeggook: Object.freeze({
      mallName: "도매꾹",
      origin: "https://www.domeggook.com",
      // 목록 조회 한 쪽 최대(상품번호 칸이 받는 500개). 전체가 한 쪽에 들어온다(493개).
      pageSize: 500,
      startPath: "/sc/item/lstAll",
      read: readDomeggookListings,
    }),
    kidsnote: Object.freeze({
      mallName: "키즈노트",
      origin: "https://shop.kidsnote.com",
      // 판매 상품 내역 한 쪽 최대(화면의 '100개씩').
      pageSize: 100,
      startPath: "/_manage/?body=2010",
      read: readKidsnoteListings,
    }),
    "11st": Object.freeze({
      mallName: "11번가",
      origin: "https://soffice.11st.co.kr",
      pageSize: 100,
      // 상품조회/수정 화면.
      startPath: "/view/8006",
      read: read11stListings,
    }),
    gmarket: Object.freeze({
      mallName: "지마켓",
      origin: "https://item.esmplus.com",
      // 목록 검색 한 쪽 최대. 마스터 상품 기준이다.
      pageSize: 500,
      startPath: "/goods/list",
      read: readEsmListings,
    }),
    auction: Object.freeze({
      mallName: "옥션",
      origin: "https://item.esmplus.com",
      pageSize: 500,
      startPath: "/goods/list",
      read: readEsmListings,
    }),
    kakao: Object.freeze({
      mallName: "카카오 톡스토어",
      origin: "https://shopping-seller.kakao.com",
      pageSize: 100,
      // 상품조회 화면. 목록 API 는 이 화면의 로그인으로 부른다.
      startPath: "/product/store-seller/list",
      read: readKakaoListings,
    }),
    "lotte-on": Object.freeze({
      mallName: "롯데ON",
      origin: "https://store.lotteon.com",
      pageSize: 100,
      // 판매자센터 첫 화면. 요청 머리를 붙이는 화면 함수가 여기 있어 화면 안(MAIN)에서 읽는다.
      startPath: "/cm/main/index_SO.wsp",
      world: "MAIN",
      // 롯데ON 은 탭마다 로그인이다(sessionStorage) — 새 탭은 로그인 화면이라, 사장님이 로그인해 둔 판매자센터 탭을 빌린다.
      borrowOpenTab: true,
      read: readLotteonListings,
    }),
    smartstore: Object.freeze({
      mallName: "스마트스토어",
      origin: "https://sell.smartstore.naver.com",
      pageSize: 100,
      // 원상품 목록 화면. 화면 자신의 Angular $http 로 불러야 해 화면 안(MAIN)에서 읽는다.
      startPath: "/#/products/origin-list",
      world: "MAIN",
      read: readSmartstoreListings,
    }),
    boribori: Object.freeze({
      mallName: "보리보리",
      origin: "https://seller-club.co.kr",
      // 화면과 같은 100줄씩(라이브 2026-09-22: 1,362개 = 14쪽).
      pageSize: 100,
      // ⚠️ 상품관리 화면(`/product/productManagerList`)을 열지 않는다. 그 화면은 열리자마자
      // 렌더러를 1분 넘게 붙들어, 그 안에서 보낸 요청이 30초 시계에 먼저 걸린다(실측
      // 2026-09-22: 기다렸다 세 번 다시 청해도 140초 내내 한 번도 못 받았다). 목록 조회는
      // 주소(origin)만 같으면 되므로 가벼운 첫 화면에서 부른다.
      startPath: "/",
      read: readBoriboriListings,
    }),
    "gs-shop": Object.freeze({
      mallName: "GS샵",
      origin: "https://partners.gsshop.com",
      // BFF 조회가 한 쪽에 100줄. 기간이 1년씩이라 창을 물려 가며 읽는다.
      pageSize: 100,
      startPath: "/product/products/list",
      read: readGsShopListings,
    }),
    "teacher-mall": Object.freeze({
      mallName: "티쳐몰",
      origin: "https://shop.teacherville.co.kr",
      pageSize: 100,
      startPath: "/selleradmin/goods/catalog",
      read: readTeacherListings,
    }),
  });

  function readerFor(mallKey) {
    return typeof mallKey === "string" && Object.hasOwn(READERS, mallKey) ? READERS[mallKey] : null;
  }

  function mallName(mallKey) {
    return readerFor(mallKey)?.mallName ?? "몰";
  }

  function publicFailure(mallKey, errorCode, stage) {
    const name = mallName(mallKey);
    if (errorCode === "mall_login_required") {
      return {
        success: false,
        errorCode,
        pendingLogin: true,
        error: `${name} 로그인이 필요합니다. 열린 ${name} 화면에서 로그인한 뒤 다시 가져와 주세요.`,
      };
    }
    if (errorCode === "mall_contract_drift") {
      return {
        success: false,
        errorCode,
        ...(stage ? { stage } : {}),
        error: `${name} 상품 목록 형식이 바뀌어 가져오기를 멈췄습니다.${stage ? ` [${stage}]` : ""}`,
      };
    }
    if (errorCode === "mall_total_changed") {
      return {
        success: false,
        errorCode,
        error: `읽는 사이 ${name} 상품 목록이 바뀌었습니다. 잠시 뒤 다시 가져와 주세요.`,
      };
    }
    if (errorCode === "mall_invalid_snapshot") {
      return {
        success: false,
        errorCode,
        ...(stage ? { stage } : {}),
        error: `${name} 상품 목록이 올바르지 않아 저장하지 않았습니다.`,
      };
    }
    if (errorCode === "mall_timeout") {
      return { success: false, errorCode, error: `${name} 응답이 늦어 가져오기를 멈췄습니다.` };
    }
    return {
      success: false,
      errorCode: "mall_network_failed",
      error: `${name} 상품 목록을 읽지 못했습니다.`,
    };
  }

  function safeLimit(value, fallback, maximum) {
    return Number.isInteger(value) && value >= 0 && value <= maximum ? value : fallback;
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function waitForTabReady(chromeApi, tabId, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const tab = await chromeApi.tabs.get(tabId);
      if (tab?.status === "complete") return;
      await delay(100);
    }
    throw new Error("MALL_TIMEOUT");
  }

  function cancelledError(mallKey) {
    const error = new Error(`${mallName(mallKey)} 등록 상품 가져오기가 취소되었습니다.`);
    error.code = "COLLECTION_CANCELLED";
    return error;
  }

  async function assertCollectionActive(collection, mallKey) {
    if (typeof collection?.assertActive !== "function") return;
    if ((await collection.assertActive()) === false) throw cancelledError(mallKey);
  }

  function create(options) {
    const chromeApi = options.chrome;
    const tabReadyTimeoutMs = safeLimit(
      options.tabReadyTimeoutMs,
      DEFAULT_TAB_READY_TIMEOUT_MS,
      DEFAULT_TAB_READY_TIMEOUT_MS,
    );
    const requestTimeoutMs = safeLimit(
      options.requestTimeoutMs,
      DEFAULT_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
    );
    const requestDelayMs = safeLimit(options.requestDelayMs, DEFAULT_REQUEST_DELAY_MS, 10_000);
    const concurrency = Math.max(1, safeLimit(options.concurrency, DEFAULT_CONCURRENCY, 6));

    // 계획(plan)은 owner 가 서버에서 받아 검증한 것이다. 읽을 몰과 주소도 계획이 정하고,
    // 여기 몰 표와 다르면 읽지 않는다.
    async function collect(plan, collection) {
      const reader = readerFor(plan?.mallKey);
      if (!reader || plan.sourceOrigin !== reader.origin || plan.pageSize !== reader.pageSize) {
        return publicFailure(plan?.mallKey, "mall_contract_drift", "plan");
      }
      let tab = null;
      let attached = false;
      let keepOpen = false;
      try {
        await assertCollectionActive(collection, plan.mallKey);
        if (reader.borrowOpenTab) {
          // 탭마다 로그인인 몰은 로그인된 몰 탭을 빌려 읽기만 한다. 옮기거나 닫지 않는다.
          const open = await chromeApi.tabs.query({ url: `${reader.origin}/*` }).catch(() => []);
          const borrowed = (open || []).find((candidate) => candidate && candidate.status === "complete"
            && String(candidate.url || "").startsWith(reader.origin) && !/login|signin|auth/i.test(String(candidate.url || "")));
          if (borrowed && Number.isInteger(borrowed.id)) {
            const injected = await chromeApi.scripting.executeScript({
              target: { tabId: borrowed.id },
              func: reader.read,
              args: [plan, requestTimeoutMs, requestDelayMs, concurrency],
              ...(reader.world ? { world: reader.world } : {}),
            });
            await assertCollectionActive(collection, plan.mallKey);
            const result = injected?.[0]?.result;
            if (!result || result.success !== true) return publicFailure(plan.mallKey, result?.errorCode, result?.stage);
            return { success: true, snapshot: result.snapshot };
          }
        }
        // 새 비활성 탭을 연다. 사장님이 열어 둔 몰 탭은 건드리지 않는다.
        tab = await chromeApi.tabs.create({ url: `${reader.origin}${reader.startPath}`, active: false });
        if (!Number.isInteger(tab?.id) || !Number.isInteger(tab?.windowId)) {
          return publicFailure(plan.mallKey, "mall_network_failed");
        }
        const attachment = await collection.attachTab(tab, { owned: true });
        if (attachment === null || attachment === false) throw cancelledError(plan.mallKey);
        attached = true;
        await waitForTabReady(chromeApi, tab.id, tabReadyTimeoutMs);
        await assertCollectionActive(collection, plan.mallKey);
        // 화면 함수로 요청 머리를 붙이는 몰(롯데ON · 스마트스토어)은 화면 안(MAIN)에서 읽는다.
        const injected = await chromeApi.scripting.executeScript({
          target: { tabId: tab.id },
          func: reader.read,
          args: [plan, requestTimeoutMs, requestDelayMs, concurrency],
          ...(reader.world ? { world: reader.world } : {}),
        });
        await assertCollectionActive(collection, plan.mallKey);
        const result = injected?.[0]?.result;
        if (!result || result.success !== true) {
          const outcome = publicFailure(plan.mallKey, result?.errorCode, result?.stage);
          // 로그인은 사람이 그 탭에서 한다.
          if (outcome.errorCode === "mall_login_required") keepOpen = true;
          return outcome;
        }
        return { success: true, snapshot: result.snapshot };
      } catch (error) {
        if (error?.code === "COLLECTION_CANCELLED") {
          return {
            success: false,
            errorCode: "COLLECTION_CANCELLED",
            error: String(error.message),
          };
        }
        return error?.message === "MALL_TIMEOUT"
          ? publicFailure(plan.mallKey, "mall_timeout")
          : publicFailure(plan.mallKey, "mall_network_failed");
      } finally {
        if (attached && !keepOpen) {
          try {
            await collection.detachTab(tab, { owned: true });
          } catch {
            // 탭을 닫지 못해도 결과는 남긴다. 세션 정리가 탭을 다시 닫는다.
          }
        }
      }
    }

    return Object.freeze({ collect, mallName });
  }

  root.KidItemMallAdminListings = Object.freeze({
    create,
    mallName,
    readKidkidsListings,
    readIcecreamListings,
    readAlwayzListings,
    readArt09Listings,
    readThirtymallListings,
    readDomeggookListings,
    readKidsnoteListings,
    read11stListings,
    readEsmListings,
    readKakaoListings,
    readLotteonListings,
    readSmartstoreListings,
    readTeacherListings,
  });
})(globalThis);
