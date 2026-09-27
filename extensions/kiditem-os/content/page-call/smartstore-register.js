// 스마트스토어센터 상품등록 폼 채우기(MAIN world, KID-256 — 옛 `background/orders/mall-form-register.js` `fillSmartstoreProductForm` 이식).
// 확장 런타임 몰 쓰기(`extensions/src/sites/smartstore/registration.ts`)가 `content/page-call/form-fill.js`(쓰기 탭 도우미) 뒤에 넣고
// `smartstore.fill`을 부른다. 인자는 명세·값 묶음뿐이다. 저장·임시저장·[등록]은 부르지 않는다(ADR-0019 — 몰 명세에 검증된 누르기가 없다).
(function installFillSmartstoreProductForm() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});

  /**
   * 스마트스토어 새 상품등록 화면을 사람이 누르는 순서대로 채운다.
   *
   * AngularJS 화면이라 넣은 값이 **모델에 닿았는지** 칸마다 모델을 읽어 확인한다. debugInfo 가 꺼져
   * `.scope()` 는 못 쓰니 `$rootScope` 에서 `vm.productFormSubmitVO` 를 찾는다.
   * 마지막에 폼 검증(`$error`)만 읽어 막히는 칸을 사람에게 알린다. 저장·임시저장은 누르지 않는다.
   */
  function fillSmartstoreProductForm(payload) {
    return (async () => {
      const steps = [];
      const warnings = [];
      const said = [];
      // 몰이 띄우는 알림·확인 창은 알림 창 가드(쓰기 탭)가 받는다 — 확인창은 거절하고 문장은 여기(`said`)로 온다.
      const releaseDialogs = window.__kiditemWriteDialogs.listen((message) => said.push(String(message)));

      const form = payload.form;
      const stepWait = payload.stepWaitMs || 10000;
      // 창이 뜨는지·값이 모델에 닿는지 짧게 보는 기다림. 칸 반응 기다림보다 길 이유가 없다.
      const brief = Math.min(3000, stepWait);
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
      const q = (selector, scope = document) => (scope ? scope.querySelector(selector) : null);
      const all = (selector, scope = document) => (scope ? [...scope.querySelectorAll(selector)] : []);
      const visible = (el) => Boolean(el && el.getClientRects().length > 0);
      const textOf = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
      const fire = (el, types) => {
        for (const type of types) el.dispatchEvent(new Event(type, { bubbles: true }));
      };
      /**
       * 사람이 치는 것과 같다 — 포커스 → 값 → 포커스 해제 **한 번**.
       *
       * ⚠️ 금액 칸(`ncp-number-format`)은 blur 마다 값을 `6,000` 으로 바꿔 다시 읽는다. 포커스가 남은 채로
       * 가짜 blur 를 쏘면, 나중에 진짜 blur 가 한 번 더 와서 `6,000` 을 숫자로 못 읽고 칸을 비운다
       * (라이브 실측 2026-09-14: 판매가·즉시할인이 채운 뒤 1초 안에 사라짐). 진짜 포커스면 진짜로 푼다.
       */
      const typeInto = (el, entry) => {
        if (!el) return false;
        el.focus?.();
        el.value = String(entry);
        fire(el, ["input", "change"]);
        if (document.activeElement === el && typeof el.blur === "function") el.blur();
        else fire(el, ["blur"]);
        return true;
      };

      /** 화면 모델. 컴포넌트마다 같은 객체를 나눠 쓰므로 처음 만난 것을 쓴다. */
      const submitVO = () => {
        const root = window.angular?.element(document.body).injector?.()?.get("$rootScope");
        const stack = root ? [root] : [];
        for (let guard = 0; stack.length > 0 && guard < 50000; guard += 1) {
          const scope = stack.pop();
          if (scope.vm?.productFormSubmitVO?.product) return scope.vm.productFormSubmitVO;
          for (let child = scope.$$childHead; child; child = child.$$nextSibling) stack.push(child);
        }
        return null;
      };
      const product = () => submitVO()?.product || {};
      const detail = () => product().detailAttribute || {};

      const openModals = () => all(".modal").filter(visible);
      // 우리가 여닫는 창의 글은 사람에게 넘기지 않는다(할 일을 이미 알고 채운다).
      const quiet = /유의사항 안내|내 사진 불러오기/;
      /**
       * 떠 있는 안내·확인창을 치운다.
       *
       * 확인창(취소가 있는 창)은 **거절**한다 — 무엇을 묻든 '예' 가 눌리는 일이 없게. 안내는 닫는다.
       * 몰이 한 말은 버리지 않고 사람에게 넘긴다.
       */
      const clearDialogs = () => {
        for (const modal of openModals()) {
          const buttons = all("button", modal);
          const button = buttons.find((entry) => textOf(entry) === "취소")
            || buttons.find((entry) => entry.classList.contains("close"))
            || buttons.find((entry) => textOf(entry) === "확인");
          const message = textOf(modal).replace(/^×\s*/, "").replace(/\s*(취소\s*)?확인$/, "");
          if (message && !quiet.test(message)) said.push(message.slice(0, 200));
          button?.click();
        }
      };

      /** 접힌 섹션을 펼친다. 펼쳐야 칸이 그려지는 섹션이 있다(`상품 주요정보`·`상품정보제공고시`·`검색설정`). */
      const openSection = async (title) => {
        const section = all(".form-section").find((candidate) => textOf(q(".title-line", candidate)).startsWith(title));
        const line = q(".title-line", section);
        if (!line) return null;
        const toggle = q("a.btn", line);
        if (toggle && !toggle.classList.contains("active")) {
          line.click();
          await waitFor(() => toggle.classList.contains("active"), brief);
          await sleep(300);
        }
        return section;
      };

      const selectizeIn = (scope, selector) => all(selector, scope).map((el) => el.selectize).find(Boolean) || null;
      /** 목록에서 옵션 키로 고른다. 뒷 단 목록은 앞 단을 고른 뒤에 채워지므로 기다린다. */
      const pickOption = async (selectize, key) => {
        if (!selectize) return false;
        const ready = await waitFor(() => Object.prototype.hasOwnProperty.call(selectize.options, key), stepWait);
        if (!ready) return false;
        if (selectize.getValue() !== key) selectize.setValue(key);
        return selectize.getValue() === key;
      };
      /** 검색해서 고르는 목록(카테고리). 화면이 쓰는 검색을 그대로 부른다. */
      const loadOptions = (selectize, keyword) => new Promise((resolve) => {
        let settled = false;
        const finish = (items) => {
          if (settled) return;
          settled = true;
          resolve(Array.isArray(items) ? items : []);
        };
        setTimeout(() => finish([]), stepWait);
        try { selectize.settings.load.call(selectize, keyword, finish); } catch { finish([]); }
      });

      /** data URL → File. 사진 칸은 jpg·gif·png·bmp 만 받는다. */
      const toImageFile = (image, fallbackName) => {
        const [head, encoded] = String(image.dataUrl).split(",");
        const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
        const binary = atob(encoded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        let name = String(image.fileName || fallbackName);
        if (!/\.(jpe?g|png|gif|bmp)$/i.test(name)) name = `${fallbackName}.${/png/i.test(mime) ? "png" : "jpg"}`;
        return new File([bytes], name, { type: mime });
      };

      const uploadModal = () => openModals().find((modal) => /내 사진 불러오기/.test(textOf(modal)));
      // 화면이 제 박자로 늦게 띄우는 안내. 카테고리를 고르면 '유의사항 안내', 여는 순간엔 '이전에 작성하던 내용'.
      const incidental = /유의사항 안내|이전에 작성하던 내용/;
      /** 늦게 뜬 안내만 닫는다. 떠 있는 사진 창은 건드리지 않는다. 옛 내용 불러오기는 취소한다. */
      const closeIncidental = () => {
        for (const modal of openModals()) {
          if (!incidental.test(textOf(modal))) continue;
          const buttons = all("button", modal);
          (buttons.find((entry) => textOf(entry) === "취소")
            || buttons.find((entry) => entry.classList.contains("close")))?.click();
        }
      };
      const uploadedCount = (containerId, imageType) => {
        const inModel = (Array.isArray(product().images) ? product().images : [])
          .filter((image) => image?.imageType === imageType).length;
        const names = q(`#${containerId} input[name="_hidden_uploaded_names"]`)?.value || "";
        return Math.max(inModel, names ? names.split(",").filter(Boolean).length : 0);
      };
      /**
       * `이미지 등록 → 내 사진` 과 같다. 창이 열리면 ng-file-upload 가 숨은 파일 칸을 만들고, 거기 파일을
       * 넣으면 화면이 네이버 사진 서버에 올린 뒤 창을 닫고, 다음 틱에 사진을 칸에 붙인다.
       *
       * ⚠️ 사진 창 위에 다른 창이 보인다고 곧 거절이 아니다. 늦게 뜬 '유의사항 안내' 가 겹친 것을 거절로 보고
       *    사진 창까지 닫아 올리던 사진이 버려졌다(라이브 2026-09-14, 대표이미지 빈 칸). 그런 안내는 닫고 계속
       *    기다리고, 형식·크기·개수 안내처럼 사진 창이 띄운 것만 거절로 본다.
       *
       * 돌려주는 `stage` 로 어디서 멈췄는지 가른다 — `open`(창이 안 열림)만 다시 해 볼 만하다.
       */
      const uploadThroughModal = async (button, files, containerId, imageType) => {
        const before = uploadedCount(containerId, imageType);
        clearDialogs();
        await waitFor(() => openModals().length === 0, brief);
        const fileInputs = () => all('input[type="file"][ngf-select^="vm.uploadImagesFromDevice"]');
        const existing = new Set(fileInputs());
        button.click();
        const input = await waitFor(() => {
          closeIncidental();
          return uploadModal()
            ? fileInputs().find((candidate) => !existing.has(candidate)) || fileInputs().pop()
            : null;
        }, stepWait);
        if (!input) {
          // 카테고리가 안 골라졌으면 창 대신 칸 아래 빨간 글(`먼저 카테고리를 선택해 주세요.`)이 뜬다.
          const hint = all('[class*="danger"]', q(`#${containerId}`)).map(textOf).find(Boolean);
          clearDialogs();
          return { ok: false, stage: "open", reason: hint || "사진 창이 열리지 않았습니다" };
        }
        const transfer = new DataTransfer();
        for (const file of files) transfer.items.add(file);
        input.files = transfer.files;
        fire(input, ["change"]);
        let refusal = "";
        const settled = await waitFor(() => {
          closeIncidental();
          if (!uploadModal()) return "closed";
          const other = openModals()
            .find((modal) => !/내 사진 불러오기/.test(textOf(modal)) && !incidental.test(textOf(modal)));
          if (!other) return null;
          refusal = textOf(other).replace(/^×\s*/, "").replace(/\s*(취소\s*)?확인$/, "");
          return "refused";
        }, payload.imageWaitMs || 60000);
        if (settled === "closed") {
          const attached = await waitFor(() => uploadedCount(containerId, imageType) > before, stepWait);
          return attached
            ? { ok: true, added: uploadedCount(containerId, imageType) - before }
            : { ok: false, stage: "attach", reason: "올린 사진이 칸에 붙지 않았습니다" };
        }
        clearDialogs();
        return settled === "refused"
          ? { ok: false, stage: "refused", reason: refusal || "사진 창이 사진을 받지 않았습니다" }
          : { ok: false, stage: "timeout", reason: "네이버 사진 서버 응답을 기다리다 멈췄습니다" };
      };
      /** 칸 하나에 사진을 올린다. 창이 안 열린 경우만 한 번 더 한다 — 올라가던 것을 다시 올리면 겹친다. */
      const uploadImages = async (containerId, imageType, files) => {
        const button = () => q(`#${containerId} a[ng-click="vm.openUploadModal()"]`);
        if (!button()) return { ok: false, reason: "사진 칸을 찾지 못했습니다" };
        let result = await uploadThroughModal(button(), files, containerId, imageType);
        if (!result.ok && result.stage === "open" && button()) {
          result = await uploadThroughModal(button(), files, containerId, imageType);
        }
        return { ...result, reason: String(result.reason || "").replace(/[.\s]+$/, "") };
      };

      try {
        // 0) 화면 준비. 로그아웃이면 로그인 화면이 와서 폼이 없다.
        const ready = await waitFor(() => {
          if (/^#\/(login|signin)/i.test(location.hash)
            || all('input[type="password"]').some(visible)) return "login";
          return window.angular && q('form[name="vm.productForm"]')
            && q('input[ng-model="vm.category"]')?.selectize && submitVO() ? "form" : null;
        }, payload.formWaitMs || 40000);
        if (ready !== "form") {
          return { ok: false, noForm: true, error: "스마트스토어 상품등록 화면을 찾지 못했습니다." };
        }
        // 상품번호가 실린 화면은 판매중 상품 수정이다. 사람이 저장하면 그 상품이 덮이므로 손대지 않는다.
        if (location.hash !== "#/products/create" || product().id) {
          return { ok: false, error: "기존 상품 수정 화면이라 채우지 않았습니다. 새 상품등록 화면에서 다시 누르세요." };
        }

        // 1) 여는 순간 뜨는 창. `이전에 작성하던 내용` 을 확인하면 옛 내용이 새 값을 덮는다 → 취소.
        const resume = await waitFor(() => openModals().find((modal) => /이전에 작성하던 내용/.test(textOf(modal))), brief);
        if (resume) {
          all("button", resume).find((button) => textOf(button) === "취소")?.click();
          await waitFor(() => !visible(resume), brief);
          steps.push("이전 작성 내용은 불러오지 않음");
        }
        q(".seller-notice button.close")?.click();

        // 2) 카테고리. 이걸 골라야 인증·고시·사진 칸이 그 카테고리에 맞게 그려진다.
        const categorySelect = q('input[ng-model="vm.category"]').selectize;
        const categoryId = () => String(product().category?.id || "");
        if (categoryId() !== form.category.id) {
          const valueField = categorySelect.settings.valueField || "id";
          const found = (await loadOptions(categorySelect, form.category.keyword))
            .find((item) => String(item?.[valueField]) === form.category.id);
          if (found) {
            categorySelect.addOption(found);
            categorySelect.setValue(String(found[valueField]));
            await waitFor(() => categoryId() === form.category.id, stepWait);
          }
        }
        if (categoryId() === form.category.id) {
          steps.push(`카테고리 ${product().category?.wholeCategoryName || form.category.keyword}`);
        } else {
          warnings.push(`카테고리 ${form.category.keyword}(${form.category.id})를 찾지 못했습니다. 화면에서 고르세요.`);
        }
        // 어린이제품 인증 카테고리면 '유의사항 안내'(모델명·인증 필수)가 뜬다. 둘 다 아래에서 채운다.
        await waitFor(() => openModals().find((modal) => /유의사항 안내/.test(textOf(modal))), Math.min(2000, stepWait));
        clearDialogs();

        // 3) 상품명 · 판매가 · 즉시할인 · 재고.
        typeInto(q('input[name="product.name"]'), form.productName);
        if (product().name === form.productName) steps.push("상품명");
        else warnings.push("상품명을 넣지 못했습니다.");

        typeInto(q("#prd_price2"), form.salePrice);
        const priceOk = Number(product().salePrice) === form.salePrice;
        let discountOk = true;
        if (form.discountWon > 0) {
          const on = q("#r3_1_total");
          if (on && !on.checked) on.click();
          // 켜야 칸이 새로 그려진다. 켜기 전에 찾아 둔 요소에 쓰면 모델에 안 닿는다.
          const discount = await waitFor(() => (visible(q("#prd_sale")) ? q("#prd_sale") : null), stepWait);
          typeInto(discount, form.discountWon);
          const policy = product().customerBenefit?.immediateDiscountPolicy?.discountMethod;
          discountOk = Boolean(discount) && (policy ? Number(policy.value) === form.discountWon : discount.value.replace(/,/g, "") === String(form.discountWon));
        } else {
          const off = q("#r3_2_total");
          if (off && !off.checked) off.click();
        }
        if (priceOk && discountOk) {
          steps.push(form.discountWon > 0
            ? `판매가 ${form.salePrice} · 즉시할인 ${form.discountWon} → ${form.salePrice - form.discountWon}원`
            : `판매가 ${form.salePrice}`);
        } else {
          warnings.push(`${priceOk ? "즉시할인" : "판매가"}을 넣지 못했습니다. 가격 칸을 확인하세요.`);
        }
        if (form.stock > 0) {
          typeInto(q("#stock"), form.stock);
          if (Number(product().stockQuantity) === form.stock) steps.push(`재고 ${form.stock}`);
          else warnings.push("재고수량을 넣지 못했습니다.");
        }

        // 4) 사진. 대표 1장 → 추가 최대 9장. 카테고리를 고른 뒤라야 사진 창이 열린다.
        const images = (payload.images || []).filter((image) => image && image.dataUrl);
        if (images.length > 0) {
          const represent = await uploadImages("representImage", "REPRESENTATIVE", [toImageFile(images[0], "image1")]);
          if (represent.ok) steps.push("대표이미지");
          else warnings.push(`대표이미지를 올리지 못했습니다: ${represent.reason}. 화면에서 올리세요.`);
          const extras = images.slice(1, 1 + (payload.maxExtraImages || 9));
          if (extras.length > 0) {
            const extra = await uploadImages(
              "optionalImages",
              "OPTIONAL",
              extras.map((image, index) => toImageFile(image, `image${index + 2}`)),
            );
            if (extra.ok) steps.push(`추가이미지 ${extra.added}장`);
            if (extra.ok && extra.added < extras.length) {
              warnings.push(`추가이미지 ${extras.length}장 중 ${extra.added}장만 올라갔습니다. 화면에서 확인하세요.`);
            }
            if (!extra.ok) warnings.push(`추가이미지 ${extras.length}장을 올리지 못했습니다: ${extra.reason}. 화면에서 올리세요.`);
          }
        }

        // 5) 상세설명. 화면이 쓰는 네이버 사진 업로드로 주소를 받아 `HTML 작성` 에 넣는다.
        let detailHtml = payload.detailHtml || "";
        if (payload.detailImage?.dataUrl) {
          try {
            const uploader = window.angular.element(document.body).injector().get("photoInfraImageUploadService");
            const uploaded = await uploader.uploadImages([toImageFile(payload.detailImage, "detail")], {});
            const url = String((Array.isArray(uploaded) ? uploaded[0]?.imageUrl : "") || "");
            if (!/^https?:\/\//.test(url)) throw new Error("응답에 이미지 주소가 없습니다");
            // 응답은 http 주소다. 같은 사진이 https CDN 에도 있다(바이트 동일 실측).
            const hosted = url.replace(/^https?:\/\/shop1\.phinf\.naver\.net\//, "https://shop-phinf.pstatic.net/");
            detailHtml = `<center><img src="${hosted}"></center>`;
            steps.push("상세이미지 네이버 업로드");
          } catch (error) {
            warnings.push(`상세이미지를 네이버에 올리지 못했습니다: ${error?.message || error}`);
          }
        }
        if (detailHtml) {
          const htmlTab = all('a[ng-click*="changeEditorType"]').find((link) => /HTML 작성/.test(textOf(link)));
          if (htmlTab && product().detailContent?.editorType !== "NONE") htmlTab.click();
          const editor = await waitFor(() => {
            const candidate = q('textarea[ng-model="vm.editorContent"]');
            return visible(candidate) ? candidate : null;
          }, stepWait);
          typeInto(editor, detailHtml);
          const content = product().detailContent || {};
          if (content.editorType === "NONE" && content.productDetailInfoContent === detailHtml) steps.push("상세설명(HTML)");
          else warnings.push("상세설명을 넣지 못했습니다. [HTML 작성] 에 직접 넣으세요.");
        } else {
          warnings.push("상세설명에 넣을 이미지를 만들지 못했습니다. 화면에서 직접 넣으세요.");
        }

        // 6) 상품 주요정보 — 모델명 · 브랜드 · 제조사 · 원산지 · 어린이제품인증.
        const mainInfo = await openSection("상품 주요정보");
        const searchInfo = () => detail().naverShoppingSearchInfo || {};
        if (form.modelName) {
          // 모델명은 `찾기` 창의 `텍스트로 직접입력` 으로만 넣을 수 있다. 창의 [저장] 은 창을 닫으며 이 폼에만
          // 반영한다(서버에 보내지 않는다). 입력칸은 직접입력을 고른 뒤에야 그려진다.
          q('button[ng-click^="vm.func.openModelSearchModal"]', mainInfo)?.click();
          const modal = await waitFor(() => openModals()
            .find((candidate) => q('input[ng-model="vm.inputType"]', candidate)), stepWait);
          if (modal) {
            const direct = q('input[ng-model="vm.inputType"][value="TEXT"]', modal);
            if (direct && !direct.checked) direct.click();
            const input = await waitFor(() => {
              const candidate = q('input[ng-model="vm.modelText"]', modal);
              return visible(candidate) ? candidate : null;
            }, brief);
            typeInto(input, form.modelName);
            await sleep(200);
            q('[ng-click="vm.func.save()"]', modal)?.click();
            await waitFor(() => !visible(modal), brief);
            if (visible(modal)) q("button.close", modal)?.click();
          }
          if (await waitFor(() => searchInfo().modelName === form.modelName, brief)) steps.push(`모델명 ${form.modelName}`);
          else warnings.push(`모델명 ${form.modelName}을(를) 넣지 못했습니다. 상품 주요정보 [찾기] 에서 직접 입력하세요.`);
        }
        // 브랜드·제조사는 목록에 없는 이름이라 직접입력으로 만든다(`{id:'', name}`).
        const nameSelects = all('[ng-model="vm.searchKeyword"]', mainInfo).map((el) => el.selectize).filter(Boolean);
        for (const [index, name, key, label] of [
          [0, form.brandName, "brandName", "브랜드"],
          [1, form.manufacturerName, "manufacturerName", "제조사"],
        ]) {
          if (!name) continue;
          if (nameSelects[index] && searchInfo()[key] !== name) nameSelects[index].createItem(name, false);
          if (await waitFor(() => searchInfo()[key] === name, brief)) steps.push(`${label} ${name}`);
          else warnings.push(`${label} ${name}을(를) 넣지 못했습니다. 화면에서 직접 입력하세요.`);
        }
        clearDialogs();

        if (form.origin) {
          const origin = form.origin;
          let reached = await pickOption(
            selectizeIn(mainInfo, 'select[ng-model="vm.viewData.originAreaInfo.originAreaExposureType"]'),
            origin.exposureType,
          );
          if (reached && origin.firstSub) {
            reached = await pickOption(selectizeIn(mainInfo, 'select[ng-model="vm.viewData.originAreaInfo.firstSubOriginAreaType"]'), origin.firstSub);
          }
          if (reached && origin.secondSub) {
            reached = await pickOption(selectizeIn(mainInfo, 'select[ng-model="vm.viewData.originAreaInfo.secondSubOriginAreaType"]'), origin.secondSub);
          }
          if (reached && origin.importer) {
            const importer = await waitFor(() => {
              const candidate = q('input[ng-model="vm.viewData.originAreaInfo.importer"]', mainInfo);
              return visible(candidate) ? candidate : null;
            }, stepWait);
            reached = typeInto(importer, origin.importer);
          }
          const area = detail().originAreaInfo || {};
          const code = origin.secondSub || origin.firstSub;
          const applied = reached
            && (!code || (area.originArea?.code || area.originAreaCode) === code)
            && (!origin.importer || area.importer === origin.importer);
          if (applied) steps.push(`원산지 ${origin.exposureType}${code ? ` ${code}` : ""}${origin.importer ? ` · 수입사 ${origin.importer}` : ""}`);
          else warnings.push("원산지를 고르지 못했습니다. 상품 주요정보에서 고르세요.");
        }

        if (form.childCert) {
          const cert = form.childCert;
          const target = q("#childYn_false");
          if (target && !target.checked) target.click();
          const numberInput = () => q('input[name="certNumberCHILD_CERTIFICATION0"]');
          await waitFor(numberInput, stepWait);
          // 인증 한 줄(종류 selectize · 기관 · 번호 · 상호 · 일자)을 번호 칸에서 거슬러 올라가 찾는다.
          let row = numberInput();
          while (row && !q('select[ng-model$=".certificationInfo"]', row)) row = row.parentElement;
          const picked = row && await pickOption(q('select[ng-model$=".certificationInfo"]', row).selectize, `${cert.certId}_CHILD_CERTIFICATION`);
          let filled = false;
          if (picked) {
            await sleep(300);
            typeInto(numberInput(), cert.number);
            // 인증상호는 필수다. 종류를 고른 뒤에야 칸이 보인다.
            const company = await waitFor(() => {
              const candidate = q('input[ng-model$=".companyName"]', row);
              return visible(candidate) ? candidate : null;
            }, brief);
            if (cert.companyName && company) typeInto(company, cert.companyName);
            filled = numberInput()?.value === cert.number && (!cert.companyName || company?.value === cert.companyName);
          }
          if (filled) steps.push(`어린이제품인증 ${cert.number}`);
          else warnings.push(`어린이제품인증 ${cert.number}을(를) 넣지 못했습니다. 상품 주요정보에서 직접 넣으세요.`);
        } else if (q("#childYn_false")) {
          // 어린이제품인데 번호를 모른다. '대상 아님' 을 대신 고르면 거짓 신고라 비워 두고 사람에게 넘긴다.
          warnings.push("KC 인증번호가 없어 어린이제품인증을 비워 뒀습니다. 번호를 넣거나, 인증대상이 아니면 직접 '대상 아님' 을 고르세요.");
        }
        clearDialogs();

        // 7) 상품정보제공고시. 새 화면은 **직전 등록물 값**으로 미리 채워져 온다 → 전부 덮어쓴다.
        const noticeSection = await openSection("상품정보제공고시");
        if (noticeSection) {
          const notice = form.notice;
          const typePicked = await pickOption(selectizeIn(noticeSection, 'select[ng-model="vm.selectizeType"]'), notice.type);
          const directRadio = (model) => all(`input[ng-model="${model}"]`, noticeSection).find((radio) => radio.value === "false");
          for (const radio of [directRadio("vm.viewData.nullable.certificateDetails"), directRadio("vm.viewData.selectedCustomerService")]) {
            if (radio && !radio.checked) radio.click();
          }
          await sleep(200);
          for (const [selector, value] of [
            ['input[ng-model="vm.content.itemName"]', notice.itemName],
            ['input[ng-model="vm.content.modelName"]', notice.modelName],
            ['textarea[ng-model="vm.content.certificateDetails"]', notice.certificateDetails],
            ['input[ng-model="vm.content.afterServiceDirector"]', notice.afterServiceDirector],
          ]) {
            if (value) typeInto(q(selector, noticeSection), value);
          }
          const maker = selectizeIn(noticeSection, '[ng-model="vm.searchKeyword"]');
          const content = () => detail().productInfoProvidedNotice?.productInfoProvidedNoticeContent || {};
          if (notice.manufacturer && maker && content().manufacturer !== notice.manufacturer) maker.createItem(notice.manufacturer, false);
          await waitFor(() => !notice.manufacturer || content().manufacturer === notice.manufacturer, brief);
          const wrong = ["itemName", "modelName", "certificateDetails", "manufacturer", "afterServiceDirector"]
            .filter((key) => notice[key] && content()[key] !== notice[key]);
          if (typePicked && wrong.length === 0) steps.push(`상품정보제공고시 ${notice.type}`);
          else warnings.push(`상품정보제공고시 ${[...(typePicked ? [] : ["분류"]), ...wrong].join(", ")} 을(를) 넣지 못했습니다. 직전 등록물 값이 남아 있을 수 있습니다.`);
        } else {
          warnings.push("상품정보제공고시 칸을 찾지 못했습니다. 직전 등록물 값이 그대로일 수 있으니 확인하세요.");
        }
        clearDialogs();

        // 8) 검색설정 태그. 넣을 때마다 화면이 사용 불가 태그인지 네이버에 묻는다.
        if (form.tags.length > 0) {
          const searchSection = await openSection("검색설정");
          const direct = q('input[ng-model="vm.viewData.isDirectInput"]', searchSection);
          if (direct && !direct.checked) direct.click();
          const tagSelect = await waitFor(() => q('select[ng-model="vm.directInputTag"]', searchSection)?.selectize, stepWait);
          const current = () => (detail().seoInfo?.sellerTags || []).map((tag) => tag?.text);
          for (const tag of form.tags) {
            if (!tagSelect || current().includes(tag)) continue;
            tagSelect.createItem(tag, false);
            await waitFor(() => current().includes(tag) || openModals().length > 0, brief);
            clearDialogs();
          }
          const added = form.tags.filter((tag) => current().includes(tag));
          const missed = form.tags.filter((tag) => !current().includes(tag));
          if (added.length > 0) steps.push(`태그 ${added.length}개`);
          if (missed.length > 0) warnings.push(`태그 ${missed.join(", ")} 은(는) 넣지 못했습니다(사용 불가 태그일 수 있습니다).`);
        }

        // 채우는 동안 몰이 한 말은 사람에게 넘긴다. 이미 경고에 실은 문장은 다시 싣지 않는다.
        clearDialogs();
        for (const message of new Set(said)) {
          if (!warnings.some((warning) => warning.includes(message))) warnings.push(`몰 안내: ${message}`);
        }

        // 9) 저장 전 검증만 읽는다. 막히는 칸이 있는 섹션을 사람에게 알린다.
        //    ⚠️ 꺼진 칸(고시 소비자상담 전화 등)도 required 로 남는다 — 사람이 채울 수 없는 칸이라 뺀다.
        const formController = window.angular.element(q('form[name="vm.productForm"]')).controller("form");
        const blocked = new Set();
        const seen = new Set();
        const sectionTitle = (el) => {
          const label = q(".title-line label", el?.closest?.(".form-section"));
          return label
            ? [...label.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join("").trim()
            : "";
        };
        const walk = (controller, depth) => {
          for (const entries of Object.values(controller?.$error || {})) {
            for (const entry of entries || []) {
              if (!entry || seen.has(entry)) continue;
              seen.add(entry);
              if (typeof entry.$setViewValue !== "function") {
                if (depth < 8) walk(entry, depth + 1);
                continue;
              }
              const el = entry.$$element?.[0];
              if (el && (el.disabled || el.closest?.("fieldset[disabled]"))) continue;
              // 칸 이름은 placeholder 가 가장 사람 말에 가깝다(`인증기관`). 숨은 검증 칸은 섹션 이름만 쓴다.
              const hint = el?.getAttribute?.("placeholder") || "";
              blocked.add([sectionTitle(el), hint].filter(Boolean).join(" ") || entry.$name || "이름 없는 칸");
            }
          }
        };
        walk(formController, 0);
        if (formController && blocked.size === 0) steps.push("저장 전 검증 통과");
        else if (blocked.size > 0) warnings.push(`저장 전 확인: ${[...blocked].join(" · ")}`);
        window.scrollTo(0, 0);

        return { ok: true, steps, warnings, submitted: false };
      } finally {
        // 사람이 이어서 쓸 화면이다. 대화상자는 원래대로 돌려준다.
        releaseDialogs();
      }
    })();
  }

  calls["smartstore.fill"] = (payload) => fillSmartstoreProductForm(payload || {});
})();
