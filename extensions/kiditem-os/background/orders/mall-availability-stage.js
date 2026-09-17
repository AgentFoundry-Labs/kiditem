(function initializeMallAvailabilityStage(root) {
  "use strict";

  // 몰 품절 화면 대상 지목 — 키드키즈·아이스크림몰·꼬망세·온채널.
  //
  // ⚠️ **제출하지 않는다.** 이 액션이 하는 일은 딱 둘이다.
  //    1. 몰의 품절 화면을 열고
  //    2. 우리가 품절로 판정한 상품 줄을 골라 두고(몰이 상태 칸을 줄마다 갖고 있으면 그 값까지)
  //    마지막 버튼은 사람이 누른다. 품절은 되돌릴 수 있지만 **되돌리는 데 사람 손이 들고**,
  //    잘못 보낸 품절은 그동안 팔리지 않는다. 확장이 대신 눌러서 얻는 시간보다
  //    잘못 눌렀을 때 잃는 매출이 크다.
  //
  // 그래서 성공은 "보냈다"가 아니라 "골라 뒀다"(staged)다. 실제 반영은 사람이 누른 뒤
  // 몰을 다시 조회해야만 알 수 있고, 그건 이 액션이 아니라 몰 재조회가 답한다.

  const STAGE_TIMEOUT_MS = 60000;

  /**
   * 몰마다 다른 것 전부.
   *
   * `codeFrom` 은 그 몰이 상품코드를 어디에 두는지다. 우리가 가진 코드
   * (`ChannelListing.externalId`)와 **같은 값이어야** 줄을 짚을 수 있다 — 목록을
   * 가져올 때 쓴 것과 같은 코드다(`mall-admin-listings.js`).
   *
   * `rowInputs` 는 줄마다 따로 있는 상태 칸이다. 꼬망세만 갖고 있고, 나머지 몰은
   * 상태를 고르는 화면이 버튼 뒤(팝업·모달)에 있어서 사람이 거기서 고른다.
   *
   * `submit` 은 **사람이 누를** 버튼이다. 우리는 그게 화면에 있는지만 확인하고
   * 이름을 돌려준다. 없으면 실패다 — 골라 뒀는데 누를 것이 없으면 아무 일도 안 된다.
   */
  const SPECS = {
    kidkids: {
      label: "키드키즈",
      origin: "https://partner.kidkids.net",
      listPath: "/sales/goods_list_renewal.htm?pNum=1",
      checkbox: { selector: 'input[name="goods_code[]"]', codeFrom: "value" },
      rowInputs: [],
      submit: { text: "일시품절", hint: "고른 줄에 [일시품절] 을 누르면 재판매 여부(use_flag)가 N 으로 바뀝니다." },
      resumeHint: "해제는 같은 화면의 [재판매] 입니다. 재입고 예정일은 줄마다 따로 겁니다.",
    },
    "icecream-mall": {
      label: "아이스크림몰",
      origin: "https://po.i-screammall.co.kr",
      listPath: "/goods/goodsMgmt.goodsMgmtView.do",
      checkbox: { selector: 'input[type="checkbox"][name*="goodsNo"], td input[type="checkbox"]', codeFrom: "value" },
      rowInputs: [],
      submit: { text: "판매상태 일괄변경", hint: "누르면 고른 줄이 판매상태 팝업으로 넘어갑니다. 팝업에서 [품절] 을 고르세요." },
      resumeHint: "해제는 같은 팝업의 [판매중] 입니다 — 품절과 같은 셀렉트라 대칭입니다.",
    },
    kkomangse: {
      label: "꼬망세",
      origin: "https://nstore.edupre.co.kr",
      listPath: "/subAdmin/_product_mass.view.php?listmaxcount=100",
      checkbox: { selector: "input.js_ck[name^='chk_pcode[']", codeFrom: "dataPcode" },
      // 이 몰만 상태 칸이 줄에 그대로 있다. 다른 몰은 버튼 뒤에 있어서 못 채운다.
      //
      // ⚠️ 끄는 값이 '판매종료'(_view=N)뿐이고 '일시품절'이 없다. 판매종료로 내리면
      //    노출이 통째로 꺼져 되돌릴 때 새로 시작하는 것과 같아진다. 그래서 기본은
      //    재고량 0 이다 — 자동 재고관리(_stock_control=Y)에서 0 이면 품절로 선다.
      rowInputs: [
        { key: "stock", selector: 'input[name^="_stock["]', value: "0", label: "재고량" },
        { key: "stockControl", selector: 'input[name^="_stock_control["][value="Y"]', check: true, label: "재고관리 자동" },
      ],
      submit: { text: "입력값 전체저장", hint: "누르면 이 화면의 입력값이 통째로 저장됩니다." },
      resumeHint: "해제는 같은 화면에서 재고량을 되돌리는 것입니다. 판매종료(_view=N)는 쓰지 않습니다.",
    },
    onch: {
      label: "온채널",
      origin: "https://www.onch3.co.kr",
      listPath: "/products_management.php",
      // 온채널에는 줄을 여럿 고르는 칸이 없다. 줄마다 [판매설정] 버튼이 있고 그게
      // 모달을 연다. 그래서 이 몰은 한 번에 한 상품만 지목한다.
      rowButton: {
        selector: "[data-prd-code]",
        codeFrom: "dataPrdCode",
        opensDialog: true,
        dialogSelector: "#saleStatusModal",
      },
      // 모달이 열린 뒤에 고르는 값. 4 = 일시품절(되돌릴 수 있는 값).
      dialogInputs: [
        { key: "status", selector: "#saleStatusSelect", value: "4", label: "판매상태" },
      ],
      rowInputs: [],
      submit: { text: "확인", hint: "모달의 [확인] 을 누르면 관리자에게 **요청**이 갑니다 — 승인 전까지 반영이 아닙니다." },
      resumeHint: "해제는 같은 모달의 [재입고] 입니다.",
      stagesOne: true,
    },
  };

  /**
   * 화면에서 줄을 골라 두는 일. 몰 페이지 안에서 돈다.
   *
   * 이 함수는 **누르지 않는다**. 고르고(checked), 쓰고(value), 무엇을 눌러야 하는지
   * 이름만 돌려준다. `submit` 으로 넘어온 버튼은 찾기만 하고 건드리지 않는다.
   */
  function stageOnPage(payload) {
    const { checkbox, rowInputs, rowButton, dialogInputs, submit, codes, stagesOne } = payload;
    const wanted = new Set(codes);
    const seen = new Set();
    const result = { staged: [], missing: [], submitFound: false, dialogOpened: false };

    const codeOf = (element, how) => {
      if (how === "dataPcode") return element.getAttribute("data-pcode") || "";
      if (how === "dataPrdCode") return element.getAttribute("data-prd-code") || "";
      return element.value || "";
    };

    // 사람이 누를 버튼이 이 화면에 있는지. 없으면 골라 둬도 소용이 없다.
    const buttonText = String(submit.text || "");
    result.submitFound = [...document.querySelectorAll("a,button,input[type=button],input[type=submit]")]
      .some((el) => ((el.innerText || el.value || "").replace(/\s+/g, " ").trim()).includes(buttonText));

    if (rowButton) {
      // 온채널: 줄마다 버튼이고 모달이 상태 칸을 갖고 있다.
      const buttons = [...document.querySelectorAll(rowButton.selector)];
      for (const button of buttons) {
        const code = codeOf(button, rowButton.codeFrom);
        if (!wanted.has(code) || seen.has(code)) continue;
        seen.add(code);
        if (result.staged.length === 0 && rowButton.opensDialog) {
          // 모달을 여는 클릭이다 — 보내는 클릭이 아니다. 제출 버튼은 건드리지 않는다.
          button.click();
          result.dialogOpened = Boolean(document.querySelector(rowButton.dialogSelector));
        }
        result.staged.push(code);
        if (stagesOne) break;
      }
      if (result.dialogOpened) {
        for (const input of dialogInputs || []) {
          const field = document.querySelector(input.selector);
          if (!field) continue;
          field.value = input.value;
          field.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    } else {
      const boxes = [...document.querySelectorAll(checkbox.selector)];
      for (const box of boxes) {
        const code = codeOf(box, checkbox.codeFrom);
        if (!wanted.has(code) || seen.has(code)) continue;
        seen.add(code);
        box.checked = true;
        box.dispatchEvent(new Event("change", { bubbles: true }));
        // 줄에 상태 칸이 있는 몰(꼬망세)은 그 줄 안에서만 찾는다. 화면 전체에서 찾으면
        // 고르지 않은 줄까지 고쳐 놓고 사람이 전체저장을 누르는 순간 같이 나간다.
        const row = box.closest("tr") || box.parentElement;
        for (const input of rowInputs || []) {
          const field = row && row.querySelector(input.selector);
          if (!field) continue;
          if (input.check) {
            field.checked = true;
            field.dispatchEvent(new Event("change", { bubbles: true }));
          } else {
            field.value = input.value;
            field.dispatchEvent(new Event("input", { bubbles: true }));
            field.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
        result.staged.push(code);
      }
    }

    for (const code of wanted) if (!seen.has(code)) result.missing.push(code);
    return result;
  }

  function create({ chrome: chromeApi, interactiveTabs, tabReason }) {
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
        const onUpdated = (updatedTabId, changeInfo, updatedTab) => {
          if (updatedTabId === tabId && changeInfo.status === "complete") finish(updatedTab || {});
        };
        const timer = setTimeout(() => finish(null), timeoutMs);
        chromeApi.tabs.onUpdated.addListener(onUpdated);
      });
    }

    /**
     * 한 몰의 품절 화면을 열고 대상을 골라 둔다.
     *
     * 돌려주는 것은 개수와 상품코드뿐이다. 사람 이름도 주문번호도 담지 않는다 —
     * 이 화면에는 그런 값이 없고, 있어도 우리 쪽으로 가져올 이유가 없다.
     */
    async function stage(msg) {
      const mallKey = String(msg?.mallKey || "");
      const spec = SPECS[mallKey];
      if (!spec) {
        return { success: false, error: `품절 화면을 아는 몰이 아닙니다: ${mallKey || "(없음)"}` };
      }
      const codes = [...new Set((Array.isArray(msg?.codes) ? msg.codes : [])
        .map((code) => String(code || "").trim())
        .filter(Boolean))];
      if (codes.length === 0) {
        return { success: false, error: "품절로 지목할 상품코드가 없습니다." };
      }

      const url = `${spec.origin}${spec.listPath}`;
      const tab = await interactiveTabs.createTab({ url, reason: tabReason });
      const waited = await waitForTabComplete(tab.id).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, waited ? 1200 : 2500));

      const injected = await chromeApi.scripting.executeScript({
        target: { tabId: tab.id },
        func: stageOnPage,
        args: [{
          checkbox: spec.checkbox || null,
          rowInputs: spec.rowInputs || [],
          rowButton: spec.rowButton || null,
          dialogInputs: spec.dialogInputs || [],
          submit: spec.submit,
          codes,
          stagesOne: Boolean(spec.stagesOne),
        }],
      });
      const outcome = (injected || []).map((entry) => entry?.result).find(Boolean);
      if (!outcome) {
        return { success: false, error: `${spec.label} 품절 화면을 읽지 못했습니다.`, tabId: tab.id };
      }

      const warnings = [];
      if (!outcome.submitFound) {
        warnings.push(`이 화면에서 [${spec.submit.text}] 버튼을 찾지 못했습니다. 화면이 바뀌었을 수 있습니다.`);
      }
      if (outcome.missing.length > 0) {
        warnings.push(`${outcome.missing.length}건은 이 화면에 없습니다. 검색 조건이나 페이지 수를 확인하세요.`);
      }
      if (spec.stagesOne && codes.length > 1) {
        warnings.push(`${spec.label}은 한 번에 한 상품만 지목합니다(줄마다 버튼이라 일괄 선택 칸이 없습니다). 남은 ${codes.length - 1}건은 다시 실행하세요.`);
      }
      if (spec.rowButton && !outcome.dialogOpened) {
        warnings.push("판매설정 창이 열리지 않았습니다. 화면에서 직접 열어 주세요.");
      }

      return {
        success: true,
        // ⚠️ staged 는 "골라 뒀다"다. 보냈다도, 반영됐다도 아니다.
        staged: outcome.staged.length,
        missing: outcome.missing.length,
        submitLabel: spec.submit.text,
        submitHint: spec.submit.hint,
        resumeHint: spec.resumeHint,
        tabId: tab.id,
        warnings,
      };
    }

    return { stage };
  }

  root.KidItemMallAvailabilityStage = {
    create,
    SPECS,
    MALL_KEYS: Object.keys(SPECS),
  };
})(typeof self !== "undefined" ? self : globalThis);
