(function initializeMallAvailabilitySend(root) {
  "use strict";

  // 몰 품절 송신 — 키드키즈·꼬망세·온채널·아이스크림몰.
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
  };

  /** 이 몰은 아직 경로가 없다. 화면이 버튼을 세우지 않게 이름만 남긴다. */
  const PENDING = {
    "icecream-mall": "판매상태 일괄변경이 별도 창(goodsSaleStateModifyView.do)에서 저장돼 창 사이를 잇는 경로가 더 필요합니다.",
  };

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

  function create({ chrome: chromeApi, fetch: fetchApi, interactiveTabs, tabReason }) {
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

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    /** 몰이 뭐라고 답했는지. 본문은 남기지 않는다 — 길이와 신호만 본다. */
    function readAnswer(status, text) {
      const body = String(text || "");
      const failed = /로그인|login|오류|실패|error|권한/i.test(body.slice(0, 500));
      return { status, accepted: status >= 200 && status < 400 && !failed, failed };
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

    return { send };
  }

  root.KidItemMallAvailabilitySend = {
    create,
    SPECS,
    PENDING,
    MALL_KEYS: Object.keys(SPECS),
    SEND_TIMEOUT_MS,
  };
})(typeof self !== "undefined" ? self : globalThis);
