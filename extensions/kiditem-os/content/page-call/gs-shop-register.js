// GS SHOP 파트너스 상품등록 폼 채우기(MAIN world, KID-256 — 옛 `background/orders/mall-form-register.js` `fillGsshopProductForm` 이식).
// 확장 런타임 몰 쓰기(`extensions/src/sites/gs-shop/registration.ts`)가 `content/page-call/form-fill.js`(쓰기 탭 도우미) 뒤에 넣고
// `gsshop.fill`을 부른다. 인자는 명세·값 묶음뿐이다. 저장·임시저장·[등록]은 부르지 않는다(ADR-0019 — 몰 명세에 검증된 누르기가 없다).
(function installFillGsshopProductForm() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});

  /**
   * GS샵 새 상품등록 화면을 채운다.
   *
   * 칸마다 화면이 부르는 처리 함수(zustand `product-store` 의 `actions`)를 사람이 고른 순서대로 부른다.
   * 처리 함수는 도중에 안내창을 띄우고 닫힐 때까지 기다리기도 해서, 부르는 동안 안내창을 계속 치운다.
   * 넣은 값은 저장소 `schemas[칸].value` 로 확인한다. 저장(`common.create.save`·`imsiSave`)은 부르지 않는다.
   */
  function fillGsshopProductForm(payload) {
    return (async () => {
      const steps = [];
      const warnings = [];
      const said = [];
      // 몰이 띄우는 알림·확인 창은 알림 창 가드(쓰기 탭)가 받는다 — 확인창은 거절하고 문장은 여기(`said`)로 온다.
      const releaseDialogs = window.__kiditemWriteDialogs.listen((message) => said.push(String(message)));

      const form = payload.form;
      const stepWait = payload.stepWaitMs || 15000;
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
      const visible = (el) => Boolean(el && el.getClientRects().length > 0);
      const textOf = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
      const getJson = async (url) => {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      };

      /**
       * 화면이 띄운 안내·확인창을 치운다. 확인창(취소가 있는 창)은 거절하고, 안내는 확인으로 닫는다.
       * 몰이 한 말은 사람에게 넘긴다.
       */
      const clearDialogs = () => {
        for (const dialog of [...document.querySelectorAll('[role="dialog"]')].filter(visible)) {
          const buttons = [...dialog.querySelectorAll("button")];
          const button = buttons.find((entry) => textOf(entry) === "취소")
            || buttons.find((entry) => textOf(entry) === "확인")
            || buttons.find((entry) => textOf(entry) === "닫기");
          const message = textOf(dialog).replace(/^확인\s*/, "").replace(/\s*(취소\s*)?확인$/, "");
          if (message) said.push(message.slice(0, 200));
          button?.click();
        }
      };
      /** 처리 함수를 부르고, 끝날 때까지 안내창을 치운다. 안내창이 닫혀야 끝나는 함수가 있다. */
      const act = async (run) => {
        let settled = false;
        let failure = null;
        const promise = Promise.resolve().then(run).catch((error) => { failure = error; }).finally(() => { settled = true; });
        const until = Date.now() + stepWait;
        while (!settled && Date.now() < until) {
          clearDialogs();
          await Promise.race([promise, sleep(200)]);
        }
        clearDialogs();
        if (failure) throw failure;
        return settled;
      };

      /** 화면이 받아 둔 모듈에서 폼 저장소를 찾는다. 이미 실행된 모듈이라 import 는 같은 인스턴스를 준다. */
      let storeModule = null;
      const findStore = async () => {
        const hrefs = [...document.querySelectorAll('link[rel="modulepreload"]')]
          .map((link) => link.getAttribute("href") || "")
          .filter((href) => /\/chunks\/[^/]+\.js$/.test(href));
        for (const href of hrefs) {
          let mod;
          try { mod = await import(href); } catch { continue; }
          const store = Object.values(mod).find((entry) => entry && typeof entry.getState === "function"
            && entry.getState()?.actions?.baseInfo && entry.getState()?.schemas);
          if (store) {
            storeModule = mod;
            return store;
          }
        }
        return null;
      };

      let store = null;
      const state = () => store.getState();
      const actions = () => state().actions;
      const value = (key) => state().schemas?.[key]?.value;
      const same = (left, right) => String(left ?? "") === String(right ?? "");

      try {
        // 0) 화면 준비. 로그아웃이면 로그인 화면이 와서 저장소가 없다.
        const ready = await waitFor(async () => {
          if (/^\/login/i.test(location.pathname)
            || [...document.querySelectorAll('input[type="password"]')].some(visible)) return "login";
          store = store || await findStore();
          return store && state().meta?.isReady ? "form" : null;
        }, payload.formWaitMs || 40000, 500);
        if (ready !== "form") {
          return { ok: false, noForm: true, error: "GS샵 상품등록 화면을 찾지 못했습니다." };
        }
        // 수정·복사 화면은 같은 저장소를 쓴다. 저장하면 판매중 상품이 바뀌므로 손대지 않는다.
        if (state().meta.mode !== "create" || value("base.prdCd")) {
          return { ok: false, error: "기존 상품 수정 화면이라 채우지 않았습니다. 새 상품등록 화면에서 다시 누르세요." };
        }
        clearDialogs();

        // 1) 상품분류. 고르면 과세·안전인증 대상·정보고시 상품군이 이 분류에 맞게 바뀐다.
        try {
          const code = form.category;
          const [top, mids, smalls, leaves] = await Promise.all([
            getJson("/bff/product/classifications/top"),
            getJson(`/bff/product/classifications/subs?upperCode=${code.slice(0, 3)}&level=1`),
            getJson(`/bff/product/classifications/subs?upperCode=${code.slice(0, 5)}&level=2`),
            getJson(`/bff/product/classifications/leaf?upperCode=${code.slice(0, 7)}`),
          ]);
          const nameOf = (list, part, key = "code") => (Array.isArray(list) ? list : []).find((entry) => same(entry?.[key], part));
          const leaf = nameOf(leaves, code, "prdClsCd");
          if (!leaf) throw new Error("분류 목록에 없습니다");
          await act(() => actions().baseInfo.setPrdClsLayerSelected({
            class1: code.slice(0, 3),
            class2: code.slice(3, 5),
            class3: code.slice(5, 7),
            class4: code.slice(7, 9),
            class1Nm: nameOf(top, code.slice(0, 3))?.name || "",
            class2Nm: nameOf(mids, code.slice(3, 5))?.name || "",
            class3Nm: nameOf(smalls, code.slice(5, 7))?.name || "",
            class4Nm: leaf.prdClsNm || "",
          }));
          if (!same(value("base.prdClsCd"), code)) throw new Error("화면에 반영되지 않았습니다");
          steps.push(`상품분류 ${leaf.prdClsNm || code}`);
        } catch (error) {
          warnings.push(`상품분류 ${form.category}를 고르지 못했습니다(${error?.message || error}). 화면에서 고르세요.`);
        }

        // 2) 전시 카테고리. 매장 번호로 상위 단계를 받아 '최근 등록한 전시 카테고리' 를 고른 것처럼 넣는다.
        try {
          const [section] = await getJson(`/bff/display/sections/by-leaf?sectIds=${form.sectionId}`);
          if (!section) throw new Error("매장 번호가 없습니다");
          await act(() => actions().baseInfo.onClickRecentRegSectCls(section));
          const shops = value("shop.ctgrShops") || [];
          if (!shops.some((shop) => same(shop?.sectid, form.sectionId))) throw new Error("화면에 반영되지 않았습니다");
          steps.push(`전시 카테고리 ${section.name || form.sectionId}`);
        } catch (error) {
          warnings.push(`전시 카테고리 ${form.sectionId}를 고르지 못했습니다(${error?.message || error}). 화면에서 고르세요.`);
        }

        // 3) 협력사 상품코드. 이미 쓰인 코드면 저장이 막히므로 미리 알린다.
        try {
          const exists = await getJson(`/bff/product/suppliers/products/codes/exists?supPrdCd=${encodeURIComponent(form.supplierProductCode)}`);
          if (exists === true || exists?.exists === true) warnings.push(`협력사 상품코드 ${form.supplierProductCode} 는 이미 쓰였습니다. 다른 코드로 바꾸세요.`);
        } catch { /* 확인 못 해도 저장할 때 화면이 다시 본다 */ }
        await act(() => actions().baseInfo.onChangeSupPrdCd(form.supplierProductCode));
        if (same(value("base.supPrdCd"), form.supplierProductCode)) steps.push(`협력사 상품코드 ${form.supplierProductCode}`);
        else warnings.push("협력사 상품코드를 넣지 못했습니다.");

        // 4) 담당MD. 고르면 화면이 담당자 목록과 수수료 기준을 새로 받는다.
        try {
          const mds = await getJson("/bff/supplier/me/md");
          const mdId = form.mdId || String(mds?.list?.[0]?.mdId || mds?.recentList?.[0]?.mdId || "");
          if (!mdId) throw new Error("담당MD 목록이 비었습니다");
          await act(() => actions().baseInfo.onChangeOperMdId(mdId));
          const employees = await getJson(`/bff/product/codes/employees/by-md/${mdId}`);
          const employeeNo = form.employeeNo || String(employees?.[0]?.empNo || "");
          if (employeeNo) await act(() => actions().baseInfo.onChangeRepMdUserId(employeeNo));
          if (!same(value("base.operMdId"), mdId) || !value("base.repMdUserId")) throw new Error("화면에 반영되지 않았습니다");
          steps.push(`담당MD ${mdId}`);
        } catch (error) {
          warnings.push(`담당MD를 고르지 못했습니다(${error?.message || error}). 화면에서 고르세요.`);
        }

        // 5) 상품명 · 브랜드 · 모델명.
        await act(() => actions().baseInfo.onChangeExposPrdNm(form.exposureName));
        await act(() => actions().baseInfo.onChangePrdNm(form.invoiceName));
        if (same(value("base.exposPrdNm"), form.exposureName) && same(value("base.prdNm"), form.invoiceName)) {
          steps.push("노출상품명 · 송장상품명");
        } else {
          warnings.push("상품명을 넣지 못했습니다. 노출상품명·송장상품명을 확인하세요.");
        }
        await act(() => actions().baseInfo.onSelectSearchedBrand({ brandCd: Number(form.brand.code), brandNm: form.brand.name }));
        if (same(value("base.brandCd"), form.brand.code)) steps.push(`브랜드 ${form.brand.name}`);
        else warnings.push(`브랜드 ${form.brand.name}을(를) 넣지 못했습니다. 화면에서 검색해 고르세요.`);
        if (form.modelName) await act(() => actions().baseInfo.onChangeModelNo(form.modelName));

        // 6) 구성상품 · 가격. 판매가와 수수료율을 넣으면 공급가는 화면이 계산한다.
        const composition = form.composition;
        for (const [key, entry] of [
          ["custom.goodsDesc", composition.content],
          ["custom.pkgCnt", String(composition.packageCount)],
          ["custom.factoryName", composition.maker],
          ["custom.nativeCountry", composition.origin],
        ]) {
          if (entry) await act(() => actions().cmposInfo.onChangeCompositions(key, entry));
        }
        if (same(value("custom.goodsDesc"), composition.content)) steps.push("구성상품");
        await act(() => actions().cmposInfo.onChangeSalePrc(String(form.salePrice)));
        if (form.marginRate > 0) await act(() => actions().cmposInfo.onChangeMargnRt(String(form.marginRate)));
        const fee = value("price.fee");
        if (same(value("price.salePrc"), form.salePrice) && fee !== "" && fee !== undefined && fee !== null) {
          steps.push(`판매가 ${form.salePrice} · 수수료율 ${form.marginRate}% · 공급가 ${fee}`);
        } else {
          warnings.push("판매가·공급가가 계산되지 않았습니다. 가격 칸을 확인하세요.");
        }

        // 7) 배송·반품·교환.
        const delivery = form.delivery;
        const d = () => actions().deliveryInfo;
        if (delivery.courier) await act(() => d().onChangeDlvsCoCd(delivery.courier));
        await act(() => d().onChangeCvsDlvsRtpYn(delivery.convenienceReturn));
        await act(() => d().onChangeDlvcYn(delivery.fee > 0 ? "YN" : "NN"));
        if (delivery.fee > 0) {
          await act(() => d().onChangeChrDlvCost(String(delivery.fee)));
          await act(() => d().onChangeStdAmtYn(delivery.freeOver > 0 ? "N" : "Y"));
          if (delivery.freeOver > 0) await act(() => d().onChangeDlvcLimitAmt(String(delivery.freeOver)));
        }
        for (const [yes, amountHandler, fee] of [
          ["onChangeRtnChrYn", "onChangeRtnChrAmt", delivery.returnFee],
          ["onChangeExchChrYn", "onChangeExchChrAmt", delivery.exchangeFee],
        ]) {
          await act(() => d()[yes](fee > 0 ? "Y" : "N"));
          if (fee > 0) await act(() => d()[amountHandler](String(fee)));
        }
        const remote = delivery.remote;
        if (remote.fee > 0 || remote.returnFee > 0 || remote.exchangeFee > 0) {
          await act(() => d().onChangeJejuIlndAddFeeYn("Y"));
          for (const area of ["Jeju", "Ilnd"]) {
            await act(() => d()[`onChange${area}DlvPsblYn`]("Y"));
            for (const [yes, amountHandler, fee] of [
              ["ChrDlvYn", "ChrDlvcAmt", remote.fee],
              ["RtnChrYn", "RtnChrAmt", remote.returnFee],
              ["ExchChrYn", "ExchChrAmt", remote.exchangeFee],
            ]) {
              await act(() => d()[`onChange${area}${yes}`](fee > 0 ? "Y" : "N"));
              if (fee > 0) await act(() => d()[`onChange${area}${amountHandler}`](String(fee)));
            }
          }
        }
        await act(() => d().onChangeRfnTypCd(delivery.refundType));
        if (delivery.shipAddress) await act(() => d().onChangePrdRelspAddrCd(delivery.shipAddress));
        if (delivery.returnAddress) await act(() => d().onChangePrdRetpAddrCd(delivery.returnAddress));
        if (delivery.bundle) await act(() => d().onChangeBundlDlvCd(delivery.bundle));
        if (delivery.weight) await act(() => d().onChangeQuantityValUnitCd(delivery.weight));
        if (delivery.length) await act(() => d().onChangeLengthValUnitCd(delivery.length));
        const deliveryMissing = [
          ["delivery.dlvsCoCd", delivery.courier, "택배사"],
          ["delivery.chrDlvCost", delivery.fee > 0 ? delivery.fee : "", "배송비"],
          ["custom.rtnChrAmt", delivery.returnFee > 0 ? delivery.returnFee : "", "반품비"],
          ["delivery.prdRelspAddrCd", delivery.shipAddress, "출고지"],
          ["delivery.prdRetpAddrCd", delivery.returnAddress, "반송지"],
          ["delivery.quantityValue.unitCd", delivery.weight, "무게"],
        ].filter(([key, expected]) => expected !== "" && !same(value(key), expected)).map(([, , label]) => label);
        if (deliveryMissing.length === 0) steps.push("배송·반품·교환");
        else warnings.push(`배송 정보 ${deliveryMissing.join(", ")} 을(를) 넣지 못했습니다.`);

        // 8) 재고.
        if (form.stock > 0) await act(() => actions().attrInfo.onChangeOrdPsblQty(String(form.stock)));
        if (form.safeStock > 0) await act(() => actions().attrInfo.onChangeSafeStockQty(String(form.safeStock)));
        if (form.stock > 0 && same(value("custom.ordPsblQty"), form.stock)) steps.push(`주문가능수량 ${form.stock}`);

        // 9) 정보고시. 상품군을 고르면 항목이 새로 그려진다. 고칠 수 있는 항목만 채운다(A/S 는 GS 고정).
        const notice = form.notice;
        if (notice.groupCode) {
          await act(() => actions().govPublsInfo.onChangeGovPublsPrdGrpCd(notice.groupCode));
          const loaded = await waitFor(() => (value("custom.govPublsListG") || []).length > 0, stepWait);
          if (loaded) {
            const list = (value("custom.govPublsListG") || []).map((item) => (item?.editable
              && Object.prototype.hasOwnProperty.call(notice.values, String(item.prdExplnItmCd))
              ? { ...item, prdExplnCntnt: notice.values[String(item.prdExplnItmCd)] }
              : item));
            actions().setFieldValue("custom.govPublsListG", list);
            const empty = (value("custom.govPublsListG") || [])
              .filter((item) => item?.mandYn === "Y" && !String(item?.prdExplnCntnt || "").trim())
              .map((item) => item.prdExplnItmNm);
            if (same(value("explanation.govPublsPrdGrpCd"), notice.groupCode) && empty.length === 0) {
              steps.push(`정보고시 ${notice.groupCode}`);
            } else if (empty.length > 0) {
              warnings.push(`정보고시 필수 항목 ${empty.join(", ")} 이(가) 비었습니다.`);
            }
          } else {
            warnings.push(`정보고시 상품군 ${notice.groupCode} 항목을 불러오지 못했습니다. 화면에서 고르세요.`);
          }
        }
        // 안전인증 대상여부. 인증번호·기관·발급일은 우리가 다 알지 못해 '해당사항 없음' 으로 둔다(기존 등록물과 같다).
        await act(() => actions().govPublsInfo.onChangeSafeCertTgtYn("N"));

        // 10) 상품 이미지. 사진 칸 처리 함수가 GS 임시 저장소에 올리고 미리보기를 붙인다(1 = 대표).
        const toFile = (image, fallbackName) => {
          const [head, encoded] = String(image.dataUrl).split(",");
          const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
          const binary = atob(encoded);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          let name = String(image.fileName || fallbackName);
          if (!/\.(jpe?g|png|webp)$/i.test(name)) name = `${fallbackName}.${/png/i.test(mime) ? "png" : "jpg"}`;
          return new File([bytes], name, { type: mime });
        };
        const images = (payload.images || []).filter((image) => image && image.dataUrl).slice(0, payload.maxImages || 8);
        let uploaded = 0;
        for (let index = 0; index < images.length; index += 1) {
          const seq = index + 1;
          const file = toFile(images[index], `image${seq}`);
          const saidBefore = said.length;
          await act(() => actions().imgInfo.uploadPrdImg({ orgFile: file, cntntFileNm: file.name, seq }, {}));
          const slot = (value("images") || []).find((image) => image?.seq === seq);
          if (slot?.cntntUrl && slot?.filePath) uploaded += 1;
          else warnings.push(`${seq === 1 ? "대표" : `추가${seq - 1}`} 이미지를 올리지 못했습니다${said.length > saidBefore ? `: ${said[said.length - 1].replace(/[.\s]+$/, "")}` : ""}.`);
        }
        if (uploaded > 0) steps.push(`상품 이미지 ${uploaded}장`);

        // 11) 기술서. 편집기의 사진 올리기와 같은 임시 업로드로 주소를 받아 편집기에 넣는다.
        let detailHtml = payload.detailHtml || "";
        if (payload.detailImage?.dataUrl) {
          try {
            const upload = Object.values(storeModule || {}).find((entry) => typeof entry === "function"
              && /keepName/.test(String(entry)) && /\.file/.test(String(entry)));
            if (!upload) throw new Error("편집기 업로드를 찾지 못했습니다");
            const result = await upload({ files: [{ id: `$$_${Date.now()}_$$`, file: toFile(payload.detailImage, "detail") }] });
            const path = String((Array.isArray(result) ? result[0]?.path : "") || "");
            if (!path) throw new Error("응답에 사진 주소가 없습니다");
            detailHtml = `<center><img src="${path}" data-uploaded-path="${path}"></center>`;
            steps.push("기술서 사진 GS 업로드");
          } catch (error) {
            warnings.push(`기술서 사진을 GS에 올리지 못했습니다: ${error?.message || error}`);
          }
        }
        const editor = state().deps?.crossEditor;
        if (detailHtml && editor) {
          editor.setValue(detailHtml);
          actions().setFieldValue("custom.documentDesc", detailHtml);
          if (/<img/i.test(String(editor.getValue() || ""))) steps.push("기술서");
          else warnings.push("기술서를 넣지 못했습니다. 편집기에 직접 넣으세요.");
        } else {
          warnings.push(detailHtml ? "기술서 편집기를 찾지 못했습니다. 직접 넣으세요." : "기술서에 넣을 사진을 만들지 못했습니다. 직접 넣으세요.");
        }

        // 채우는 동안 몰이 한 말은 사람에게 넘긴다. 이미 경고에 실은 문장은 다시 싣지 않는다.
        clearDialogs();
        for (const message of new Set(said)) {
          if (!warnings.some((warning) => warning.includes(message))) warnings.push(`몰 안내: ${message}`);
        }

        // 12) 저장 전에 화면이 막는 필수 칸만 다시 본다(저장 검사 함수는 막히면 값을 지우므로 부르지 않는다).
        const blocked = [
          ["base.prdClsCd", "상품분류"],
          ["base.supPrdCd", "협력사 상품코드"],
          ["base.operMdId", "담당MD"],
          ["base.repMdUserId", "담당MD 담당자"],
          ["base.exposPrdNm", "노출상품명"],
          ["base.prdNm", "송장상품명"],
          ["base.brandCd", "브랜드"],
          ["price.salePrc", "판매가"],
          ["price.fee", "공급가"],
          ["delivery.dlvsCoCd", "택배사"],
          ["delivery.prdRelspAddrCd", "출고지"],
          ["delivery.prdRetpAddrCd", "반송지"],
        ].filter(([key]) => {
          const current = value(key);
          return current === "" || current === null || current === undefined;
        }).map(([, label]) => label);
        if (!(value("shop.ctgrShops") || []).some((shop) => shop?.sectid)) blocked.push("전시 카테고리");
        if (!(value("images") || []).some((image) => image?.seq === 1 && image?.cntntUrl)) blocked.push("대표 이미지");
        if (blocked.length === 0) steps.push("저장 전 필수 칸 확인");
        else warnings.push(`저장 전 확인: ${blocked.join(" · ")}`);
        window.scrollTo(0, 0);

        return { ok: true, steps, warnings, submitted: false };
      } finally {
        releaseDialogs();
      }
    })();
  }

  calls["gsshop.fill"] = (payload) => fillGsshopProductForm(payload || {});
})();
