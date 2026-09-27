// 롯데ON 판매자센터 상품등록 폼 채우기(MAIN world, KID-256 — 옛 `background/orders/mall-form-register.js` `fillLotteonProductForm` 이식).
// 확장 런타임 몰 쓰기(`extensions/src/sites/lotte-on/registration.ts`)가 `content/page-call/form-fill.js`(쓰기 탭 도우미) 뒤에 넣고
// `lotteon.fill`을 부른다. 인자는 명세·값 묶음뿐이다. 저장·임시저장·[등록]은 부르지 않는다(ADR-0019 — 몰 명세에 검증된 누르기가 없다).
(function installFillLotteonProductForm() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});

  /**
   * 롯데ON 판매자센터 상품등록(WebSquare) 채우기. `index_SO.wsp` 에 주입된다.
   *
   * 화면 칸은 데이터(`dat_*`)에 묶여 있고, 섹션(`wfm_*`)마다 사람이 누를 때 도는 함수가 있다. 그 함수를
   * 사람 순서대로 부른다. 순서가 중요하다 — 표준카테고리를 고르면 단품 줄·판매유형이 새로 만들어지고,
   * 고시 상품군을 고르면 제조자 칸이 비워지고, 거래처·분류 조회가 배송비 정책을 다시 고른다.
   *
   * 화면 알림(`com.alert`/`com.confirm`)은 DOM 대화상자이고 섹션마다 `com` 이 따로 있다. 채우는 동안
   * 전부 가로채 **기록만** 한다 — 알림 콜백 중에는 탭을 닫거나 등록 첫 화면으로 보내는 것이 있다.
   * `저장`(`scwin.product.regist`)·`임시저장` 은 부르지 않는다.
   */
  function fillLotteonProductForm(payload) {
    return (async () => {
      const steps = [];
      const warnings = [];
      const said = [];
      const form = payload.form;
      const stepWait = payload.stepWaitMs || 20000;
      // 화면이 늦게 끝내는 조회를 기다리는 짧은 간격. 섹션 대기보다 길지 않게 둔다.
      const settle = Math.min(1500, stepWait);
      const PATH = "/ui/product/registration/productInsert.xml";
      // 몰이 띄우는 알림·확인 창은 알림 창 가드(쓰기 탭)가 받는다 — 확인창은 거절하고 문장은 여기(`said`)로 온다.
      const releaseDialogs = window.__kiditemWriteDialogs.listen((message) => said.push(String(message)));

      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitFor = async (probe, timeoutMs, stepMs = 250) => {
        const until = Date.now() + timeoutMs;
        for (;;) {
          let found = null;
          try { found = await probe(); } catch { found = null; }
          if (found) return found;
          if (Date.now() >= until) return null;
          await sleep(stepMs);
        }
      };
      const clean = (message) => String(message || "").replace(/\s+/g, " ").trim();
      const tidy = (message) => clean(message).replace(/[.\s]+$/, "");
      const toBlob = (dataUrl) => {
        const [head, encoded] = String(dataUrl).split(",");
        const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
        const binary = atob(encoded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
      };

      // 섹션마다 따로 있는 `com` 의 알림을 기록만 하게 바꾼다. 끝나면 되돌린다.
      const patched = [];
      const patchCom = (target) => {
        if (!target || typeof target.alert !== "function" || patched.some((entry) => entry.target === target)) return;
        patched.push({ target, alert: target.alert, confirm: target.confirm });
        target.alert = (message) => { said.push(clean(message)); return null; };
        target.confirm = (message) => { said.push(clean(message)); return null; };
      };
      // 조회 오류 알림처럼 `com.alert` 를 거치지 않는 대화상자는 치운다. 단추가 여럿인 확인창은 글자가 취소·닫기·아니오인 단추로만
      // 닫는다 — 강조 클래스가 없는 첫 단추를 누르면 그것이 '저장'·'확인'일 수 있다(KID-237). 그런 단추가 없으면 누르지 않고
      // 사람에게 남긴다(창도 그대로 둔다).
      const CANCEL_LABEL = /^(?:취소|닫기|아니오|아니요)$/;
      const leftDialogs = new Set();
      const sweepDialogs = () => {
        for (const node of [...document.querySelectorAll(".dialog-block, .dialog-block-for-tab")]) {
          if (leftDialogs.has(node)) continue;
          const content = node.querySelector(".dialog-block-content") || node;
          const message = clean(content.innerText || content.textContent);
          if (message) said.push(message.slice(0, 200));
          const buttons = [...node.querySelectorAll(".dialog-block-buttons input[type=button]")];
          if (buttons.length > 1) {
            const cancel = buttons.find((button) => CANCEL_LABEL.test(clean(button.value || button.textContent)));
            if (!cancel) {
              leftDialogs.add(node);
              warnings.push(`롯데ON 확인 창을 닫지 않았습니다 — 열린 탭에서 확인하세요${message ? `: ${message.slice(0, 80)}` : ""}.`);
              continue;
            }
            cancel.click();
          }
          node.parentNode?.removeChild(node);
        }
      };
      // WebSquare 는 그릴 때 DOM 을 많이 바꾼다. 바뀔 때마다 훑지 않고 잠깐 모아서 한 번 훑는다.
      let sweepQueued = false;
      const observer = new MutationObserver(() => {
        if (sweepQueued) return;
        sweepQueued = true;
        setTimeout(() => { sweepQueued = false; sweepDialogs(); }, 150);
      });

      try {
        // 0) 판매자센터 껍데기. 로그아웃이면 로그인 화면으로 넘어간다.
        const shell = await waitFor(() => {
          if (/login/i.test(location.pathname)
            || [...document.querySelectorAll('input[type="password"]')].some((el) => el.getClientRects().length > 0)) return "login";
          return window.com && typeof window.com.openTab === "function" && window.gcm?.user?.getTrNo?.() ? "shell" : null;
        }, payload.formWaitMs || 60000, 500);
        if (shell !== "shell") {
          return { ok: false, noForm: true, error: "롯데ON 판매자센터 화면을 찾지 못했습니다." };
        }
        observer.observe(document.body, { childList: true, subtree: true });
        sweepDialogs();
        patchCom(window.com);

        // 1) 상품등록 탭. 새로 여는 탭 번호를 우리가 정해 두면 그 탭의 화면을 정확히 집는다.
        const tac = window.com.getHighestOpener(window).$p.getComponentById("tac_layout");
        if (tac.getTabCount() >= 10) {
          return { ok: false, error: "롯데ON 화면 탭이 10개라 상품등록을 열 수 없습니다. 탭을 닫고 다시 누르세요." };
        }
        const tabId = `kiditemPI${Date.now()}`;
        window.com.openTab("상품등록", PATH, { initType: "category", menuName: "상품등록", jsonData: {} }, tabId);
        const pi = await waitFor(() => {
          const scope = tac.getWindow(tabId);
          return scope && scope.scwin && scope.scwin.product && scope.wfm_title && scope.wfm_delivery ? scope : null;
        }, stepWait, 300);
        if (!pi) return { ok: false, error: "롯데ON 상품등록 화면을 열지 못했습니다." };
        const win = (name) => pi[name].getWindow();

        // 공통코드 → 1.5초 뒤 초기화 → 거래처 조회 → 배송 정보 조회까지 끝나야 칸이 안 뒤집힌다.
        const initialized = () => {
          const scwin = pi.scwin;
          const delivery = win("wfm_delivery");
          return scwin.isPause === true && scwin.product.tp === "category" && scwin.product.data.pdTypCd === "GNRL_GNRL"
            && scwin.traderData?.trNo && pi.dat_basicInfo.get("trNo")
            && win("wfm_buyService").rad_maxPurLmtTypCd.getValue() === "N"
            && (delivery.scwin.dvCstPolList || []).length > 0 && (delivery.scwin.owhpList || []).length > 0
            && delivery.sbx_hdcCd.getValue() !== "";
        };
        const settled = await waitFor(async () => {
          if (!initialized()) return false;
          await sleep(Math.min(1000, settle));
          return initialized();
        }, payload.formWaitMs || 60000, 500);
        patchCom(pi.com);
        for (const name of Object.keys(pi).filter((key) => /^wfm_/.test(key) && typeof pi[key]?.getWindow === "function")) {
          try { patchCom(win(name).com); } catch { /* 아직 안 붙은 섹션 */ }
        }
        if (!settled) {
          if (!pi.scwin.traderData?.trNo) return { ok: false, error: "롯데ON 상품등록 화면이 거래처 정보를 불러오지 못했습니다." };
          warnings.push("롯데ON 화면 초기화가 늦어 배송 정보가 덜 불러와졌을 수 있습니다. 배송 칸을 확인하세요.");
        }

        // 2) 표준카테고리. 화면의 [선택하기] 가 끝에 부르는 함수를 부른다. 연관정보 콜백이 전시카테고리·수수료·
        //    판매유형·단품 줄·속성·인증 대상을 한꺼번에 채운다.
        const scwin = pi.scwin;
        const categoryWin = win("wfm_category");
        const basic = pi.dat_basicInfo;
        const categoryRun = { callback: false, error: null };
        const originalCallback = categoryWin.scwin.categoryCallback;
        categoryWin.scwin.categoryCallback = function (...args) {
          categoryRun.callback = true;
          try { return originalCallback.apply(this, args); } catch (error) { categoryRun.error = error; throw error; }
        };
        let special = false;
        try {
          special = Boolean(categoryWin.scwin.getStdMappingInfo(form.category))
            || [categoryWin.scwin.rntlCatYn, categoryWin.scwin.ecpnTraderYn, categoryWin.scwin.mblTraderYn,
              categoryWin.scwin.pprTraderYn, categoryWin.scwin.zeroPdTypCdCategoryYn].includes("Y");
        } catch { special = false; }
        const saidBeforeCategory = said.length;
        if (!special) scwin.select_standard_category(form.category);
        const chosen = special ? null : await waitFor(() => categoryRun.error || (categoryRun.callback
          && basic.get("scatNo") === form.category && basic.get("scatNm") && basic.get("dcatNoLst")
          && String(basic.get("slfee") ?? "") !== "" && pi.dat_saleOptionGrid.getRowCount() > 0), stepWait, 250);
        categoryWin.scwin.categoryCallback = originalCallback;
        if (!chosen || categoryRun.error || basic.get("scatNo") !== form.category) {
          const reason = special ? "해외·렌탈·상품권 전용 분류입니다"
            : tidy(said.slice(saidBeforeCategory).pop() || categoryRun.error?.message || "화면에 반영되지 않았습니다");
          return {
            ok: false,
            steps,
            warnings,
            error: `롯데ON 표준카테고리 ${form.category} 를 고르지 못했습니다(${reason}). 열린 탭에서 카테고리를 고르세요.`,
          };
        }
        steps.push(`표준카테고리 ${basic.get("scatNm")} · 수수료 ${basic.get("slfee")}%`);

        // 3) 판매자상품명. 전시상품명도 같은 값으로 두고 단품 줄에 따라 적는다.
        const titleWin = win("wfm_title");
        titleWin.dat_productInfo.set("spdNm", form.productName);
        titleWin.dat_productInfo.set("pdNm", form.productName);
        titleWin.scwin.ibx_pdNm_onchange();
        try { titleWin.tbx_spdNmLength.setValue(window.WebSquare.util.getStringByteSize(form.productName)); } catch { /* 글자 수 표시만 */ }
        if (pi.dat_productInfo.get("spdNm") === form.productName) steps.push("판매자상품명");
        else warnings.push("판매자상품명을 넣지 못했습니다. 화면에서 확인하세요.");
        const keywordRule = String(scwin.pdNmEstlKwdCnts || "");
        if (keywordRule && !keywordRule.split("|").some((keyword) => keyword && form.productName.includes(keyword))) {
          warnings.push(`이 카테고리는 상품명에 ${keywordRule.split("|").join(", ")} 중 하나가 들어가야 저장됩니다.`);
        }

        // 4) 판매옵션 — 선택형 옵션 없이 단품 한 줄. 재고관리를 바꾸면 재고가 초기화되므로 가격·재고보다 먼저.
        const optionWin = win("wfm_option");
        const grid = optionWin.dat_saleOptionGrid;
        if (optionWin.rad_slOptYn.getValue() !== "N" || grid.getRowCount() !== 1) {
          optionWin.rad_slOptYn.setValue("N");
          optionWin.scwin.rad_slOptYn_onviewchange();
        }
        optionWin.rad_stkMgtYn.setValue(form.stockManaged ? "Y" : "N");
        optionWin.scwin.rad_stkMgtYn_onchange.call(optionWin.rad_stkMgtYn);
        grid.setCellData(0, "slPrc", form.salePrice);
        if (form.stockManaged) grid.setCellData(0, "stkQty", form.stock);
        const row = grid.getRowJSON(0) || {};
        if (Number(row.slPrc) === form.salePrice && String(row.stkQty ?? "") !== "") {
          steps.push(`판매가 ${form.salePrice} · 재고 ${form.stockManaged ? form.stock : "관리 안 함"}`);
        } else {
          warnings.push("판매가·재고를 넣지 못했습니다. 판매옵션 목록을 확인하세요.");
        }

        // 5) 상품정보제공고시. 상품군을 고르면 항목이 새로 그려지면서 칸이 비워진다 — 그 뒤에 채운다.
        const notice = form.notice;
        const articleWin = win("wfm_article");
        if (notice.groupCode) {
          if (articleWin.rad_pdItmsRegWay.getValue() !== "NEW") {
            articleWin.rad_pdItmsRegWay.setValue("NEW");
            articleWin.scwin.rad_pdItmsRegWay_onchange();
          }
          const noticeRun = { fired: false, loaded: false };
          const originalDisplay = articleWin.scwin.setItemDisplay;
          const originalDisplayed = articleWin.scwin.setItemDisplay1;
          articleWin.scwin.setItemDisplay = function (...args) { noticeRun.fired = true; return originalDisplay.apply(this, args); };
          articleWin.scwin.setItemDisplay1 = function (...args) {
            const result = originalDisplayed.apply(this, args);
            noticeRun.loaded = true;
            return result;
          };
          articleWin.sbx_pdItmsCd.setValue(notice.groupCode);
          if (!noticeRun.fired) articleWin.scwin.sbx_pdItmsCd_onchange.call(articleWin.sbx_pdItmsCd);
          const loaded = await waitFor(() => noticeRun.loaded, stepWait, 200);
          articleWin.scwin.setItemDisplay = originalDisplay;
          articleWin.scwin.setItemDisplay1 = originalDisplayed;
          if (loaded) {
            const exclude = "group trigger textbox output calendar image span anchor pageInherit wframe itemTable generator";
            for (const ref of articleWin.data_pdArtlCdList.getFilteredColData("artlRefcNo")) {
              const group = articleWin.$p.getComponentById(`grp_item${ref}`);
              if (!group) continue;
              for (const input of window.WebSquare.util.getChildren(group, { excludePlugin: exclude, recursive: true })) {
                let itemCode = null;
                try { itemCode = input.getUserData("userData1"); } catch { itemCode = null; }
                if (typeof itemCode !== "string" || !itemCode) continue;
                if (itemCode === "1420") {
                  articleWin.sbx_oplcTypCd3.setValue(form.origin.typeCode);
                  articleWin.scwin.sbx_oplcTypCd3_onviewchange();
                  input.setValue(form.origin.code);
                  articleWin.scwin.acb_oplcCd3_onviewchange();
                } else if (Object.prototype.hasOwnProperty.call(notice.values, itemCode)) {
                  input.setValue(notice.values[itemCode]);
                }
              }
            }
            const filled = articleWin.scwin.getPdItmsArtlInfo() || [];
            const empty = filled.filter((item) => !String(item.pdArtlCnts || "").replace(/\/\//g, "").trim()
              || /\/\/$/.test(String(item.pdArtlCnts || "")) || /^\/\//.test(String(item.pdArtlCnts || "")))
              .map((item) => item.pdArtlCd);
            if (filled.length > 0 && empty.length === 0) steps.push(`정보고시 ${notice.groupCode}`);
            else warnings.push(`정보고시 항목 ${empty.join(", ") || "전부"} 이(가) 비었습니다. 화면에서 채우세요.`);
          } else {
            warnings.push(`정보고시 상품군 ${notice.groupCode} 항목을 불러오지 못했습니다. 화면에서 고르세요.`);
          }
        }

        // 6) 상품주요정보 — 원산지·제조사·모델명. 제조사 칸은 고시 제조자와 같은 데이터라 고시 뒤에 넣는다.
        const infoWin = win("wfm_info");
        if (form.origin.code !== "KR") {
          infoWin.dat_productInfo.set("oplcCd", form.origin.code);
          infoWin.scwin.acb_oplcCd_onchange();
        }
        if (form.maker) infoWin.ibx_mfcrNm.setValue(form.maker);
        if (form.modelNo) win("wfm_etc").ibx_mdlNo.setValue(form.modelNo);
        const product = pi.dat_productInfo;
        if (product.get("oplcCd") === form.origin.code && (!form.maker || product.get("mfcrNm") === form.maker)) {
          steps.push(`원산지 ${form.origin.code}${form.maker ? ` · 제조사 ${form.maker}` : ""}${form.modelNo ? ` · 모델명 ${form.modelNo}` : ""}`);
        } else {
          warnings.push("원산지·제조사를 넣지 못했습니다. 상품주요정보를 확인하세요.");
        }

        // 7) 인증정보. 분류가 KC 대상이면 화면이 '설정함'으로 바꾼다 — 인증번호·기관은 사람이 넣는다.
        const safetyWin = win("wfm_saftyAthn");
        const certRadios = ["rad_isSftyAthn", "rad_isChildSftyAthn", "rad_isChemSftyAthn"];
        if (certRadios.some((radio) => safetyWin[radio]?.getValue() === "Y")) {
          warnings.push("이 카테고리는 KC 인증정보가 필요합니다. 인증정보 칸에 인증 구분·번호를 직접 넣으세요.");
        }

        // 8) 상세설명 · A/S. 상세 이미지는 편집기 안내("이미지를 내용입력영역에 드래그&드롭")대로 편집기의 사진
        //    업로드로 넣는다 — 끌어다 놓을 때 CKEditor `uploadimage` 가 쓰는 `uploadRepository` 를 그대로 쓴다.
        //    롯데ON 은 올린 사진을 본문에 넣을 이미지 데이터로 돌려준다(실측 `/websquare/imageupload.wq` →
        //    `{uploaded:1, url:"data:image/jpeg;base64,…"}`). 화면이 쓰는 변경 함수로 '설정함' 표시를 맞춘다.
        const descWin = win("wfm_desc");
        const writeDetail = (html, marker) => waitFor(() => {
          descWin.edt_dscrp.setHTML(html);
          descWin.scwin.edt_dscrp_onchange();
          return String(descWin.edt_dscrp.getHTML() || "").includes(marker);
        }, Math.min(5000, stepWait), 500);
        let detailWritten = false;
        if (payload.detailImage?.dataUrl) {
          try {
            const editorId = String(descWin.edt_dscrp.id || "");
            const instances = window.CKEDITOR?.instances || {};
            const editor = instances[`${editorId}_`]
              || Object.values(instances).find((instance) => editorId && String(instance.name).startsWith(editorId));
            if (!editor?.uploadRepository) throw new Error("상세설명 편집기를 찾지 못했습니다");
            const blob = toBlob(payload.detailImage.dataUrl);
            const extension = /png/i.test(blob.type) ? "png" : "jpg";
            const name = /\.(jpe?g|png)$/i.test(String(payload.detailImage.fileName || "")) ? String(payload.detailImage.fileName) : `detail.${extension}`;
            const loader = editor.uploadRepository.create(new File([blob], name, { type: blob.type }));
            loader.loadAndUpload(window.CKEDITOR.fileTools.getUploadUrl(editor.config, "image"));
            const finished = await waitFor(() => (["uploaded", "error", "abort"].includes(loader.status) ? loader.status : null), stepWait * 3, 250);
            if (finished !== "uploaded" || !loader.url) {
              throw new Error(loader.message || (finished ? "편집기가 사진을 받지 않았습니다" : "업로드가 끝나지 않았습니다"));
            }
            const alt = form.productName.replace(/["<>]/g, "");
            detailWritten = await writeDetail(`<center><img src="${loader.url}" alt="${alt}"></center>`, String(loader.url).slice(0, 64));
            if (detailWritten) steps.push("상세설명 이미지(편집기 업로드)");
          } catch (error) {
            warnings.push(`상세 이미지를 편집기에 올리지 못했습니다: ${tidy(error?.message || error)}.`);
          }
        }
        if (!detailWritten && payload.detailHtml) {
          const detailHtml = String(payload.detailHtml);
          detailWritten = await writeDetail(detailHtml, (detailHtml.match(/src="([^"]+)"/) || [])[1] || "<img");
          if (detailWritten) steps.push("상세설명");
        }
        if (!detailWritten) warnings.push("상세설명을 넣지 못했습니다. 상세 이미지를 편집기에 끌어다 놓으세요.");
        if (form.asText) {
          const asWin = win("wfm_as");
          asWin.edt_asCnts.setHTML(form.asText);
          asWin.scwin.edt_asCnts_onchange();
          if (String(asWin.edt_asCnts.getHTML() || "").includes(form.asText.slice(0, 8))) steps.push("A/S 안내");
        }

        // 9) 구매수량 제한. 화면 초기화의 0.5초 타이머가 '사용안함'으로 되돌리므로 초기화가 끝난 뒤에 넣는다.
        if (form.purchase.maxQty > 0) {
          const buyWin = win("wfm_buyService");
          buyWin.rad_maxPurLmtTypCd.setValue("PERIOD");
          buyWin.scwin.rad_maxPurLmtTypCd_onchange();
          buyWin.ibx_maxPurQty.setValue(form.purchase.maxQty);
          buyWin.ibx_maxPurLmtPrd.setValue(form.purchase.periodDays);
          const option = pi.dat_saleOption;
          if (option.get("maxPurLmtTypCd") === "PERIOD" && Number(option.get("maxPurQty")) === form.purchase.maxQty) {
            steps.push(`최대구매 ${form.purchase.periodDays}일 ${form.purchase.maxQty}개`);
          } else {
            warnings.push("최대 구매수량을 넣지 못했습니다. 구매/서비스조건을 확인하세요.");
          }
        }

        // 10) 판매자 내부관리번호.
        if (form.sellerCode) {
          const manageWin = win("wfm_manageNo");
          manageWin.ibx_epdNo.setValue(form.sellerCode);
          try { manageWin.scwin.setTitle(form.sellerCode); } catch { /* 요약 표시만 */ }
          if (pi.dat_manageNo.get("epdNo") === form.sellerCode) steps.push(`판매자내부상품번호 ${form.sellerCode}`);
        }

        // 11) 배송 · 반품. 분류·거래처 조회가 정책을 다시 고르므로 마지막에 넣고, 잠시 뒤 다시 본다.
        const deliveryWin = win("wfm_delivery");
        const output = deliveryWin.dat_output;
        const returns = deliveryWin.dat_returnInfo;
        const delivery = form.delivery;
        const pick = (component, wanted) => {
          if (!wanted || !component) return true;
          if (component.getValue() !== wanted) component.setValue(wanted);
          return component.getValue() === wanted;
        };
        const applyDelivery = () => {
          if (delivery.sameDay && output.get("sndBgtNday") !== 0 && output.get("sndBgtNday") !== "0") deliveryWin.scwin.todaySndBgt();
          const missed = [];
          if (!pick(deliveryWin.sbx_nldySndCloseTm, delivery.closeTime)) missed.push("발송마감시간");
          if (!pick(deliveryWin.rad_satSndPsbYn, delivery.saturday)) missed.push("토요일발송");
          if (!pick(deliveryWin.sbx_dvCstPolNo, delivery.costPolicy)) missed.push(`배송비 정책 ${delivery.costPolicy}`);
          if (!pick(deliveryWin.sbx_adtnDvCstPolNo, delivery.extraCostPolicy)) missed.push(`추가배송비 정책 ${delivery.extraCostPolicy}`);
          if (!pick(deliveryWin.sbx_owhpNo, delivery.shipPlace)) missed.push(`출고지 ${delivery.shipPlace}`);
          if (!pick(deliveryWin.sbx_rtrpNo, delivery.returnPlace)) missed.push(`반품지 ${delivery.returnPlace}`);
          if (!pick(deliveryWin.sbx_hdcCd, delivery.courier)) missed.push("택배사");
          if (!pick(deliveryWin.sbx_rtngHdcCd, delivery.returnCourier)) missed.push("반품 택배사");
          if (delivery.returnPlace && deliveryWin.sbx_rtrpNo.getValue() === delivery.returnPlace) returns.set("rtrpNo", delivery.returnPlace);
          if (delivery.retrieveType && deliveryWin.rad_rtrvTypCd) {
            deliveryWin.rad_rtrvTypCd.setValue(delivery.retrieveType);
            if (returns.get("rtrvTypCd") !== delivery.retrieveType) returns.set("rtrvTypCd", delivery.retrieveType);
          }
          return missed;
        };
        const deliverySnapshot = () => JSON.stringify([output.get("dvCstPolNo"), output.get("adtnDvCstPolNo"), output.get("owhpNo"),
          returns.get("rtrpNo"), output.get("hdcCd"), returns.get("rtngHdcCd"), output.get("sndBgtNday"),
          deliveryWin.sbx_nldySndCloseTm.getValue(), returns.get("rtrvTypCd")]);
        applyDelivery();
        const firstPass = deliverySnapshot();
        await sleep(settle);
        if (deliverySnapshot() !== firstPass) {
          // 늦게 끝난 조회가 고른 값을 되돌렸다. 한 번 더 넣고 가라앉기를 본다.
          applyDelivery();
          await sleep(settle);
        }
        const missedDelivery = applyDelivery();
        if (missedDelivery.length === 0) {
          steps.push(`배송 ${delivery.sameDay ? "오늘발송" : "일반발송"} · 배송비 정책 ${output.get("dvCstPolNo")} · 출고/반품지 ${output.get("owhpNo")}`);
        } else {
          warnings.push(`배송 정보 ${missedDelivery.join(", ")} 을(를) 고르지 못했습니다. 목록에 없으면 화면에서 고르세요.`);
        }

        // 12) 상품 이미지. 단품이미지 창이 쓰는 업로드(티켓 → 파일)로 올리고, 창이 닫힐 때 부르는 콜백을 부른다.
        const images = (payload.images || []).filter((image) => image && image.dataUrl).slice(0, payload.maxImages || 10);
        if (images.length > 0) {
          const apiBase = String(window.gcm.API_GW || "https://soapi.lotteon.com");
          // ⚠️ `Accept` 가 없으면 파일 업로드가 XML(`<FineUploaderResponseModel>`)로 답한다(실측 2026-09-14).
          const headers = () => {
            const token = window.gcm.getAuthToken?.();
            return {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              "X-Timezone": window.gcm.getTimezone?.() || "GMT+09:00",
              Accept: "application/json",
            };
          };
          /** JSON 이 기본이고, 그래도 XML 로 오면 같은 칸을 읽는다. */
          const readUploadResult = async (response) => {
            const text = await response.text().catch(() => "");
            try { return JSON.parse(text); } catch { /* XML 답 */ }
            const tag = (name) => (text.match(new RegExp(`<${name}>([^<]*)</${name}>`)) || [])[1];
            if (!tag("success")) return {};
            return {
              success: tag("success") === "true",
              message: tag("message"),
              meta: { fileId: tag("fileId"), fileName: tag("fileName"), size: Number(tag("size")) || 0 },
            };
          };
          const measure = (blob) => new Promise((resolve) => {
            const url = URL.createObjectURL(blob);
            const probe = new Image();
            probe.onload = () => { URL.revokeObjectURL(url); resolve({ width: probe.naturalWidth, height: probe.naturalHeight }); };
            probe.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
            probe.src = url;
          });
          const sizeLabel = (size) => {
            const kb = Math.ceil(size / 1024);
            return kb >= 1024 ? `${Math.ceil(kb / 1024)}MB` : `${kb}KB`;
          };
          const accepted = [];
          for (let index = 0; index < images.length; index += 1) {
            const label = index === 0 ? "대표" : `추가${index}`;
            const blob = toBlob(images[index].dataUrl);
            const dimension = await measure(blob);
            if (!dimension) warnings.push(`${label} 이미지를 읽지 못했습니다.`);
            else if (blob.size > 5 * 1024 * 1024) warnings.push(`${label} 이미지가 5MB 를 넘어 올리지 않았습니다.`);
            else if (Math.min(dimension.width, dimension.height) < 500 || Math.max(dimension.width, dimension.height) > 5000) {
              warnings.push(`${label} 이미지 크기 ${dimension.width}x${dimension.height} 는 롯데ON 규격(500~5000px)이 아니라 올리지 않았습니다.`);
            } else {
              const extension = /png/i.test(blob.type) ? "png" : "jpg";
              const name = /\.(jpe?g|png)$/i.test(String(images[index].fileName || "")) ? String(images[index].fileName) : `image${index + 1}.${extension}`;
              accepted.push({ blob, name, dimension, label });
            }
          }
          const uploaded = [];
          if (accepted.length > 0) {
            try {
              const ticketResponse = await fetch(`${apiBase}/soapi/v1/product/registration/createProductImagesFileUploadTicket?limitSizePerEach=${5 * 1024 * 1024}&limitFiles=${accepted.length}`, {
                method: "POST",
                headers: headers(),
              });
              const ticket = (await readUploadResult(ticketResponse))?.data?.ticket;
              if (!ticket) throw new Error(`업로드 준비에 실패했습니다(HTTP ${ticketResponse.status})`);
              for (let index = 0; index < accepted.length; index += 1) {
                const entry = accepted[index];
                const body = new FormData();
                body.append("qquuid", `kiditem-${Date.now()}-${index}`);
                body.append("fileName", entry.name);
                body.append("qqtotalfilesize", String(entry.blob.size));
                body.append("file", entry.blob, entry.name);
                const response = await fetch(`${apiBase}/soapi/v1/bocommon/o/fileManage/upload4FineUploader/${ticket}`, {
                  method: "POST",
                  headers: headers(),
                  body,
                });
                const result = await readUploadResult(response);
                if (!result?.success || !result?.meta?.fileId) {
                  warnings.push(`${entry.label} 이미지를 올리지 못했습니다${result?.message ? `: ${tidy(result.message)}` : ` (HTTP ${response.status})`}.`);
                  continue;
                }
                uploaded.push({ meta: result.meta, entry });
              }
            } catch (error) {
              warnings.push(`상품 이미지를 올리지 못했습니다: ${tidy(error?.message || error)}.`);
            }
          }
          if (uploaded.length > 0) {
            const ret = uploaded.map(({ meta, entry }, index) => ({
              fileId: meta.fileId,
              imgSeq: index + 1,
              epsrTypCd: "IMG",
              epsrTypDtlCd: entry.dimension.height > entry.dimension.width ? "IMG_LNTH" : "IMG_SQRE",
              fileSrc: "",
              origFileNm: meta.fileName || entry.name,
              rprtImgYn: index === 0 ? "Y" : "N",
              fileSize: sizeLabel(meta.size || entry.blob.size),
              origImgFileNm: "",
              imgSortSeq: index + 1,
            }));
            optionWin.scwin.tempBlobImageRow = 0;
            optionWin.scwin.popupCallbackInProductReg({
              param: { callbackId: "uploadItemImage", row: 0, trGrpCd: basic.get("trGrpCd"), paramImageList: [] },
              ret,
            });
            // 창 콜백은 대표 사진을 받아 썸네일 칸(검사용)을 채운다. 늦으면 우리가 가진 사진으로 채운다.
            const thumbnail = await waitFor(() => grid.getCellData(0, "imageSrc"), Math.min(8000, stepWait), 250);
            if (!thumbnail) grid.setCellData(0, "imageSrc", images[0].dataUrl);
            const attached = (optionWin.data_itemImageList || pi.data_itemImageList).getMatchedJSON("row", 0).length;
            if (attached === uploaded.length) steps.push(`상품 이미지 ${attached}장`);
            else warnings.push(`상품 이미지 ${uploaded.length}장 중 ${attached}장만 붙었습니다. 판매옵션 이미지를 확인하세요.`);
          }
        } else {
          warnings.push("상품 이미지가 없습니다. 판매옵션 목록의 이미지 [등록] 으로 올리세요.");
        }

        // 13) 저장 전 검사. 화면의 검사 함수만 부른다(저장·확인창 없음). 막히면 화면이 알려 준 첫 문장을 싣는다.
        const saidBeforeValidation = said.length;
        let valid = false;
        try { valid = scwin.product.validation(); } catch { valid = false; }
        const validationMessages = said.splice(saidBeforeValidation);
        if (valid) steps.push("저장 전 필수 칸 확인");
        else warnings.push(`저장 전 확인: ${tidy(validationMessages[0] || "필수 칸이 비었습니다")}`);

        sweepDialogs();
        for (const message of new Set(said)) {
          if (message && !warnings.some((warning) => warning.includes(message))) warnings.push(`몰 안내: ${message}`);
        }
        window.scrollTo(0, 0);
        return { ok: true, steps, warnings, submitted: false };
      } finally {
        observer.disconnect();
        for (const entry of patched) {
          entry.target.alert = entry.alert;
          entry.target.confirm = entry.confirm;
        }
        releaseDialogs();
      }
    })();
  }

  calls["lotteon.fill"] = (payload) => fillLotteonProductForm(payload || {});
})();
