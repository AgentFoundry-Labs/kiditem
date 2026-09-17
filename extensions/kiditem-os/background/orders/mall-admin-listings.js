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

  // 몰 키 → 읽기기. 서버 계약(`@kiditem/shared/mall-admin-listings`)의 몰 표와 같아야 한다.
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
        const injected = await chromeApi.scripting.executeScript({
          target: { tabId: tab.id },
          func: reader.read,
          args: [plan, requestTimeoutMs, requestDelayMs, concurrency],
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
  });
})(globalThis);
