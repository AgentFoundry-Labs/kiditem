(function initializeMallAvailabilitySend(root) {
  "use strict";

  // 몰 품절 송신 — 키드키즈·꼬망세·온채널·도매꾹·쿠팡 윙(옵션 재고 0). 아이스크림몰은 경로 대기.
  //
  // 사장님이 품절 버튼을 한 번 누르면 **여기서 끝까지 보낸다.** 사람이 몰마다 들어가
  // 다시 누르게 하지 않는다(사장님 2026-09-18: "내가 버튼 누르면 너가 알아서 몰에
  // 들어가서 품절 처리해야지").
  //
  // 상품등록(`mall-form-register.js`)이 제출하지 않는 것과 다르다. 등록은 승인이
  // 붙고 되돌리기 어렵지만, 품절은 **같은 화면에서 같은 값으로 되돌릴 수 있다**
  // (매니페스트 `supports.resume`). 되돌릴 수 있는 일이라 끝까지 한다.
  //
  // ⚠️ 대화상자를 가로채지 않는다. 몰의 버튼을 누르는 대신 **그 버튼이 만들 폼을
  //    그대로 직렬화해서 보낸다** — 나가는 바이트가 같고 confirm 창이 끼어들 자리가
  //    없다. 몰이 무엇을 받을지 우리가 정확히 알고 보내는 것이 요점이다.
  //
  // ⚠️ 보냈다(`sent`)와 반영됐다(`published`)는 다른 사실이다. 이 파일은 보낸 것과
  //    몰이 뭐라고 답했는지까지만 말한다. 반영은 몰 재조회가 답한다.

  const SEND_TIMEOUT_MS = 180000;
  /** 몰 관리자를 몰아치지 않는다. 한 건 보내고 쉬는 간격. */
  const PACE_MS = 700;
  /**
   * 쿠팡 윙 상품 사이 간격. 윙은 몰아치면 HTTP 429 로 막는다(실측 2026-09-18: 쉬지 않고 옵션 목록을 읽으면
   * 170번쯤에서 막혔다). 이미 품절이라 보낼 것이 없는 상품도 읽기는 하므로 상품마다 쉰다.
   */
  const WING_PRODUCT_PACE_MS = 400;
  /** 윙이 429 로 막으면 이만큼 쉬고 같은 요청을 다시 보낸다. 끝까지 막히면 거기서 멈춘다. */
  const WING_RATE_LIMIT_WAITS_MS = [5000, 15000, 30000];
  /** 보낸 뒤 다시 읽어 아직 안 바뀌었으면 한 번 더 볼 때까지 기다리는 시간. */
  const WING_RECHECK_MS = 1500;
  /** 지금 재고 읽기 한 번에 읽는 상품 수. 등록현황 칸은 한 상품만 읽는다. */
  const READ_LIMIT = 20;

  /**
   * 몰마다 다른 것 전부.
   *
   * `codeFrom` 은 그 몰이 상품코드를 어디에 두는지다. 우리가 가진 코드
   * (`ChannelListing.externalId`)와 같은 값이어야 줄을 짚을 수 있다 — 목록을 가져올 때
   * 쓴 것과 같은 코드다(`mall-admin-listings.js`).
   *
   * `perCode` 는 "한 번에 한 상품" 이라는 뜻이다. 그 몰의 화면이 그렇게 생겼을 때만
   * 켠다 — 꼬망세는 저장 버튼이 **페이지 전체**를 저장해서(실측: 고른 줄과 무관하게
   * 50줄 전부) 상품 하나만 있는 페이지를 만들어야 그 줄만 바뀐다.
   */
  const SPECS = {
    kkomangse: {
      label: "꼬망세",
      origin: "https://nstore.edupre.co.kr",
      // 전 상품이 한 페이지에 오게 한다(가져오기가 쓰는 것과 같은 상한).
      //
      // 검색으로 한 상품만 남기는 길도 있지만 그 파라미터 값을 실측하지 못했다. 반면
      // **페이지 전체를 그대로 보내는 것**은 실측했다 — `입력값 전체저장` 이 정확히
      // 그렇게 한다(2026-09-18: 고른 줄과 무관하게 페이지의 모든 줄을 담아 보낸다).
      // 우리 줄만 재고 0 으로 바꾸고 나머지는 지금 값 그대로 실려 나가므로, 이 요청은
      // 몰의 자기 버튼이 하는 일을 벗어나지 않는다. 추측한 주소로 좁히는 것보다 안전하다.
      listPath: () => "/subAdmin/_product_mass.view.php?listmaxcount=10000",
      perCode: false,
      form: "frm",
      action: "/subAdmin/_product_mass.pro.php",
      // 이 몰에는 '일시품절'이 없다. 끄는 값이 판매종료(_view=N)뿐이라 그걸로 내리면
      // 노출이 통째로 꺼져 되돌릴 때 새로 시작하는 것과 같아진다. 재고 0 을 쓴다.
      set: [
        { selector: 'input[name^="_stock["]', value: "0" },
        { selector: 'input[name^="_stock_control["][value="Y"]', check: true },
        { selector: "input.js_ck", check: true },
      ],
      resumeSet: [{ selector: 'input[name^="_stock["]', value: "{stock}" }],
      // 버튼이 채우는 값. 실측(2026-09-18): 두 칸 다 mass_view.
      hidden: { _mode: "mass_view", _submode: "mass_view" },
      rowKey: { selector: "input.js_ck", attr: "data-pcode" },
    },
    kidkids: {
      label: "키드키즈",
      origin: "https://partner.kidkids.net",
      listPath: () => "/sales/goods_list_renewal.htm?pNum=1",
      perCode: false,
      form: "frmGoodsList",
      action: "/sales/proc_logis.htm",
      // changeUseFlag('N') 이 채우는 값. 해제는 같은 칸에 'Y'.
      hidden: { commitType: "use_flag", use_flag: "N" },
      resumeHidden: { commitType: "use_flag", use_flag: "Y" },
      rowKey: { selector: 'input[name="goods_code[]"]', attr: "value" },
      encoding: "euc-kr",
    },
    onch: {
      label: "온채널",
      origin: "https://www.onch3.co.kr",
      listPath: () => "/products_management.php",
      perCode: false,
      // 폼이 아니라 ajax 한 방이다. 상품코드를 / 로 이어 한 번에 보낸다.
      post: {
        path: "/access/product_access.php?ubr=option_state_modi",
        // 4 = 일시품절(되돌릴 수 있는 값). 1 = 재입고.
        body: (codes) => ({ prd_code_str: codes.join("/"), sec: "4", comment: "재고 소진" }),
        resumeBody: (codes) => ({ prd_code_str: codes.join("/"), sec: "1", comment: "재입고" }),
      },
      // ⚠️ 이건 관리자에게 가는 **요청**이다. 200 이 와도 승인 전까지 반영이 아니다.
      requestOnly: true,
    },
    /**
     * 도매꾹 상품공급사센터. 상품조회/수정 목록(`/sc/item/lstAll`)의 [수정저장] 이 보내는 것과 같은
     * 요청이다(실측 2026-09-18).
     *
     *  - 품절 = 진열안함, 해제 = 진열함. 도매꾹 목록에서는 재고를 못 고친다(재고 칸 편집이 막혀 있다).
     *    사방넷도 도매꾹은 일시중지 · 완전품절 둘 다 `숨김중` 으로 보낸다(쇼핑몰특이사항).
     *  - [수정저장] 은 고친 줄마다 `{no, disp, title, loq, useOpt}` 를 모아 `dat=` 한 번으로 보낸다. 상품명 ·
     *    최대판매수량 · 옵션 사용도 같이 가므로 **지금 값을 그대로** 실어야 한다 — 먼저 목록 조회
     *    (`/sc/item/lst`, 상품번호 500개까지)로 그 줄을 읽는다. 목록의 검색 폼이 보내는 기본값 그대로다.
     *  - 보낸 뒤 같은 조회로 진열여부를 다시 읽어 반영을 확인한다(`confirmed`).
     */
    domeggook: {
      label: "도매꾹",
      origin: "https://www.domeggook.com",
      listEdit: {
        lookupPath: "/sc/item/lst",
        editPath: "/sc/item/editOnList",
        // 상품번호 검색 칸이 받는 최대 개수.
        maxCodes: 500,
        shown: { hide: "진열안함", show: "진열함" },
      },
    },
    /**
     * 쿠팡 윙. 품절 = **옵션 재고수량 0** — 윙 상품목록의 재고수량 칸을 고치면 보내는 것과 같은 요청이다
     * (실측 2026-09-18, 화면 코드 `app/listV3.js`). 윙에서 품절과 판매중지는 다르다: 품절은 판매중인 채로
     * '품절' 로 보이고 재고를 넣으면 다시 팔린다(사장님: "품절 처리할려는건데").
     *
     *  - 옵션 단위다. 등록상품ID로 옵션 목록(`vendor-inventory-items-with-vendorItems`)을 읽어
     *    `vendorInventoryItemId` 를 얻고, 품절 옵션(옵션ID = vendorItemId)만 `stock-manager/remain-change/request`
     *    에 `stockManageItems={"dtos":[{vendorInventoryItemId, vendorItemId, inventoryQuantity:0}]}` 로 보낸다.
     *    해제는 같은 칸에 `resumeQuantity`.
     *  - 옵션을 짚지 않은 상품(등록현황 칸의 품절 처리)은 그 상품의 옵션 전부다.
     *  - 로켓그로스(RFM) 옵션은 쿠팡 재고라 윙 화면도 못 고친다 — 건너뛴다.
     *  - 보낸 뒤 옵션 목록을 다시 읽어 재고가 바뀐 옵션을 센다(`confirmed`). 세는 단위는 옵션이다.
     *  - **윙 상품목록(`vendor-inventory/list`) 안에서** 보낸다 — 사장님이 손으로 품절을 하는 바로 그 화면이고, 윙 API 는
     *    윙 화면의 로그인으로 불러야 한다(사장님 2026-09-18: "vendor-inventory/list 여기 가서 해야하잖아" — 리뷰
     *    화면을 쓰던 것이 잘못이었다).
     *  - 등록현황 칸에서 상품 하나를 누르면(`show`) 그 상품을 검색한 상품목록을 **앞에** 띄우고, 보낸 뒤 새로 고쳐
     *    바뀐 재고(품절)를 보여 준 채로 둔다. 여러 상품을 나눠 보낼 때와 지금 재고 읽기는 상품목록을 뒤에서 열고 닫는다.
     *  - 해제는 재고 0 인 옵션에만 `resumeQuantity` 를 넣는다. 재고가 남아 있는 옵션(1861 · 9954 …)을 999 로
     *    낮추지 않는다.
     */
    coupang: {
      label: "쿠팡 윙",
      origin: "https://wing.coupang.com",
      optionStock: {
        // 윙 상품목록. 사장님이 쓰는 주소 그대로이고 검색어 칸에 등록상품ID 를 넣는다.
        listUrl: (keyword) => "https://wing.coupang.com/vendor-inventory/list?searchKeywordType=ALL"
          + `&searchKeywords=${encodeURIComponent(keyword || "")}`
          + "&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes="
          + "&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL"
          + "&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR"
          + "&sortMethod=SORT_BY_REGISTRATION_DATE&countPerPage=50&page=1",
        listPath: "/vendor-inventory/list",
        itemsPath: "/tenants/seller-web/v2/vendor-inventory/vendor-inventory-items-with-vendorItems/",
        itemsQuery: "hasProgressiveDiscountRule=true&queryNonVariationJustificationProof=true&queryMpnProof=true",
        changePath: "/tenants/seller-web/vendorinventory/stock-manager/remain-change/request",
        // 해제할 때 품절(재고 0) 옵션에 넣는 재고. 원래 값이 아니라 "다시 판다"는 기본값이다 — 윙 재고는
        // 상품마다 다르다(999 · 1861 · 9954 …, 실측 2026-09-18).
        resumeQuantity: 999,
      },
    },
  };

  /** 이 몰은 아직 경로가 없다. 화면이 버튼을 세우지 않게 이름만 남긴다. */
  const PENDING = {
    "icecream-mall": "판매상태 일괄변경이 별도 창(goodsSaleStateModifyView.do)에서 저장돼 창 사이를 잇는 경로가 더 필요합니다.",
  };

  /**
   * 윙 화면 안에서 요청 하나를 보낸다. 워커가 인자로만 넘긴다(클로저를 잡을 수 없다).
   * 답은 몰이 준 JSON 그대로 돌려주되, JSON 이 아니면 앞부분만 싣는다(로그인 화면 판별용).
   */
  async function requestOnPage(path, method, contentType, body) {
    try {
      const response = await fetch(path, {
        method,
        credentials: "include",
        headers: {
          Accept: "application/json, text/plain, */*",
          ...(contentType ? { "Content-Type": contentType } : {}),
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
   * 화면에서 값을 세우고 **그 폼이 보낼 것을 그대로 모아 돌려준다.**
   *
   * 보내지는 않는다 — 보내는 것은 워커가 한다. 페이지 안에서 fetch 하면 응답을
   * 워커가 못 보고, 페이지가 이동하면 결과를 잃는다.
   */
  function collectFormOnPage(payload) {
    const { formName, set, hidden, rowKey, codes } = payload;
    const form = document.forms[formName];
    if (!form) return { ok: false, error: "품절 화면의 폼을 찾지 못했습니다." };

    const wanted = new Set(codes);
    const matched = [];
    const rows = [...document.querySelectorAll(rowKey.selector)];
    for (const anchor of rows) {
      const code = rowKey.attr === "value"
        ? (anchor.value || "")
        : (anchor.getAttribute(rowKey.attr) || "");
      if (!wanted.has(code)) continue;
      matched.push(code);
      if (anchor.type === "checkbox") {
        anchor.checked = true;
        anchor.dispatchEvent(new Event("change", { bubbles: true }));
      }
      // 값 칸은 **그 줄 안에서만** 찾는다. 화면 전체에서 찾으면 고르지 않은 줄까지
      // 고쳐 놓고 폼을 통째로 보낼 때 같이 나간다.
      const row = anchor.closest("tr") || anchor.parentElement;
      for (const rule of set || []) {
        const field = row && row.querySelector(rule.selector);
        if (!field) continue;
        if (rule.check) {
          field.checked = true;
          field.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          field.value = rule.value;
          field.dispatchEvent(new Event("input", { bubbles: true }));
          field.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    }

    if (matched.length === 0) {
      return { ok: false, error: "이 화면에서 대상 상품을 찾지 못했습니다.", matched: [] };
    }

    for (const [name, value] of Object.entries(hidden || {})) {
      let field = form.elements[name];
      if (field && field.length && field.tagName === undefined) field = field[0];
      if (field) field.value = value;
      else {
        const made = document.createElement("input");
        made.type = "hidden";
        made.name = name;
        made.value = value;
        form.appendChild(made);
      }
    }

    // 폼이 보낼 것을 그대로. 버튼을 눌렀을 때와 같은 바이트다.
    const pairs = [];
    for (const [name, value] of new FormData(form).entries()) {
      if (typeof value === "string") pairs.push([name, value]);
    }
    return { ok: true, matched, pairs, rowsOnPage: rows.length };
  }

  function create({ chrome: chromeApi, fetch: fetchApi, interactiveTabs, tabReason, sleep: sleepOverride }) {
    function waitForTabComplete(tabId, timeoutMs = 45000) {
      if (!chromeApi.tabs?.onUpdated?.addListener) return Promise.resolve(null);
      return new Promise((resolve) => {
        let done = false;
        const finish = (value) => {
          if (done) return;
          done = true;
          chromeApi.tabs.onUpdated.removeListener(onUpdated);
          clearTimeout(timer);
          resolve(value);
        };
        const onUpdated = (id, changeInfo, tab) => {
          if (id === tabId && changeInfo.status === "complete") finish(tab || {});
        };
        const timer = setTimeout(() => finish(null), timeoutMs);
        chromeApi.tabs.onUpdated.addListener(onUpdated);
      });
    }

    // 시험은 기다리는 시간을 건너뛴다(429 로 30초씩 쉬는 길을 실제로 기다리지 않는다).
    const sleep = sleepOverride || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

    /** 몰이 뭐라고 답했는지. 본문은 남기지 않는다 — 길이와 신호만 본다. */
    function readAnswer(status, text) {
      const body = String(text || "");
      const failed = /로그인|login|오류|실패|error|권한/i.test(body.slice(0, 500));
      return { status, accepted: status >= 200 && status < 400 && !failed, failed };
    }

    /** 몰이 JSON 으로 답하면 읽는다. 아니면 null. 본문은 남기지 않는다. */
    async function readJson(response) {
      const text = await response.text().catch(() => "");
      try {
        return { json: JSON.parse(text), text };
      } catch {
        return { json: null, text };
      }
    }

    /** 도매꾹 목록 조회 — 상품번호로. 목록 검색 폼이 보내는 기본값에 번호만 넣는다. 읽기만 한다. */
    async function lookupListRows(spec, codes) {
      const params = new URLSearchParams();
      for (const [key, value] of [
        ["ktype", "no"], ["nos", codes.join(",")], ["ttl", ""], ["st", ""],
        ["chn[]", "dome"], ["chn[]", "supply"], ["sec[]", "sell"], ["sec[]", "shop"],
        ["ca1", "00"], ["ca2", "00"], ["ca3", "00"], ["ca4", "00"],
        ["idx", ""], ["qty", ""], ["disp", ""], ["rmp", ""], ["format", "grid"],
        ["pg", "1"], ["sz", String(spec.listEdit.maxCodes)], ["so", "rd"],
      ]) params.append(key, value);
      const response = await fetchApi(`${spec.origin}${spec.listEdit.lookupPath}?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { accept: "application/json", "x-requested-with": "XMLHttpRequest" },
      });
      const { json, text } = await readJson(response);
      if (!response.ok || !json || json.res !== true || !Array.isArray(json.dat)) {
        const loggedOut = /로그인|login/i.test(`${json?.msg || ""} ${text.slice(0, 300)}`);
        throw new Error(loggedOut
          ? `${spec.label}에 로그인되어 있지 않습니다. 로그인한 뒤 다시 보내세요.`
          : `${spec.label} 상품 목록을 읽지 못했습니다.`);
      }
      return json.dat;
    }

    /**
     * 목록 수정 한 방으로 진열여부를 바꾸는 몰(도매꾹).
     *
     * 줄을 먼저 읽어 지금 값(상품명 · 최대판매수량 · 옵션 사용)을 그대로 싣고 진열여부만 바꾼다. 이미
     * 원하는 상태인 줄은 보내지 않는다. 보낸 뒤 다시 읽어 바뀐 줄을 센다.
     */
    async function sendByListEdit(spec, codes, resume) {
      const edit = spec.listEdit;
      const wanted = resume ? edit.shown.show : edit.shown.hide;
      const warnings = [];
      let sent = 0;
      let failed = 0;
      let confirmed = 0;
      let already = 0;
      const missing = [];
      for (let start = 0; start < codes.length; start += edit.maxCodes) {
        const group = codes.slice(start, start + edit.maxCodes);
        const rows = new Map((await lookupListRows(spec, group)).map((row) => [String(row.no), row]));
        const found = group.filter((code) => rows.has(code));
        missing.push(...group.filter((code) => !rows.has(code)));
        const targets = found.filter((code) => rows.get(code).disp !== wanted);
        already += found.length - targets.length;
        if (targets.length > 0) {
          // [수정저장] 이 만드는 모양 그대로다(`loq` 는 첫 쉼표만 뗀다 — 화면 코드가 그렇게 한다).
          const dat = targets.map((code) => {
            const row = rows.get(code);
            return {
              no: row.no,
              disp: resume,
              title: row.title,
              loq: String(row.loq ?? "").replace(",", ""),
              useOpt: row.useOpt !== "N",
            };
          });
          const response = await fetchApi(`${spec.origin}${edit.editPath}`, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              accept: "application/json",
              "x-requested-with": "XMLHttpRequest",
            },
            body: `dat=${encodeURIComponent(JSON.stringify(dat))}`,
          });
          const { json } = await readJson(response);
          if (!response.ok || !json || json.res !== true) {
            failed += targets.length;
            warnings.push(`${spec.label}이 수정을 받지 않았습니다${json?.msg ? `: ${String(json.msg).slice(0, 120)}` : ""}.`);
          } else {
            const ok = Number.isFinite(Number(json.success)) ? Math.min(Number(json.success), targets.length) : targets.length;
            sent += ok;
            failed += targets.length - ok;
            if (ok < targets.length) warnings.push(`${spec.label}이 ${targets.length}건 중 ${ok}건만 바꿨다고 답했습니다.`);
          }
          await sleep(PACE_MS);
        }
        // 반영 확인 — 같은 조회로 진열여부를 다시 읽는다. 못 읽으면 확인하지 못한 것으로 둔다.
        const after = found.length > 0 ? await lookupListRows(spec, found).catch(() => null) : [];
        if (after) confirmed += after.filter((row) => row.disp === wanted).length;
        else warnings.push(`${spec.label}에서 바뀐 상태를 다시 읽지 못했습니다. 목록에서 확인하세요.`);
      }
      if (already > 0) warnings.push(`${already}건은 이미 ${wanted}이었습니다.`);
      if (missing.length > 0) warnings.push(`${missing.length}건은 ${spec.label} 상품번호로 찾지 못했습니다.`);
      return {
        success: true,
        // 이미 원하는 상태인 줄은 보낼 것이 없었을 뿐 끝난 일이다.
        sent: sent + already,
        failed: failed + missing.length,
        confirmed,
        requestOnly: false,
        warnings,
      };
    }

    /**
     * 윙 상품목록을 열고, 그 안에서 윙 API 를 부르는 도구를 `work` 에 넘긴다. 윙 API 는 윙 화면의 로그인으로 불러야
     * 한다. 로그인 화면으로 넘어갔으면 부르지 않는다.
     *
     *  - `show`(상품코드)가 있으면 그 상품을 검색한 상품목록을 **앞에** 띄운다. 이미 열린 상품목록 탭이 있으면 그 탭을
     *    쓴다. 보낸 뒤 새로 고쳐 바뀐 재고를 보여 주고, 사장님이 보도록 닫지 않는다. 로그인 화면이 떠도 닫지 않는다 —
     *    거기서 로그인하면 된다.
     *  - 없으면 상품목록을 뒤에서 열고 끝나면(실패해도) 닫는다.
     *
     * 윙이 429 로 막으면 쉬었다 같은 요청을 다시 보낸다(재고를 정해진 값으로 두는 요청이라 다시 보내도 같다).
     * 429 를 로그아웃으로 읽지 않는다.
     */
    async function withWingPage(spec, work, { show = null } = {}) {
      const stock = spec.optionStock;
      let tabId = null;
      const closeWhenDone = !show;
      const inPage = async (path, method, contentType, body) => {
        for (let attempt = 0; ; attempt += 1) {
          const [injected] = await chromeApi.scripting.executeScript({
            target: { tabId },
            func: requestOnPage,
            args: [path, method, contentType, body],
          });
          const answer = injected?.result || { status: 0, json: null, preview: "", url: "" };
          if (answer.status !== 429 || attempt >= WING_RATE_LIMIT_WAITS_MS.length) return answer;
          await sleep(WING_RATE_LIMIT_WAITS_MS[attempt]);
        }
      };
      const readItems = async (product) => {
        const answer = await inPage(`${stock.itemsPath}${product}?${stock.itemsQuery}`, "GET", null, null);
        if (answer.status === 200 && answer.json?.success === true && Array.isArray(answer.json.data)) {
          return { items: answer.json.data };
        }
        return {
          status: answer.status,
          rateLimited: answer.status === 429,
          loggedOut: answer.status !== 429 && /login|로그인|xauth/i.test(`${answer.url} ${answer.preview}`),
        };
      };
      try {
        const url = stock.listUrl(show || "");
        if (show) {
          // 이미 열린 상품목록 탭이 있으면 그 탭에서 이 상품을 검색해 앞에 띄운다. 탭이 쌓이지 않는다.
          const [open] = await chromeApi.tabs.query({ url: `${spec.origin}${stock.listPath}*` }).catch(() => []);
          const tab = open
            ? await chromeApi.tabs.update(open.id, { url, active: true })
            : await chromeApi.tabs.create({ url, active: true });
          tabId = tab.id;
        } else {
          const tab = await chromeApi.tabs.create({ url, active: false });
          tabId = tab.id;
        }
        const waited = await waitForTabComplete(tabId).catch(() => undefined);
        await sleep(waited ? 900 : 2200);
        const current = await chromeApi.tabs.get(tabId).catch(() => null);
        if (!String(current?.url || current?.pendingUrl || "").startsWith(spec.origin)) {
          return {
            success: false,
            error: show
              ? `${spec.label}에 로그인되어 있지 않습니다. 열린 윙 화면에서 로그인한 뒤 다시 누르세요.`
              : `${spec.label}에 로그인되어 있지 않습니다. 로그인한 뒤 다시 시도하세요.`,
          };
        }
        const result = await work({ inPage, readItems });
        // 사장님이 보는 상품목록은 새로 고쳐 바뀐 재고(품절)를 보여 준다.
        if (show) await chromeApi.tabs.reload(tabId).catch(() => undefined);
        return result;
      } finally {
        // 뒤에서 연 탭만 닫는다. 앞에 띄운 상품목록은 사장님 것이다(원래 열려 있던 탭일 수도 있다).
        if (tabId !== null && closeWhenDone) await chromeApi.tabs.remove(tabId).catch(() => undefined);
      }
    }

    /**
     * 쿠팡 윙 옵션 재고. 상품마다 옵션 목록을 읽고, 짚은 옵션의 재고를 0(해제는 재고 0 인 옵션에
     * `resumeQuantity`)으로 보낸 뒤 다시 읽어 확인한다.
     *
     * 윙이 끝까지 막으면(429) 거기서 멈춰 남은 상품을 보내지 못한 것으로 센다(`stopped: "rate_limited"`).
     */
    async function sendByOptionStock(spec, codes, options, resume, show) {
      const stock = spec.optionStock;
      const quantity = resume ? stock.resumeQuantity : 0;
      const warnings = [];
      const products = codes.filter((code) => /^\d{1,15}$/.test(code));
      const invalid = codes.length - products.length;
      if (invalid > 0) warnings.push(`${invalid}건은 ${spec.label} 등록상품ID 모양이 아니라 보내지 않았습니다.`);

      let sent = 0;
      let failed = invalid;
      let confirmed = 0;
      let already = 0;
      let rocket = 0;
      // 윙이 끝까지 막아 멈춘 자리(products 의 index). 여기부터는 보내지 않았다.
      let stoppedAt = null;
      // 보내기에서 막힌 상품(읽기는 됐다). 멈춘 자리 앞이지만 역시 보내지 못했다.
      let blockedOnSend = 0;
      const wantedOf = (product) => (Array.isArray(options?.[product])
        ? new Set(options[product].map((code) => String(code)).filter((code) => /^\d{1,15}$/.test(code)))
        : null);
      const isTarget = (item) => (resume
        ? Number(item.stockQuantity) === 0
        : Number(item.stockQuantity) !== 0);
      // 상품 하나를 사장님이 눌렀을 때만 상품목록을 앞에 띄운다. 나눠 보내는 묶음은 뒤에서.
      const shown = show && products.length === 1 ? products[0] : null;
      const halted = await withWingPage(spec, async ({ inPage, readItems }) => {
        for (let index = 0; index < products.length; index += 1) {
          const product = products[index];
          if (index > 0) await sleep(WING_PRODUCT_PACE_MS);
          const wanted = wantedOf(product);
          const read = await readItems(product);
          if (!read.items) {
            if (read.loggedOut) {
              return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 보내세요.` };
            }
            if (read.rateLimited) {
              stoppedAt = index;
              break;
            }
            failed += wanted ? wanted.size : 1;
            warnings.push(`${product}: ${spec.label} 옵션 목록을 읽지 못했습니다(HTTP ${read.status}).`);
            continue;
          }
          const items = read.items.filter((item) => !wanted || wanted.has(String(item.vendorItemId)));
          if (wanted) {
            const missing = [...wanted].filter((code) => !read.items.some((item) => String(item.vendorItemId) === code));
            if (missing.length > 0) {
              failed += missing.length;
              warnings.push(`${product}: 옵션 ${missing.length}개가 ${spec.label}에 없습니다.`);
            }
          }
          const editable = items.filter((item) => item.registrationType !== "RFM");
          rocket += items.length - editable.length;
          const targets = editable.filter(isTarget);
          already += editable.length - targets.length;
          if (targets.length === 0) continue;
          const dtos = targets.map((item) => ({
            vendorInventoryItemId: item.vendorInventoryItemId,
            vendorItemId: item.vendorItemId,
            inventoryQuantity: quantity,
          }));
          const answer = await inPage(
            stock.changePath,
            "POST",
            "application/x-www-form-urlencoded; charset=UTF-8",
            `stockManageItems=${encodeURIComponent(JSON.stringify({ dtos }))}`,
          );
          if (answer.status === 429) {
            failed += targets.length;
            blockedOnSend = 1;
            stoppedAt = index + 1;
            break;
          }
          const results = Array.isArray(answer.json) ? answer.json : null;
          if (answer.status < 200 || answer.status >= 300 || !results) {
            failed += targets.length;
            warnings.push(`${product}: ${spec.label}이 재고 변경을 받지 않았습니다(HTTP ${answer.status}).`);
            continue;
          }
          const ok = new Set(results.filter((entry) => entry && entry.success === true).map((entry) => String(entry.vendorItemId)));
          const okCount = targets.filter((item) => ok.has(String(item.vendorItemId))).length;
          sent += okCount;
          failed += targets.length - okCount;
          if (okCount < targets.length) {
            const reasons = [...new Set(results
              .filter((entry) => entry && entry.success !== true)
              .map((entry) => String(entry.message || "").trim())
              .filter(Boolean))].slice(0, 2);
            warnings.push(`${product}: ${targets.length - okCount}개 옵션을 바꾸지 않았습니다${reasons.length ? ` — ${reasons.join(" / ").slice(0, 160)}` : ""}.`);
          }
          // 다시 읽어 재고가 바뀐 옵션을 센다. 윙이 받은 뒤 조금 늦게 반영하면 한 번 더 본다.
          // 못 읽으면 확인하지 못한 것으로 둔다.
          const countChanged = (list) => {
            const changed = new Set(list
              .filter((item) => Number(item.stockQuantity) === quantity)
              .map((item) => String(item.vendorItemId)));
            return targets.filter((item) => changed.has(String(item.vendorItemId))).length;
          };
          let after = await readItems(product);
          let seen = after.items ? countChanged(after.items) : 0;
          if (after.items && seen < okCount) {
            await sleep(WING_RECHECK_MS);
            after = await readItems(product);
            if (after.items) seen = Math.max(seen, countChanged(after.items));
          }
          confirmed += seen;
          await sleep(PACE_MS);
        }
        return null;
      }, { show: shown });
      if (halted) return halted;
      if (stoppedAt !== null) {
        const rest = products.slice(stoppedAt);
        failed += rest.reduce((sum, product) => sum + (wantedOf(product)?.size || 1), 0);
        warnings.push(`${spec.label}이 요청을 잠시 막았습니다(HTTP 429). 상품 ${rest.length + blockedOnSend}개는 보내지 못했습니다 — 몇 분 뒤 다시 보내세요.`);
      }
      return {
        success: true,
        // 이미 원하는 재고인 옵션은 보낼 것이 없었을 뿐 끝난 일이다.
        sent: sent + already,
        failed,
        confirmed: confirmed + already,
        // 문장은 웹이 만든다 — 여러 번 나눠 보내면 합쳐서 한 줄로 말해야 한다.
        already,
        rocket,
        requestOnly: false,
        warnings,
        ...(stoppedAt !== null ? { stopped: "rate_limited" } : {}),
      };
    }

    async function postForm(origin, action, pairs, encoding) {
      const params = new URLSearchParams();
      for (const [name, value] of pairs) params.append(name, value);
      const response = await fetchApi(`${origin}${action}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": `application/x-www-form-urlencoded${encoding ? `; charset=${encoding}` : ""}`,
        },
        body: params.toString(),
      });
      return readAnswer(response.status, await response.text().catch(() => ""));
    }

    /**
     * 한 몰에 품절(또는 해제)을 보낸다.
     *
     * 돌려주는 것은 개수와 상품코드뿐이다. 사람 이름도 주문번호도 담지 않는다.
     */
    async function send(msg) {
      const mallKey = String(msg?.mallKey || "");
      if (PENDING[mallKey]) return { success: false, error: PENDING[mallKey] };
      const spec = SPECS[mallKey];
      if (!spec) return { success: false, error: `품절 경로를 아는 몰이 아닙니다: ${mallKey || "(없음)"}` };

      const codes = [...new Set((Array.isArray(msg?.codes) ? msg.codes : [])
        .map((code) => String(code || "").trim()).filter(Boolean))];
      if (codes.length === 0) return { success: false, error: "품절로 보낼 상품코드가 없습니다." };
      const resume = msg?.resume === true;

      // 쿠팡 윙은 윙 화면 하나를 열어 옵션 재고를 바꾼다(옵션 단위).
      if (spec.optionStock) {
        try {
          const options = msg?.options && typeof msg.options === "object" ? msg.options : null;
          return await sendByOptionStock(spec, codes, options, resume, msg?.show === true);
        } catch (error) {
          return { success: false, error: error?.message || String(error) };
        }
      }

      // 도매꾹은 화면을 열 필요가 없다. 목록 조회로 줄을 읽고 목록 수정 한 방으로 보낸다.
      if (spec.listEdit) {
        try {
          return await sendByListEdit(spec, codes, resume);
        } catch (error) {
          return { success: false, error: error?.message || String(error) };
        }
      }

      const sent = [];
      const failed = [];
      const warnings = [];

      // 온채널은 화면을 열 필요가 없다. 코드만으로 한 번에 보낸다.
      if (spec.post) {
        const body = resume ? spec.post.resumeBody(codes) : spec.post.body(codes);
        const answer = await postForm(spec.origin, spec.post.path, Object.entries(body));
        if (answer.accepted) sent.push(...codes);
        else failed.push(...codes);
        if (spec.requestOnly) {
          warnings.push(`${spec.label}은 관리자 승인을 거칩니다 — 보낸 것이 곧 반영은 아닙니다.`);
        }
        return {
          success: true,
          sent: sent.length,
          failed: failed.length,
          requestOnly: Boolean(spec.requestOnly),
          warnings,
        };
      }

      const targets = spec.perCode ? codes.map((code) => [code]) : [codes];
      let tabId = null;
      try {
        for (const group of targets) {
          const url = `${spec.origin}${spec.listPath(group[0])}`;
          if (tabId === null) {
            const tab = await interactiveTabs.createTab({ url, reason: tabReason });
            tabId = tab.id;
          } else {
            await chromeApi.tabs.update(tabId, { url });
          }
          const waited = await waitForTabComplete(tabId).catch(() => undefined);
          await sleep(waited ? 900 : 2200);

          const injected = await chromeApi.scripting.executeScript({
            target: { tabId },
            func: collectFormOnPage,
            args: [{
              formName: spec.form,
              set: resume ? spec.resumeSet || [] : spec.set || [],
              hidden: (resume ? spec.resumeHidden : spec.hidden) || {},
              rowKey: spec.rowKey,
              codes: group,
            }],
          });
          const outcome = (injected || []).map((entry) => entry?.result).find(Boolean);
          if (!outcome?.ok) {
            failed.push(...group);
            if (outcome?.error) warnings.push(`${group[0]}: ${outcome.error}`);
            continue;
          }

          const answer = await postForm(spec.origin, spec.action, outcome.pairs, spec.encoding);
          if (answer.accepted) sent.push(...outcome.matched);
          else failed.push(...outcome.matched);
          await sleep(PACE_MS);
        }
      } finally {
        // 우리가 연 탭은 우리가 닫는다. 한 몰에 한 탭이고, 실패해도 닫는다.
        if (tabId !== null) await chromeApi.tabs.remove(tabId).catch(() => undefined);
      }

      const notFound = codes.filter((code) => !sent.includes(code) && !failed.includes(code));
      if (notFound.length > 0) {
        warnings.push(`${notFound.length}건은 그 몰 화면에 없었습니다.`);
      }
      return {
        success: true,
        sent: sent.length,
        failed: failed.length + notFound.length,
        requestOnly: false,
        warnings,
      };
    }

    /**
     * 쿠팡 윙 지금 재고를 **읽기만** 한다. 보내지 않는다. 등록현황 칸의 창이 "지금 품절인가"를 보여 줄 때 쓴다 —
     * 매트릭스의 상태는 어젯밤 가져온 판매상태(ON_SALE)라 품절(재고 0)을 모른다.
     *
     * 돌려주는 것은 상품코드 · 옵션코드 · 재고 수뿐이다.
     */
    async function readByOptionStock(spec, codes) {
      const products = [...new Set(codes)].filter((code) => /^\d{1,15}$/.test(code)).slice(0, READ_LIMIT);
      if (products.length === 0) return { success: false, error: `읽을 ${spec.label} 등록상품ID가 없습니다.` };
      const found = [];
      const missing = [];
      const halted = await withWingPage(spec, async ({ readItems }) => {
        for (let index = 0; index < products.length; index += 1) {
          if (index > 0) await sleep(WING_PRODUCT_PACE_MS);
          const read = await readItems(products[index]);
          if (!read.items) {
            if (read.loggedOut) {
              return { success: false, error: `${spec.label} 로그인이 풀렸습니다. 로그인한 뒤 다시 시도하세요.` };
            }
            if (read.rateLimited) {
              return { success: false, error: `${spec.label}이 요청을 잠시 막았습니다(HTTP 429). 몇 분 뒤 다시 확인하세요.` };
            }
            missing.push(products[index]);
            continue;
          }
          found.push({
            code: products[index],
            options: read.items.map((item) => ({
              optionCode: String(item.vendorItemId),
              stock: Number(item.stockQuantity),
              rocket: item.registrationType === "RFM",
            })),
          });
        }
        return null;
      });
      if (halted) return halted;
      return { success: true, products: found, missing };
    }

    /** 한 몰의 지금 재고를 읽는다(쿠팡 윙). 읽기만 한다. */
    async function read(msg) {
      const mallKey = String(msg?.mallKey || "");
      const spec = SPECS[mallKey];
      if (!spec?.optionStock) return { success: false, error: `지금 재고를 읽을 수 있는 몰이 아닙니다: ${mallKey || "(없음)"}` };
      const codes = (Array.isArray(msg?.codes) ? msg.codes : [])
        .map((code) => String(code || "").trim())
        .filter(Boolean);
      try {
        return await readByOptionStock(spec, codes);
      } catch (error) {
        return { success: false, error: error?.message || String(error) };
      }
    }

    return { send, read };
  }

  root.KidItemMallAvailabilitySend = {
    create,
    SPECS,
    PENDING,
    MALL_KEYS: Object.keys(SPECS),
    // 지금 재고를 읽을 수 있는 몰(옵션 재고로 품절을 보내는 몰).
    READ_MALL_KEYS: Object.keys(SPECS).filter((key) => Boolean(SPECS[key].optionStock)),
    SEND_TIMEOUT_MS,
  };
})(typeof self !== "undefined" ? self : globalThis);
