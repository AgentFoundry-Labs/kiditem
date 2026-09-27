// 신세계 파트너오피스 상품등록 폼 채우기(MAIN world, KID-256 — 옛 `background/orders/mall-form-register.js` `fillSsgProductForm` 이식).
// 확장 런타임 몰 쓰기(`extensions/src/sites/ssg/registration.ts`)가 `content/page-call/form-fill.js`(쓰기 탭 도우미) 뒤에 넣고
// `ssg.fill`을 부른다. 인자는 명세·값 묶음뿐이다. 저장·임시저장·[등록]은 부르지 않는다(ADR-0019 — 몰 명세에 검증된 누르기가 없다).
(function installFillSsgProductForm() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});

  /**
   * 신세계 파트너오피스 상품등록 화면을 채운다(MAIN 월드).
   *
   * 사람이 누르는 순서를 그대로 밟는다 — 화면이 앞 칸을 골라야 뒤 칸을 그리기 때문이다
   * (판매사이트 → 전시카테고리 → 표준분류 → 가격·판매정보). 칸마다 이벤트 연결 방식이
   * 달라서(Vue `v-model`, jQuery 서제스트, 인라인 `onchange`) 각각 그 방식으로 건드린다.
   *
   * ⚠️ 인라인 `onchange` 칸(출고지·반송지)은 네이티브 `change` 한 번만 쏜다. jQuery 로 한 번
   * 더 쏘면 그 핸들러가 셀렉트를 첫 줄로 되돌린 뒤라 빈 값으로 다시 불려 고른 주소가
   * 지워진다(라이브 실측 2026-09-14).
   *
   * 저장은 하지 않는다. 끝에 화면 자체 검증(`ItemValidator` · `saveValidModules`)만 돌려
   * 막히는 칸을 경고로 돌려준다 — 둘 다 네트워크를 타지 않는다.
   */
  function fillSsgProductForm(payload) {
    return (async () => {
      const steps = [];
      const warnings = [];
      const said = [];
      // 몰이 띄우는 알림·확인 창은 알림 창 가드(쓰기 탭)가 받는다 — 확인창은 거절하고 문장은 여기(`said`)로 온다.
      const releaseDialogs = window.__kiditemWriteDialogs.listen((message) => said.push(String(message)));

      const form = payload.form;
      const stepWait = payload.stepWaitMs || 8000;
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitFor = async (probe, timeoutMs, stepMs = 250) => {
        const until = Date.now() + timeoutMs;
        for (;;) {
          let found = null;
          try { found = probe(); } catch { found = null; }
          if (found) return found;
          if (Date.now() >= until) return null;
          await sleep(stepMs);
        }
      };
      const q = (selector) => document.querySelector(selector);
      const byId = (id) => document.getElementById(id);
      const visible = (el) => Boolean(el && el.getClientRects().length > 0);
      const fire = (el, types) => {
        for (const type of types) el.dispatchEvent(new Event(type, { bubbles: true }));
      };
      const setText = (el, entry) => {
        el.value = entry;
        fire(el, ["input", "change"]);
      };
      const keyup = (el) => el.dispatchEvent(new KeyboardEvent("keyup", { key: "a", keyCode: 65, which: 65, bubbles: true }));
      const clickRadio = (el) => {
        if (!el) return false;
        if (!el.checked) el.click();
        return el.checked;
      };
      const base = () => window.itemMainDto?.itemDto?.itemBaseDto || {};
      const lastSaid = () => (said.length > 0 ? `: ${said[said.length - 1]}` : "");
      const pad = (n) => String(n).padStart(2, "0");

      /** data URL → File. 화면이 파일 이름의 확장자로 형식을 가른다(jpg·jpeg·png). */
      const toImageFile = (image, fallbackName) => {
        const [head, encoded] = String(image.dataUrl).split(",");
        const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
        const binary = atob(encoded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        let name = String(image.fileName || fallbackName);
        if (!/\.(jpe?g|png)$/i.test(name)) name = `${fallbackName}.${/png/i.test(mime) ? "png" : "jpg"}`;
        return new File([bytes], name, { type: mime });
      };

      /** 서제스트 셀렉트(브랜드·제조국). 옵션 값이 `번호|이름` 이다. */
      const pickSuggestOption = async (input, comboId, name) => {
        input.focus();
        input.value = name;
        keyup(input);
        const combo = await waitFor(() => {
          const select = byId(comboId);
          return select && [...select.options].some((option) => option.value.split("|")[1] === name) ? select : null;
        }, stepWait);
        if (!combo) return false;
        combo.selectedIndex = [...combo.options].findIndex((option) => option.value.split("|")[1] === name);
        combo.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return true;
      };

      /** 검색해서 고르는 카테고리. 결과 줄의 `data-value` 가 `번호|…` 로 시작한다. */
      const pickCategory = async (input, listId, target) => {
        input.focus();
        input.value = target.keyword;
        keyup(input);
        const link = await waitFor(() => {
          const row = document.querySelector(`#${listId} li[data-value^="${target.id}|"]`);
          return row ? (row.querySelector("a") || row) : null;
        }, stepWait);
        if (!link) return false;
        link.click();
        return true;
      };

      /** dhtmlx 셀을 사람이 고치는 것처럼 편집기를 열고 닫는다. 그래야 `onEditCell` 계산이 돈다. */
      const editGridCell = async (grid, rowId, columnId, entry) => {
        const column = grid.getColIndexById(columnId);
        if (column === undefined || column === null || column < 0) return false;
        grid.selectCell(grid.getRowIndex(rowId), column);
        grid.editCell();
        if (grid.editor && grid.editor.obj) grid.editor.obj.value = String(entry);
        grid.editStop();
        await sleep(300);
        return true;
      };

      try {
        // 0) 화면 준비. 로그아웃이면 로그인 화면이 와서 모듈이 없다 → 확장이 로그인 후 다시 부른다.
        const ready = await waitFor(() => {
          if ([...document.querySelectorAll('input[type="password"]')].some(visible)) return "login";
          return window.ItemMain && window.itemMainDto && window.ItemPrcInv
            && q("input#itemNm") && byId(`siteNo${form.siteNo}`) ? "form" : null;
        }, payload.formWaitMs || 30000);
        if (ready !== "form") {
          return { ok: false, noForm: true, error: "신세계 상품등록 화면을 찾지 못했습니다." };
        }
        await waitFor(() => !visible(byId("loadingBox")), stepWait * 2);
        // 상품번호가 실려 있으면 기존 상품 수정 화면이다. 저장하면 판매중 상품이 덮이므로 손대지 않는다.
        if (base().itemId) {
          return { ok: false, error: "기존 상품 수정 화면이라 채우지 않았습니다. 새 상품등록 화면에서 다시 누르세요." };
        }

        // 1) 판매사이트.
        clickRadio(byId(`siteNo${form.siteNo}`));
        const dispInput = await waitFor(() => [...document.querySelectorAll("#categoryInfo input[type=text]")]
          .find((input) => visible(input) && /카테고리명/.test(input.placeholder || "")), stepWait);

        // 2) 전시카테고리(SSG.COM몰). 신세계몰은 화면이 매핑으로 채운다.
        const dispPicked = dispInput
          && await pickCategory(dispInput, "suggestCombo_suggestMainDispCtgId", form.displayCategory);
        if (dispPicked) steps.push(`전시카테고리 ${form.displayCategory.keyword}`);
        else warnings.push(`전시카테고리 ${form.displayCategory.keyword}(${form.displayCategory.id})를 찾지 못했습니다. 화면에서 고르세요.`);

        // 3) 표준분류. 이걸 골라야 판매정보·가격 칸이 그려진다.
        const stdInput = await waitFor(() => (visible(byId("suggestStdCtgTxt")) ? byId("suggestStdCtgTxt") : null), stepWait);
        const stdPicked = stdInput && await pickCategory(stdInput, "suggestCombo_suggestStdCtgId", form.standardCategory);
        const stdApplied = stdPicked && await waitFor(() => base().stdCtgId === form.standardCategory.id, stepWait);
        if (stdApplied) steps.push(`표준분류 ${form.standardCategory.keyword}`);
        else warnings.push(`표준분류 ${form.standardCategory.keyword}(${form.standardCategory.id})를 고르지 못했습니다. 화면에서 고르세요.`);
        document.body.click();

        // 4) 브랜드 → 상품명. 고객 노출 상품명을 화면이 브랜드 + 상품명으로 만든다.
        if (form.brandName) {
          const brandPicked = await pickSuggestOption(q("input#brandNm"), "suggestCombo_brandId", form.brandName);
          if (brandPicked && byId("brandId")?.value) steps.push(`브랜드 ${form.brandName}`);
          else warnings.push(`브랜드 ${form.brandName}을(를) 찾지 못했습니다. 화면에서 고르세요.`);
        }
        setText(q("input#itemNm"), form.itemName);
        if (base().itemNm === form.itemName) steps.push("상품명");
        else warnings.push("상품명을 넣지 못했습니다.");

        // 5) 판매정보 기본값 중 화면이 비워 두는 필수 라디오.
        clickRadio(q(`#itemAddInfo input[name="adultItemTypeCd"][value="${form.adultTypeCode}"]`));
        clickRadio(q(`#itemRetExch input[name="retExchPsblYn"][value="${form.returnExchangeButton}"]`));

        // 6) 가격(판매가 + 마진 → 공급가 자동) · 재고.
        const grid = await waitFor(() => {
          const candidate = window.ItemPrcInv?.gridRepPrc;
          return candidate && candidate.getRowsNum() > 0 ? candidate : null;
        }, stepWait);
        if (grid) {
          clickRadio(byId("autoAccount_1"));
          const rowId = grid.getRowId(0);
          await editGridCell(grid, rowId, "sellprc", form.salePrice);
          if (form.marginRate > 0) await editGridCell(grid, rowId, "mrgrt", form.marginRate);
          const supply = String(grid.cells(rowId, grid.getColIndexById("splprc")).getValue() || "");
          if (supply) steps.push(`가격 판매가 ${form.salePrice} · 마진 ${form.marginRate}% · 공급가 ${supply}`);
          else warnings.push(`공급가가 계산되지 않았습니다${lastSaid()}. 가격 칸을 확인하세요.`);
        } else {
          warnings.push("가격 칸이 그려지지 않았습니다. 표준분류를 고른 뒤 가격을 넣으세요.");
        }
        const stock = q("input#usablInvQty");
        if (stock && form.stock > 0) setText(stock, String(form.stock));

        // 7) 모델명 · 검색어 · 전시기간. 시작이 지금보다 과거면 저장이 막히므로 몇 시간 뒤 정각으로.
        if (form.modelName && q("input#mdlNm")) setText(q("input#mdlNm"), form.modelName);
        if (form.searchKeywords && q("input#itemSrchwdNm")) setText(q("input#itemSrchwdNm"), form.searchKeywords);
        byId("dispDt99_btn")?.click();
        const start = new Date(Date.now() + (payload.displayStartDelayHours || 3) * 3600000);
        if (start.getMinutes() > 0 || start.getSeconds() > 0) start.setHours(start.getHours() + 1);
        start.setMinutes(0, 0, 0);
        const startText = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())} ${pad(start.getHours())}:00`;
        const startInput = q("input#dispStrtDts");
        if (startInput) setText(startInput, startText);
        if (base().dispStrtDt === startText) steps.push(`전시 시작 ${startText}`);
        else warnings.push("전시 시작일을 넣지 못했습니다. 저장 전에 지금 이후로 고치세요.");

        // 8) 상품고시. 분류를 바꾸면 그 분류의 줄이 새로 그려진다.
        const noticeClass = q("select#itemMngPropClsId");
        if (noticeClass && form.notice.classId) {
          if (noticeClass.value !== form.notice.classId) {
            noticeClass.value = form.notice.classId;
            fire(noticeClass, ["change"]);
          }
          const propIds = Object.keys(form.notice.values);
          await waitFor(() => propIds.every((propId) => visible(byId(propId))), stepWait);
          const missing = [];
          for (const [propId, entry] of Object.entries(form.notice.values)) {
            const el = byId(propId);
            if (!visible(el)) { missing.push(propId); continue; }
            setText(el, entry);
          }
          if (form.notice.importPropId) clickRadio(byId(`${form.notice.importPropId}_${form.notice.importYn}`));
          if (missing.length > 0) warnings.push(`상품고시 칸 ${missing.join(", ")} 이(가) 화면에 없습니다.`);
          else steps.push(`상품고시 ${propIds.length}줄`);
        }
        if (form.manufacturer && q("input#manufcoNm")) setText(q("input#manufcoNm"), form.manufacturer);
        if (form.originCountry) {
          const originPicked = await pickSuggestOption(q("input#orplcNm0"), "suggestCombo_prodManufCntryId0", form.originCountry);
          if (!originPicked || !byId("prodManufCntryId0")?.value) {
            warnings.push(`제조국 ${form.originCountry}을(를) 고르지 못했습니다. 화면에서 고르세요.`);
          }
        }

        // 9) 배송 — 소요일 · 출고지/반송지 · 출고/반품 배송비.
        const shipping = form.shipping;
        if (shipping.leadDays > 0 && q("input#shppRqrmDcnt")) setText(q("input#shppRqrmDcnt"), String(shipping.leadDays));
        for (const [selectId, addrId, label] of [
          ["whoutAddrId", shipping.outboundAddrId, "출고지"],
          ["snbkAddrId", shipping.returnAddrId, "반송지"],
        ]) {
          if (!addrId) continue;
          const select = q(`select#${selectId}`);
          if (!select || ![...select.options].some((option) => option.value === addrId)) {
            warnings.push(`${label} ${addrId} 가 목록에 없습니다. 화면에서 고르세요.`);
            continue;
          }
          select.value = addrId;
          fire(select, ["change"]);
          if (base()[selectId] !== addrId) warnings.push(`${label}를 고르지 못했습니다.`);
        }
        for (const fee of shipping.fees) {
          const chain = [
            ["gnrlShppcstPlcyDivCd", fee.divCd],
            ["gnrlShppcstPlcyTypeCd", fee.typeCd],
            ["gnrlPrpayCodDivCd", fee.prepayCd],
            ["gnrlShppcstAplUnitCd", fee.unitCd],
            ["gnrlShppcstId", fee.feeId],
          ];
          let reached = true;
          for (const [selectId, code] of chain) {
            const select = await waitFor(() => {
              const candidate = q(`select#${selectId}`);
              return candidate && [...candidate.options].some((option) => option.value === code) ? candidate : null;
            }, stepWait);
            if (!select) { reached = false; break; }
            select.value = code;
            fire(select, ["change"]);
            await sleep(300);
          }
          if (!reached || !byId("addGnrlShppcstPlcyBtn")) {
            warnings.push(`배송비 ${fee.feeId} 를 고르지 못했습니다. 화면에서 추가하세요.`);
            continue;
          }
          byId("addGnrlShppcstPlcyBtn").click();
          await sleep(500);
          steps.push(`배송비 ${fee.feeId}`);
        }

        // 10) 상품이미지. 칸의 파일 선택과 같다 — 화면이 바로 몰 서버에 올리고(동기) 주소를 적는다.
        const images = (payload.images || []).slice(0, payload.maxImages || 10);
        let uploadedImages = 0;
        for (let index = 0; index < images.length; index += 1) {
          const slot = index + 1;
          const input = byId(`uitemImgVod10_${slot}_file`);
          if (!input) break;
          const transfer = new DataTransfer();
          transfer.items.add(toImageFile(images[index], `image${slot}`));
          input.files = transfer.files;
          fire(input, ["change"]);
          const path = await waitFor(() => byId(`uitemImgVod10_${slot}_dataFileNm`)?.value, stepWait);
          if (!path) {
            warnings.push(`상품이미지 ${slot}을(를) 올리지 못했습니다${lastSaid()}`);
            continue;
          }
          const alt = byId(`uitemImgVod10_${slot}_rplcTextNm`);
          if (alt && !alt.value) setText(alt, slot === 1 ? "대표이미지" : `상품이미지${slot}`);
          uploadedImages += 1;
        }
        if (uploadedImages > 0) steps.push(`상품이미지 ${uploadedImages}장`);

        // 11) 상세설명. SSG Editor 이미지 업로드로 몰 주소를 받고, 에디터 저장 콜백으로 넣는다.
        let detailHtml = payload.detailHtml || "";
        const upload = payload.detailUpload;
        if (upload && payload.detailImage?.dataUrl) {
          try {
            const body = new FormData();
            body.append(upload.field, toImageFile(payload.detailImage, "detail"));
            const response = await fetch(upload.endpoint, { method: "POST", body, credentials: "include" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            const hosted = String(result?.uploadPath || "").trim();
            if (!hosted) throw new Error("응답에 이미지 주소가 없습니다");
            detailHtml = `<center><img src="${new URL(hosted, location.origin).href}"></center>`;
            steps.push("상세이미지 몰 업로드");
          } catch (error) {
            warnings.push(`상세이미지를 몰에 올리지 못했습니다: ${error?.message || error}`);
          }
        }
        if (detailHtml && typeof window.ItemDtl?.popupItemDtlSynapEditorCallBack === "function") {
          window.ItemDtl.popupItemDtlSynapEditorCallBack(detailHtml);
          steps.push("상세설명");
        } else {
          warnings.push("상세설명에 넣을 이미지를 만들지 못했습니다. 화면에서 직접 넣으세요.");
        }

        // 채우는 동안 몰이 한 말은 사람에게 넘긴다. 이미 경고에 실은 문장은 다시 싣지 않는다.
        for (const message of new Set(said)) {
          if (!warnings.some((warning) => warning.includes(message))) warnings.push(`몰 안내: ${message}`);
        }

        // 12) 저장 전 검증만 돌린다. 막히는 첫 칸을 사람에게 알린다.
        said.length = 0;
        let valid = null;
        try {
          window.ItemMain.savePreProcess();
          valid = Boolean(window.ItemValidator.validate(window.jQuery("#content")))
            && Boolean(window.ItemMain.saveValidModules());
        } catch {
          valid = null;
        }
        if (valid === true) steps.push("저장 전 검증 통과");
        else if (valid === false) warnings.push(`저장 전 확인: ${[...new Set(said)].join(" / ") || "화면이 막는 칸이 있습니다"}`);
        said.length = 0;
        window.scrollTo(0, 0);

        return { ok: true, steps, warnings, submitted: false };
      } finally {
        // 사람이 이어서 쓸 화면이다. 몰 말 듣기를 뗀다(진짜 창은 탭을 운영자에게 넘길 때 돌아온다).
        releaseDialogs();
      }
    })();
  }

  calls["ssg.fill"] = (payload) => fillSsgProductForm(payload || {});
})();
