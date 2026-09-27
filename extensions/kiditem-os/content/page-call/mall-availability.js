// 몰 판매 상태 쓰기·읽기의 화면 안 요청(ISOLATED world, KID-256 — 옛 `background/orders/mall-availability-send.js` 페이지 함수 이식).
// 확장 런타임 몰 쓰기(`extensions/src/sites/mall-write/availability.ts` · `sites/<mall>/availability.ts`)가 판매자센터 탭에 넣고
// `availability.<함수>`를 요청 하나씩 부른다 — 몰은 판매자센터 화면의 로그인(쿠키·화면 토큰)으로 불러야 한다. 기다림·재시도·
// 다시 읽기는 런타임이 한다(백그라운드 탭의 타이머는 늦어진다). 몰 화면 전역(롯데ON `gcm`, 스마트스토어 Angular `$http`)을 쓰는
// 요청은 `mall-availability-main.js`(MAIN world)에 있다. 화면 토큰은 화면 안에서만 쓰고 밖으로 돌려주지 않는다.
(function installMallAvailability() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});

  /**
   * 윙 화면 안에서 요청 하나를 보낸다. 워커가 인자로만 넘긴다(클로저를 잡을 수 없다).
   * 답은 몰이 준 JSON 그대로 돌려주되, JSON 이 아니면 앞부분만 싣는다(로그인 화면 판별용).
   */
  async function requestOnPage(path, method, contentType, body, extraHeaders) {
    try {
      const response = await fetch(path, {
        method,
        credentials: "include",
        headers: {
          Accept: "application/json, text/plain, */*",
          ...(contentType ? { "Content-Type": contentType } : {}),
          ...(extraHeaders && typeof extraHeaders === "object" ? extraHeaders : {}),
        },
        ...(body === null || body === undefined ? {} : { body }),
      });
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: response.status, json, preview: json ? "" : text.slice(0, 200), url: response.url };
    } catch (error) {
      return { status: 0, json: null, preview: String(error?.message || error).slice(0, 200), url: "" };
    }
  }

  /**
   * 올웨이즈 판매자센터 화면 안에서 백엔드에 요청 하나를 보낸다. 토큰은 이 함수 안에서 localStorage 로 읽어 헤더에만
   * 싣고, **돌려주지 않는다.** 워커가 인자로만 넘긴다(클로저를 잡을 수 없다).
   */
  async function alwayzRequestOnPage(url, body, tokenKey) {
    try {
      const token = localStorage.getItem(tokenKey);
      if (!token) return { status: 401, json: null, loggedOut: true };
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-token": token },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: response.status, json, loggedOut: response.status === 401 || response.status === 403 };
    } catch (error) {
      return { status: 0, json: null, loggedOut: false, error: String(error?.message || error).slice(0, 200) };
    }
  }


  /**
   * 티쳐몰 [실물] 일괄 업데이트(상품코드/무게/재고)를 상품번호로 검색해 그 폼이 보낼 값을 모은다. 읽기만 한다.
   * 워커가 인자로만 넘긴다. 체크박스는 이 상품만 고른다. `search` 는 [업데이트하기]가 폼에 덧붙이는 검색 조건이다.
   * 로그인이 풀렸으면 일괄 업데이트 화면이 아닌 곳에 닿는다.
   */
  async function teacherBatchFormOnPage(batchPath, code) {
    try {
      const params = new URLSearchParams({ page: "1", mode: "goodsetc", keyword: code });
      const response = await fetch(`${batchPath}?${params.toString()}`, { credentials: "include", cache: "no-store" });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || landed.pathname !== batchPath) return { loggedOut: true };
      if (!response.ok) return { error: `HTTP ${response.status}` };
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const form = doc.querySelector("form#goodsBatchUpdateForm");
      if (!form) return { loggedOut: true };
      const box = [...form.querySelectorAll('input[name="goods_seq[]"]')].find((input) => input.value === code);
      if (!box) return { found: false };
      const pairs = [];
      for (const element of form.elements) {
        if (!element.name || element.disabled) continue;
        if (element.type === "button" || element.type === "submit" || element.type === "file") continue;
        if (element.name === "goods_seq[]") {
          if (element.value === code) pairs.push([element.name, element.value]);
          continue;
        }
        if (element.type === "checkbox" || element.type === "radio") {
          if (element.checked) pairs.push([element.name, element.value]);
          continue;
        }
        pairs.push([element.name, element.value]);
      }
      // 이 상품의 옵션 = default_option_seq[옵션번호] 가 이 상품번호인 옵션.
      const options = pairs.filter(([name, value]) => /^default_option_seq\[\d+\]$/.test(name) && value === code)
        .map(([name]) => name.slice("default_option_seq[".length, -1));
      const stocks = options.map((option) => [option, pairs.find(([name]) => name === `stock[${option}]`)?.[1] ?? ""]);
      const search = [...html.matchAll(/get_search_field\[\d+\]\s*=\s*\[\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\]/g)]
        .map((match) => [match[1], match[2]]);
      return { found: true, pairs, stocks, search };
    } catch (error) {
      return { error: String(error?.message || error).slice(0, 200) };
    }
  }

  /** 티쳐몰 상품목록에서 그 상품의 승인 · 판매 상태("승인정상" · "승인품절" · "미승인…")를 읽는다. 읽기만 한다. */
  async function teacherCatalogStatusOnPage(catalogPath, code) {
    try {
      const response = await fetch(`${catalogPath}?keyword=${encodeURIComponent(code)}`, { credentials: "include", cache: "no-store" });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || landed.pathname !== catalogPath) return { loggedOut: true };
      if (!response.ok) return { error: `HTTP ${response.status}` };
      const doc = new DOMParser().parseFromString(await response.text(), "text/html");
      const box = [...doc.querySelectorAll('input[name="goods_seq[]"]')].find((input) => input.value === code);
      if (!box) return { found: false };
      const text = (box.closest("tr")?.textContent || "").replace(/\s+/g, " ");
      const match = /(미승인|승인)\s*(정상|품절|재고확보중|판매중지)/.exec(text);
      return { found: true, approval: match ? match[1] : null, state: match ? match[2] : null };
    } catch (error) {
      return { error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 아이스크림몰 상품 정보 관리 목록을 상품번호 여럿으로 조회해 판매상태를 읽는다. 읽기만 한다. 워커가 인자로만 넘긴다.
   * 검색 폼(보안 서명 포함)은 목록 화면을 받아 그 폼 그대로 쓴다 — 열린 탭이 목록 화면이 아니어도 된다. 화면처럼 기간
   * 조건을 앞에 두고(기간 무시), 폼 전체, 쪽 크기와 쪽 번호를 붙인다. 업체번호 · 업체명은 화면 스크립트가 채우는 값이다.
   */
  async function icecreamRowsOnPage(viewPath, listPath, codes) {
    try {
      const page = await fetch(viewPath, { credentials: "include", cache: "no-store" });
      const landed = new URL(page.url || location.href, location.href);
      if (landed.origin !== location.origin || /login/i.test(landed.pathname)) return { loggedOut: true };
      if (!page.ok) return { error: `HTTP ${page.status}` };
      const html = await page.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const form = doc.getElementById("goodsInfoGridForm");
      if (!form) return doc.querySelector('input[type="password"]') ? { loggedOut: true } : { error: "search_form" };
      const literal = (name) => {
        const match = new RegExp(`(?:var|let|const)\\s+${name}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")`).exec(html);
        if (!match) return "";
        try {
          return String(JSON.parse(match[1]));
        } catch {
          return "";
        }
      };
      const today = new Date();
      const pad = (value) => String(value).padStart(2, "0");
      const params = new URLSearchParams({
        goodsStartDtm: "2000-01-01T00:00:00",
        goodsEndDtm: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}T23:59:59`,
        goodsDtmIgnoreOption: "check",
      });
      for (const [name, value] of new FormData(form)) {
        if (typeof value !== "string") continue;
        if (name === "goodsNoOption" || name === "goodsNoList") continue;
        if (name === "entrNo" || name === "entrNm") {
          params.append(name, value || literal(name === "entrNo" ? "_entrNo" : "_entrNm"));
          continue;
        }
        params.append(name, value);
      }
      params.append("goodsNoOption", "mt");
      // 화면 폼(jQuery serialize)처럼 줄바꿈은 CRLF 다 — LF 로만 이으면 한 건도 안 나온다(2026-09-19 실측).
      params.append("goodsNoList", codes.join("\r\n"));
      params.append("rowsPerPage", String(Math.max(10, codes.length)));
      params.append("pageIdx", "1");
      const response = await fetch(`${listPath}?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const listed = new URL(response.url || location.href, location.href);
      if (listed.origin !== location.origin || /login/i.test(listed.pathname)) return { loggedOut: true };
      if (!response.ok) return { error: `HTTP ${response.status}` };
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        return /type=["']?password|loginForm/i.test(text) ? { loggedOut: true } : { error: "json" };
      }
      if (json?.succeeded === false) return { error: String(json.message || "succeeded=false").slice(0, 120) };
      if (!Array.isArray(json?.payloads)) return { error: "payloads" };
      return {
        rows: json.payloads.map((row) => ({
          goodsNo: row?.goodsNo === undefined || row?.goodsNo === null ? "" : String(row.goodsNo),
          saleStatCd: row?.saleStatCd ?? null,
          saleMethCd: row?.saleMethCd ?? null,
        })),
      };
    } catch (error) {
      return { error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 아이스크림몰 "단품 판매상태 일괄 변경" 창의 [적용]과 같은 요청을 보낸다. 머리는 화면의 jQuery 가 붙이는 것만 싣는다.
   * 워커가 인자로만 넘긴다. 답은 성공 여부와 몰이 준 글(있으면 앞부분)뿐이다.
   */
  async function icecreamSaveOnPage(savePath, goodsSaleStateList) {
    try {
      const response = await fetch(savePath, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          Accept: "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ goodsSaleStateList }),
      });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || /login/i.test(landed.pathname)) return { status: response.status, loggedOut: true };
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      if (!json && /type=["']?password|loginForm|loginExpired/i.test(text)) return { status: response.status, loggedOut: true };
      return {
        status: response.status,
        succeeded: json?.succeeded === true,
        message: typeof json?.message === "string" ? json.message.slice(0, 160) : null,
      };
    } catch (error) {
      return { status: 0, error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 키즈노트 판매 상품 내역 한 쪽을 읽는다 — 줄마다 상품번호(pno) · 상태 글자 · 판매가. `withForm` 이면 `formId` 폼
   * ([상태/노출일괄수정] `edt_layer_4`, 가격 일괄수정 `edt_layer_2`)이 보낼 값도 모아 온다(목록 화면이 넣어 둔 `w` · `prd_no`
   * 포함). 읽기만 한다. 워커가 인자로만 넘긴다.
   */
  async function kidsnoteListOnPage(listPath, page, pageSize, withForm, formId = "edt_layer_4") {
    try {
      const params = new URLSearchParams({ body: "2010", row: String(pageSize), page: String(page) });
      const response = await fetch(`${listPath}?${params.toString()}`, { credentials: "include", cache: "no-store" });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || /login/i.test(landed.pathname + landed.search)) return { loggedOut: true };
      if (!response.ok) return { error: `HTTP ${response.status}` };
      const doc = new DOMParser().parseFromString(await response.text(), "text/html");
      const list = doc.querySelector('form[name="prdFrm"], form#prdFrm');
      if (!list) return doc.querySelector('input[type="password"]') ? { loggedOut: true } : { error: "list_form" };
      const boxes = [...list.querySelectorAll('input[name="check_pno[]"]')];
      let statIndex = -1;
      let priceIndex = -1;
      const table = boxes[0]?.closest("table");
      if (table) {
        const headRow = [...table.querySelectorAll("tr")].find((tr) => tr.querySelector("th"));
        const heads = headRow ? [...headRow.cells].map((cell) => cell.textContent.replace(/\s+/g, "")) : [];
        statIndex = heads.indexOf("상태");
        priceIndex = heads.indexOf("판매가");
      }
      if (boxes.length > 0 && statIndex < 0) return { error: "status_column" };
      const rows = boxes.map((box) => {
        const cells = box.closest("tr")?.cells;
        const digits = priceIndex >= 0 ? String(cells?.[priceIndex]?.textContent || "").replace(/[^0-9]/g, "") : "";
        return {
          pno: String(box.value || ""),
          stat: String(cells?.[statIndex]?.textContent || "").replace(/\s+/g, " ").trim(),
          price: /^\d{1,10}$/.test(digits) ? Number(digits) : null,
        };
      });
      let form = null;
      if (withForm) {
        const edit = doc.getElementById(formId);
        if (!edit) return { error: formId === "edt_layer_4" ? "state_form" : "price_form" };
        form = [...new FormData(edit)].map(([name, value]) => [name, String(value)]);
      }
      return { rows, form };
    } catch (error) {
      return { error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 키즈노트 [상태/노출일괄수정] 폼을 보낸 것과 같은 요청(폼 그대로, urlencoded)을 보낸다. 답은 숨은 창에 그리는 화면이라
   * 알림(alert) 글만 앞부분을 돌려준다. 워커가 인자로만 넘긴다.
   */
  async function kidsnoteSaveOnPage(savePath, pairs) {
    try {
      const body = new URLSearchParams();
      for (const [name, value] of pairs) body.append(name, value);
      const response = await fetch(savePath, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const landed = new URL(response.url || location.href, location.href);
      const text = await response.text();
      if (landed.origin !== location.origin || /login/i.test(landed.pathname + landed.search)
        || /type=["']?password/i.test(text)) {
        return { status: response.status, loggedOut: true };
      }
      const alerted = /alert\(\s*(['"])((?:(?!\1).){1,200})\1/.exec(text);
      return { status: response.status, alert: alerted ? alerted[2].slice(0, 160) : null };
    } catch (error) {
      return { status: 0, error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * ESM 상품 조회/수정 목록을 상품번호 여럿으로 검색한다(화면의 검색과 같은 몸통, 쉼표로 이은 번호). 읽기만 한다.
   * 워커가 인자로만 넘긴다. 우리가 쓰는 칸만 추린다 — 사이트상품번호 · 마스터상품번호 · 판매상태 · 판매자 아이디.
   */
  async function esmSearchOnPage(searchPath, ids) {
    try {
      const body = {
        query: { goodsIds: ids.join(","), sellStatus: [], category: {}, registrationDate: {}, shipping: {}, additionalService: [] },
        pageIndex: 1,
        pageSize: Math.max(20, ids.length),
      };
      const response = await fetch(searchPath, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json, text/plain, */*", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || /login|signin/i.test(landed.pathname)) return { loggedOut: true };
      if (response.status === 401 || response.status === 403) return { loggedOut: true };
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        return /password|login/i.test(text) ? { loggedOut: true } : { error: `HTTP ${response.status}` };
      }
      const items = json?.data?.items;
      if (!Array.isArray(items)) return { error: json?.message ? String(json.message).slice(0, 120) : `HTTP ${response.status}` };
      const pair = (value) => ({ gmkt: value?.gmkt ?? null, iac: value?.iac ?? null });
      return {
        items: items.map((item) => ({
          goodsNo: item?.goodsNo === undefined || item?.goodsNo === null ? "" : String(item.goodsNo),
          siteGoodsNo: pair(item?.siteGoodsNo),
          sellStatus: pair(item?.sellStatus),
          siteSellerId: pair(item?.siteSellerId),
        })),
      };
    } catch (error) {
      return { error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * ESM [판매 상태 변경] 창의 [변경]과 같은 요청 하나(상품 하나)를 보낸다. 워커가 인자로만 넘긴다. 답은 결과 코드와 몰이 준
   * 글뿐이다.
   */
  async function esmSellStatusOnPage(goodsPath, goodsNo, body, sellerHeaders) {
    try {
      const response = await fetch(`${goodsPath}${encodeURIComponent(goodsNo)}/sellStatus`, {
        method: "PUT",
        credentials: "include",
        headers: {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
          "X-G-SELLER-ID": sellerHeaders?.gmkt ?? "",
          "X-A-SELLER-ID": sellerHeaders?.iac ?? "",
        },
        body: JSON.stringify(body),
      });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || response.status === 401 || response.status === 403) {
        return { status: response.status, loggedOut: true };
      }
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      const site = (key) => {
        const entry = json?.data?.[key];
        return entry && typeof entry === "object"
          ? { resultCode: entry.resultCode ?? null, message: entry.message ? String(entry.message).slice(0, 160) : null }
          : null;
      };
      return {
        status: response.status,
        resultCode: json?.resultCode ?? null,
        message: json?.message ? String(json.message).slice(0, 160) : null,
        gmkt: site("gmkt"),
        iac: site("iac"),
      };
    } catch (error) {
      return { status: 0, error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 11번가 상품조회/수정 목록을 상품번호 여럿으로 읽는다. 화면의 그리드가 부르는 JSON 조회와 같고, 상품번호 칸은 화면처럼
   * 줄바꿈으로 잇고 한 번 인코딩한 값을 싣는다(쉼표는 "상품번호가 잘못 입력됐습니다"). 읽기만 한다.
   */
  async function st11ListOnPage(listPath, prdNos) {
    try {
      const params = new URLSearchParams({
        method: "getSellProductListJSON", srchTyp: "prdNew", start: "0", limit: String(Math.max(30, prdNos.length)),
        prdNo: encodeURIComponent(prdNos.join("\r\n")), prdNm: "", searchType: "PRDNO", dateType: "CREATE",
        category1: "", category2: "", category3: "", category4: "", chkSelStatCds: "", selMthdCd: "", createDt: "",
        createDtTo: "", stckQty: "", remainSelDt: "", premiumAplDt: "", dlvCstInstBasiCd: "", dlvCstPayTypCd: "",
        premiumPlusAplDt: "", dlvClf: "", dlvClfDtl: "", data: "", searchListingItemClsf: "", mobilePrdYn: "", shopNo: "",
        prdTypCd: "", omPrdYn: "", svcAreaCd: "", isPaging: "Y", reglDlvYn: "N", mnbdClfCd: "", stdPrdYn: "",
        sendClfCd: "ALL", selStopRsnCd: "",
      });
      const response = await fetch(`${listPath}?${params.toString()}`, { method: "POST", credentials: "include", cache: "no-store" });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || /login/i.test(landed.pathname)) return { loggedOut: true };
      if (!response.ok) return { error: `HTTP ${response.status}` };
      const text = (await response.text()).trim();
      if (!/^[({]/.test(text)) {
        return /login|로그인/i.test(text) ? { loggedOut: true } : { error: text.slice(0, 80) };
      }
      let json = null;
      try {
        json = JSON.parse(text.replace(/^\(/, "").replace(/\)$/, ""));
      } catch {
        return { error: "json" };
      }
      if (!Array.isArray(json?.DATA_LIST)) return { error: "DATA_LIST" };
      return {
        rows: json.DATA_LIST.map((row) => ({
          prdNo: row?.prdNo === undefined || row?.prdNo === null ? "" : String(row.prdNo),
          selStatCd: row?.selStatCd === undefined || row?.selStatCd === null ? "" : String(row.selStatCd),
          stckQty: Number(row?.stckQty),
          setTypCd: row?.setTypCd ?? null,
        })),
      };
    } catch (error) {
      return { error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 11번가 [판매중지] · [판매중지 해제] 확인 창의 [적용]과 같은 요청을 보낸다(창의 폼 그대로 — 건수 · 상품번호 · 사유).
   * 답은 창 화면(EUC-KR)이라 `msg` 와 "총 N건 중 M건" 만 읽어 돌려준다. 워커가 인자로만 넘긴다.
   */
  async function st11SaveOnPage(savePath, mode, prdNos) {
    try {
      const body = new URLSearchParams({ chkPrdNoCount: String(prdNos.length), trgtPrdNos: prdNos.join(","), content: "" });
      const response = await fetch(`${savePath}?method=updateProductSelStat&prdStatCd=${encodeURIComponent(mode)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || /login/i.test(landed.pathname)) return { status: response.status, loggedOut: true };
      const buffer = await response.arrayBuffer();
      let text = "";
      try {
        text = new TextDecoder("euc-kr").decode(buffer);
      } catch {
        text = new TextDecoder().decode(buffer);
      }
      const msg = /var\s+msg\s*=\s*["']([^"']*)["']/.exec(text);
      const counted = /총\s*(\d+)\s*건\s*중\s*(\d+)\s*건/.exec(text)
        || /constructReleaseMessage\(\s*Number\((\d*)\)\s*,\s*Number\((\d*)\)/.exec(text);
      const alerted = /alert\(\s*(["'])((?:(?!\1).){1,200})\1/.exec(text);
      return {
        status: response.status,
        msg: msg ? msg[1].slice(0, 80) : null,
        total: counted && counted[1] !== "" ? Number(counted[1]) : null,
        done: counted && counted[2] !== "" ? Number(counted[2]) : null,
        alert: alerted ? alerted[2].slice(0, 160) : null,
      };
    } catch (error) {
      return { status: 0, error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 샵바이 파트너 어드민 화면(partner.shopby.co.kr) 안에서 admin API 요청 하나를 보낸다 — 파트너 로그인 쿠키의 토큰을 머리에
   * 싣고(밖으로 내보내지 않는다) 목록 화면 주소를 ClientLocation 으로 단다. `kind` 는 search(상품번호로 지금 상태) ·
   * status(판매설정 변경). 우리가 쓰는 칸만 추린다. 워커가 인자로만 넘긴다.
   */
  async function shopbyApiOnPage(api, kind, payload) {
    try {
      const hit = document.cookie.split(";").map((part) => part.trim())
        .find((part) => part.startsWith(`${api.tokenCookie}=`));
      const token = hit ? decodeURIComponent(hit.slice(api.tokenCookie.length + 1)) : "";
      if (!token) return { status: 401, loggedOut: true };
      const response = await fetch(`${api.apiOrigin}${kind === "search" ? api.searchPath : api.updatePath}`, {
        method: kind === "search" ? "POST" : "PUT",
        cache: "no-store",
        headers: { accessToken: token, Version: "1.0", ClientLocation: api.clientLocation, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (response.status === 401) return { status: 401, loggedOut: true };
      if (!response.ok) {
        const said = data && typeof data === "object" ? data.message : null;
        return { status: response.status, message: said ? String(said).slice(0, 160) : null };
      }
      if (kind === "search") {
        if (!Array.isArray(data)) return { status: response.status, error: "search" };
        return {
          status: response.status,
          rows: data.map((row) => ({
            no: String(row?.mallProductNo ?? ""),
            mallNo: Number(row?.mallNo),
            saleStatusType: row?.saleStatusType ?? null,
            saleSettingStatusType: row?.saleSettingStatusType ?? null,
            applyStatusType: row?.applyStatusType ?? null,
            isSoldOut: row?.isSoldOut === true,
          })),
        };
      }
      const failures = Array.isArray(data?.failures) ? data.failures : null;
      return {
        status: response.status,
        failures: failures
          ? failures.slice(0, 50).map((entry) => {
            const no = entry?.productNo ?? entry?.mallProductNo ?? null;
            return {
              no: no === null || no === undefined ? null : String(no),
              message: entry?.message ? String(entry.message).slice(0, 120) : null,
            };
          })
          : null,
      };
    } catch (error) {
      return { status: 0, error: String(error?.message || error).slice(0, 200) };
    }
  }


  /**
   * 키드키즈 상품관리 목록을 상품코드로 검색해 그 줄을 읽는다(EUC-KR) — "품절상품" 칸(판매 · 품절), 세금 구분, 그리고
   * [일시품절] · [품절해제]가 보낼 목록 폼 값(그 줄을 고른 채). 읽기만 한다. 워커가 인자로만 넘긴다.
   */
  async function kidkidsRowOnPage(listPath, code) {
    try {
      const params = new URLSearchParams({ s_option: "goods_code", s_key: code });
      const response = await fetch(`${listPath}?${params.toString()}`, { credentials: "include", cache: "no-store" });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || /login/i.test(landed.pathname)) return { loggedOut: true };
      if (!response.ok) return { error: `HTTP ${response.status}` };
      const html = new TextDecoder("euc-kr").decode(await response.arrayBuffer());
      const doc = new DOMParser().parseFromString(html, "text/html");
      const form = doc.querySelector('form[name="frmGoodsList"]');
      if (!form) return doc.querySelector('input[type="password"]') ? { loggedOut: true } : { error: "list_form" };
      const box = [...form.querySelectorAll('input[name="goods_code[]"]')].find((input) => input.value === code);
      if (!box) return { found: false };
      const table = box.closest("table");
      const headRow = table ? [...table.querySelectorAll("tr")].find((tr) => tr.querySelector("th")) : null;
      const heads = headRow ? [...headRow.cells].map((cell) => cell.textContent.replace(/[\s△▽]/g, "")) : [];
      const index = heads.indexOf("품절상품");
      if (index < 0) return { error: "status_column" };
      const word = String(box.closest("tr")?.cells?.[index]?.textContent || "").replace(/\s+/g, "");
      box.checked = true;
      const pairs = [...new FormData(form)].map(([name, value]) => [name, String(value)]);
      return { found: true, word, taxType: box.getAttribute("tax_type") ?? "", pairs };
    } catch (error) {
      return { error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 키드키즈 [일시품절] · [품절해제]처럼 목록 폼을 숨은 창으로 제출한다. 폼은 화면 문서(EUC-KR)에서 만들어 브라우저가
   * 화면과 같은 인코딩으로 보내게 하고, 답 화면의 스크립트(부모 새로고침 · 알림)는 창을 막아 돌지 않게 한다. 답은 알림 글만
   * 돌려준다. 워커가 인자로만 넘긴다.
   */
  async function kidkidsSaveOnPage(savePath, pairs) {
    let frame = null;
    let form = null;
    try {
      const frameName = `kiditem_kidkids_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      frame = document.createElement("iframe");
      frame.name = frameName;
      frame.setAttribute("sandbox", "allow-same-origin");
      frame.style.display = "none";
      document.body.appendChild(frame);
      form = document.createElement("form");
      form.method = "post";
      form.action = savePath;
      form.acceptCharset = "euc-kr";
      form.target = frameName;
      form.style.display = "none";
      for (const [name, value] of pairs) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      const target = frame;
      const loaded = new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 30000);
        target.addEventListener("load", function onLoad() {
          let href = "";
          try {
            href = String(target.contentWindow?.location?.href || "");
          } catch {
            href = "";
          }
          if (href === "" || href === "about:blank") return;
          target.removeEventListener("load", onLoad);
          clearTimeout(timer);
          resolve(true);
        });
      });
      form.submit();
      if (!(await loaded)) return { status: 0, error: "timeout" };
      let text = "";
      let path = "";
      try {
        text = String(frame.contentDocument?.documentElement?.outerHTML || "");
        path = String(frame.contentWindow?.location?.pathname || "");
      } catch {
        text = "";
      }
      if (/login/i.test(path) || /type=["']?password/i.test(text)) return { status: 200, loggedOut: true };
      const alerted = /alert\(\s*(["'])((?:(?!\1).){1,200})\1/.exec(text);
      return { status: 200, alert: alerted ? alerted[2].slice(0, 160) : null };
    } catch (error) {
      return { status: 0, error: String(error?.message || error).slice(0, 200) };
    } finally {
      form?.remove();
      frame?.remove();
    }
  }

  /**
   * 꼬망세 노출/재고/KC 설정 화면을 상품코드로 검색해 그 줄의 지금 값을 읽는다. 읽기만 한다. 워커가 인자로만 넘긴다.
   * 로그인이 풀렸으면 설정 화면이 아닌 곳(로그인)으로 넘어간다.
   */
  async function kkomangseRowOnPage(viewPath, code) {
    try {
      const params = new URLSearchParams({ mode: "search", pass_input_type: "pcode", pass_input_value: code });
      const response = await fetch(`${viewPath}?${params.toString()}`, { credentials: "include", cache: "no-store" });
      const landed = new URL(response.url || location.href, location.href);
      if (landed.origin !== location.origin || landed.pathname !== viewPath) return { loggedOut: true };
      if (!response.ok) return { error: `HTTP ${response.status}` };
      const doc = new DOMParser().parseFromString(await response.text(), "text/html");
      if (!doc.querySelector('form[name="searchfrm"]')) return { loggedOut: true };
      const box = [...doc.querySelectorAll("input.js_ck")].find((candidate) => candidate.getAttribute("data-pcode") === code);
      if (!box) return { found: false };
      const row = box.closest("tr");
      const field = (name) => [...row.querySelectorAll("input")].filter((input) => input.name === `${name}[${code}]`);
      const checked = (name) => field(name).find((input) => input.checked)?.value ?? "";
      const text = (name) => field(name)[0]?.value ?? "";
      return {
        found: true,
        view: checked("_view"),
        stock: text("_stock"),
        stockControl: checked("_stock_control"),
        kcYn: checked("_kc_yn"),
        kcNum: text("_kc_num"),
        kcDate: text("_kc_date"),
      };
    } catch (error) {
      return { error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 카페24 관리자 상품목록을 끝까지 읽어 상품마다 진열 · 판매 상태를 돌려준다. 읽기만 한다. 워커가 인자로만 넘긴다.
   *
   * 줄마다 있는 체크박스(`input._product_no`)가 상품번호와 지금 값(`is_display` · `is_selling` · `is_set_product`)을
   * 들고 있다 — [판매함] · [판매안함] 버튼도 이 값을 읽어 보낸다. 로그인이 풀렸으면 목록 화면이 아닌 곳에 닿는다.
   */
  async function cafe24ListOnPage(listPath, pageSize, maxPages) {
    try {
      const rows = [];
      const seen = new Set();
      let total = null;
      for (let page = 1; page <= maxPages; page += 1) {
        const params = new URLSearchParams({ orderby: "regist_d", limit: String(pageSize), page: String(page) });
        const response = await fetch(`${listPath}?${params.toString()}`, { credentials: "include", cache: "no-store" });
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== location.origin || landed.pathname.toLowerCase() !== listPath.toLowerCase()) {
          return { loggedOut: true };
        }
        if (!response.ok) return { error: `HTTP ${response.status}` };
        const doc = new DOMParser().parseFromString(await response.text(), "text/html");
        if (!doc.querySelector("#eProductSearchForm")) return { loggedOut: true };
        if (total === null) {
          // 칸이 없거나 숫자가 없으면 0 으로 읽혀 첫 쪽만 읽고 멈춘다 — 숫자가 있어야 믿는다.
          const counter = String(doc.querySelector(".total strong")?.textContent || "");
          const counted = Number(counter.replace(/[^\d]/g, ""));
          if (!/\d/.test(counter) || !Number.isSafeInteger(counted)) return { error: "상품 수를 읽지 못했습니다" };
          total = counted;
        }
        // T · F 가 아니면 모른다(null) — 모르는 상태를 판매안함으로 읽지 않는다.
        const flag = (value) => (value === "T" ? true : value === "F" ? false : null);
        const boxes = [...doc.querySelectorAll("input._product_no")];
        for (const box of boxes) {
          const no = String(box.value || "").trim();
          if (!/^\d{1,12}$/.test(no) || seen.has(no)) continue;
          seen.add(no);
          rows.push({
            no,
            display: flag(box.getAttribute("is_display")),
            selling: flag(box.getAttribute("is_selling")),
            set: box.getAttribute("is_set_product") === "T",
          });
        }
        if (rows.length >= total || boxes.length < pageSize) break;
      }
      return { total, rows };
    } catch (error) {
      return { error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 윙 화면의 판매자 계정이 실행에 지정된 계정인가(`shared/wing-account-identity.js` — 화면 글자·메타만 읽는다). 윙 품절은
   * 보내기 전과 다시 읽은 뒤 두 번 본다 — 사이에 계정이 바뀌면 그 읽기를 증거로 쓰지 않는다.
   */
  function wingIdentityOnPage(expectedVendorId) {
    return globalThis.KidItemWingAccountIdentity?.verifyExpectedVendorId(expectedVendorId)
      ?? { ok: false, error: "Wing 계정 식별 기능을 사용할 수 없습니다." };
  }

  calls["availability.wingIdentityOnPage"] = (args) => wingIdentityOnPage(...(Array.isArray(args) ? args : []));
  calls["availability.requestOnPage"] = (args) => requestOnPage(...(Array.isArray(args) ? args : []));
  calls["availability.alwayzRequestOnPage"] = (args) => alwayzRequestOnPage(...(Array.isArray(args) ? args : []));
  calls["availability.teacherBatchFormOnPage"] = (args) => teacherBatchFormOnPage(...(Array.isArray(args) ? args : []));
  calls["availability.teacherCatalogStatusOnPage"] = (args) => teacherCatalogStatusOnPage(...(Array.isArray(args) ? args : []));
  calls["availability.icecreamRowsOnPage"] = (args) => icecreamRowsOnPage(...(Array.isArray(args) ? args : []));
  calls["availability.icecreamSaveOnPage"] = (args) => icecreamSaveOnPage(...(Array.isArray(args) ? args : []));
  calls["availability.kidsnoteListOnPage"] = (args) => kidsnoteListOnPage(...(Array.isArray(args) ? args : []));
  calls["availability.kidsnoteSaveOnPage"] = (args) => kidsnoteSaveOnPage(...(Array.isArray(args) ? args : []));
  calls["availability.esmSearchOnPage"] = (args) => esmSearchOnPage(...(Array.isArray(args) ? args : []));
  calls["availability.esmSellStatusOnPage"] = (args) => esmSellStatusOnPage(...(Array.isArray(args) ? args : []));
  calls["availability.st11ListOnPage"] = (args) => st11ListOnPage(...(Array.isArray(args) ? args : []));
  calls["availability.st11SaveOnPage"] = (args) => st11SaveOnPage(...(Array.isArray(args) ? args : []));
  calls["availability.shopbyApiOnPage"] = (args) => shopbyApiOnPage(...(Array.isArray(args) ? args : []));
  calls["availability.kidkidsRowOnPage"] = (args) => kidkidsRowOnPage(...(Array.isArray(args) ? args : []));
  calls["availability.kidkidsSaveOnPage"] = (args) => kidkidsSaveOnPage(...(Array.isArray(args) ? args : []));
  calls["availability.kkomangseRowOnPage"] = (args) => kkomangseRowOnPage(...(Array.isArray(args) ? args : []));
  calls["availability.cafe24ListOnPage"] = (args) => cafe24ListOnPage(...(Array.isArray(args) ? args : []));
})();
