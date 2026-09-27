// 카카오 톡스토어 판매자센터 상품등록 폼 채우기(MAIN world, KID-256 — 옛 `background/orders/mall-form-register.js` `fillKakaoProductForm` 이식).
// 확장 런타임 몰 쓰기(`extensions/src/sites/kakao/registration.ts`)가 `content/page-call/form-fill.js`(쓰기 탭 도우미) 뒤에 넣고
// `kakao.fill`을 부른다. 인자는 명세·값 묶음뿐이다. 저장·임시저장·[등록]은 부르지 않는다(ADR-0019 — 몰 명세에 검증된 누르기가 없다).
(function installFillKakaoProductForm() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});

  /**
   * 카카오 톡스토어 상품등록 화면(`/product/store-seller/insert`)을 채운다 — 페이지(MAIN 월드)에서 돈다.
   *
   * Angular 운영 빌드라 폼 객체에 닿지 않는다. 사람이 하는 길 그대로 채운다 — 글자는 치고(`input`
   * 이벤트), 목록(`cu-dropdown`)은 펼쳐 고르고, 사진은 파일 칸에 넣는다. 끝나면 Angular 가 칸마다 매긴
   * `ng-invalid` 로 아직 받지 않은 칸을 알린다. [저장하기]·[상품정보 임시저장] 은 누르지 않고, 확인창은 거절한다.
   */
  function fillKakaoProductForm(payload) {
    return (async () => {
      const steps = [];
      const warnings = [];
      const said = [];
      const form = payload.form;
      const stepWait = payload.stepWaitMs || 12000;
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
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const visible = (el) => Boolean(el && el.isConnected && el.getClientRects().length > 0);
      // 폼 맨 위 칸만. 같은 이름이 칸 안에 또 있다 — 톡딜 할인 안에도 `stock` 이 있고 그게 먼저 나온다.
      const topControls = () => [...document.querySelectorAll("form [formcontrolname], form [formgroupname], form [formarrayname]")]
        .filter((element) => !element.parentElement.closest("[formcontrolname], [formgroupname], [formarrayname]"));
      const control = (name) => topControls().find((element) => element.getAttribute("formcontrolname") === name) || null;
      const textInputs = (root) => (root
        ? [...root.querySelectorAll("input")].filter((input) => visible(input) && !input.disabled
          && !["checkbox", "radio", "file", "hidden"].includes(String(input.type).toLowerCase()))
        : []);
      const buttonIn = (root, label) => (root
        ? [...root.querySelectorAll("button")].find((button) => visible(button) && clean(button.textContent) === label) || null
        : null);
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      // Angular 값 연결은 `input` 이벤트로 받고, 칸을 떠날 때(`blur`) 모양(천 단위 쉼표 등)을 다듬는다.
      const typeInto = (input, value) => {
        input.focus();
        valueSetter.call(input, String(value));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.blur();
        input.dispatchEvent(new Event("blur", { bubbles: true }));
      };
      const toFile = (image, fallback) => {
        const [head, encoded] = String(image.dataUrl).split(",");
        const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
        const binary = atob(encoded || "");
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        const extension = (mime.split("/")[1] || "jpg").replace("jpeg", "jpg");
        const base = String(image.fileName || image.name || fallback).replace(/\.[A-Za-z0-9]+$/, "") || fallback;
        return new File([bytes], `${base}.${extension}`, { type: mime });
      };
      /** 목록(`cu-dropdown`)을 펼쳐 글자가 같은 항목을 누른다. `verify` 면 고른 글자가 그대로 남았는지도 본다. */
      const pick = async (dropdown, label, verify = true) => {
        const option = () => [...(dropdown?.querySelectorAll("li a.link-opt") || [])]
          .find((link) => clean(link.textContent) === label);
        if (!option()) return false;
        dropdown.querySelector("a.link-selected")?.click();
        await sleep(150);
        const link = option();
        if (!link) return false;
        link.click();
        await sleep(300);
        return !verify || clean(dropdown.querySelector("a.link-selected")?.textContent) === label;
      };
      const dropdownWith = (root, label) => [...(root?.querySelectorAll("cu-dropdown") || [])]
        .find((box) => [...box.querySelectorAll("li a.link-opt")].some((link) => clean(link.textContent) === label)) || null;
      // 톡스토어 안내 · 확인 창(`_cu-popup-anim`). 무엇을 묻든 '예' 가 눌리는 일이 없게 취소 · 닫기로만 닫는다.
      const popups = () => [...document.querySelectorAll("div._cu-popup-anim")].filter(visible);
      const sweepPopups = () => {
        for (const popup of popups()) {
          const message = clean(popup.innerText || popup.textContent);
          if (message) said.push(message.slice(0, 200));
          (buttonIn(popup, "취소") || buttonIn(popup, "닫기"))?.click();
        }
      };
      const LABELS = {
        name: "상품명", categoryId: "카테고리", productOriginAreaInfo: "원산지", taxType: "부가세", certs: "인증정보",
        salePrice: "판매가", stock: "재고수량", option: "옵션", productImage: "상품이미지",
        productDetailDescription: "상품상세", announcementInfo: "상품정보고시", delivery: "배송정보",
        brand: "브랜드", manufacturer: "제조사", model: "모델명",
      };

      try {
        // 0) 화면. 로그아웃이면 카카오 계정 로그인 화면으로 넘어간다.
        const ready = await waitFor(() => {
          if (/accounts\.kakao\.com/i.test(location.hostname) || /\/login/i.test(location.pathname)
            || [...document.querySelectorAll('input[type="password"]')].some(visible)) return "login";
          return control("name") && control("categoryId") && control("productImage") ? "form" : null;
        }, payload.formWaitMs || 40000, 400);
        if (ready !== "form") {
          return { ok: false, noForm: true, error: "카카오 톡스토어 상품등록 화면을 찾지 못했습니다." };
        }
        sweepPopups();

        // 1) 상품명. 화면은 70자에서 자른다. 치면 AI 추천 카테고리를 불러온다.
        const nameInput = await waitFor(() => textInputs(control("name"))[0], stepWait);
        if (!nameInput) return { ok: false, error: "카카오 톡스토어 상품명 칸을 찾지 못했습니다." };
        typeInto(nameInput, form.productName);
        steps.push("상품명");

        // 2) 카테고리. 원산지 · 부가세 · 인증 칸이 이걸 골라야 생긴다.
        const categoryRoot = control("categoryId");
        const levels = () => [...categoryRoot.querySelectorAll("lib-form-cascading-item")];
        const chosen = () => levels()
          .map((item) => clean(item.querySelector("a.link-selected")?.textContent))
          // 고르지 않은 단계는 `세분류`·`세분류 카테고리 없음` 같은 안내 글자를 띄운다.
          .filter((name) => name && !/^(대|중|소|세)분류/.test(name));
        let categoryPath = "";
        if (form.categoryId) {
          // 단계 이름은 카테고리 API 가 안다. 맨 앞 세 자리(식품/유아동 같은 대대분류)는 화면 목록에 없다.
          const names = [];
          for (let end = 6; end <= form.categoryId.length; end += 3) {
            const response = await fetch(`/api/tstore/categories/${form.categoryId.slice(0, end)}`, {
              credentials: "include",
              headers: { accept: "application/json" },
            }).catch(() => null);
            const json = response && response.ok ? await response.json().catch(() => null) : null;
            if (!json || !json.name) {
              names.length = 0;
              break;
            }
            names.push(clean(json.name));
          }
          for (let level = 0; level < names.length; level += 1) {
            const dropdown = await waitFor(() => {
              const item = levels()[level];
              if (!item || item.classList.contains("cascading-item-disabled")) return null;
              const box = item.querySelector("cu-dropdown");
              return box && [...box.querySelectorAll("li a.link-opt")].some((link) => clean(link.textContent) === names[level])
                ? box
                : null;
            }, stepWait);
            if (!dropdown || !(await pick(dropdown, names[level]))) break;
          }
          if (names.length > 0 && chosen().join(">") === names.join(">")) {
            categoryPath = names.join(">");
            steps.push(`카테고리 ${categoryPath}`);
          } else {
            warnings.push(`카테고리 ${form.categoryId} 를 고르지 못해 톡스토어 AI 추천으로 고릅니다.`);
          }
        }
        if (!categoryPath) {
          const choice = await waitFor(
            () => [...document.querySelectorAll(".box_recommcate button.btn_choice")].find(visible),
            stepWait,
            300,
          );
          if (choice) {
            choice.click();
            await waitFor(() => chosen().length > 0, stepWait);
            categoryPath = chosen().join(">");
            if (categoryPath) steps.push(`카테고리(톡스토어 AI 추천) ${categoryPath}`);
          }
        }
        if (!categoryPath) {
          warnings.push("카테고리를 고르지 못했습니다. 카테고리를 고른 뒤 원산지 · 인증을 확인하세요.");
        }

        // 3) 원산지. 구분 → 지역 → 나라 목록이 앞 칸을 고를 때마다 이어진다. 카테고리를 고른 직후에는 화면이
        //    카테고리 정보를 받아 원산지 칸을 다시 그린다 — 그 전에 고르면 되돌아간다(라이브 2026-09-18).
        //    그래서 칸이 선 뒤 잠깐 기다리고, 다 고른 뒤에도 그대로인지 보고 한 번 더 고른다.
        const originPath = [form.origin.type, form.origin.region, form.origin.country].filter(Boolean);
        const originBoxes = () => [...(control("productOriginAreaInfo")?.querySelectorAll("cu-dropdown") || [])].filter(visible);
        const originShown = () => originBoxes().map((box) => clean(box.querySelector("a.link-selected")?.textContent));
        await waitFor(() => originBoxes()[0]?.querySelector("li a.link-opt"), stepWait);
        await sleep(1000);
        let originSet = false;
        for (let attempt = 0; attempt < 2 && !originSet && originPath.length > 0; attempt += 1) {
          let done = 0;
          for (let level = 0; level < originPath.length; level += 1) {
            const dropdown = await waitFor(() => {
              const box = originBoxes()[level];
              return box && [...box.querySelectorAll("li a.link-opt")].some((link) => clean(link.textContent) === originPath[level])
                ? box
                : null;
            }, stepWait);
            if (!dropdown || !(await pick(dropdown, originPath[level]))) break;
            done += 1;
          }
          await sleep(600);
          originSet = done === originPath.length && originShown().slice(0, originPath.length).join(">") === originPath.join(">");
        }
        if (originSet) steps.push(`원산지 ${originPath.join(" > ")}`);
        else warnings.push(`원산지를 '${originPath.join(" > ")}' 로 고르지 못했습니다. 직접 고르세요.`);

        // 4) 인증. 목록에서 고르면 줄(`lib-form-cert-item`)이 생긴다. 번호를 넣고 [인증번호확인] 으로 KC 조회만 돌린다.
        if (form.cert) {
          const certRoot = () => control("certs");
          const rows = () => [...(certRoot()?.querySelectorAll("lib-form-cert-item") || [])];
          const before = rows().length;
          const dropdown = await waitFor(() => dropdownWith(certRoot(), form.cert.type), stepWait);
          const added = dropdown && (await pick(dropdown, form.cert.type, false))
            ? await waitFor(() => (rows().length > before ? rows()[rows().length - 1] : null), stepWait)
            : null;
          const numberInput = added ? textInputs(added)[0] : null;
          if (!numberInput) {
            warnings.push(`인증 '${form.cert.type}' 줄을 만들지 못했습니다. 인증번호 ${form.cert.number} 를 직접 넣으세요.`);
          } else {
            typeInto(numberInput, form.cert.number);
            const lookup = buttonIn(added, "인증번호확인");
            if (!lookup) {
              warnings.push(`인증번호 ${form.cert.number} 를 넣었습니다. [인증번호확인] 을 눌러 주세요.`);
            } else {
              const saidBefore = said.length;
              lookup.click();
              const answer = await waitFor(() => {
                const model = textInputs(added).find((input) => input !== numberInput && clean(input.value));
                if (model) return { model: clean(model.value) };
                const popup = popups()[0];
                if (popup) return { message: clean(popup.innerText || popup.textContent).slice(0, 200) };
                return said.length > saidBefore ? { message: said[said.length - 1] } : null;
              }, stepWait, 300);
              if (answer?.model) steps.push(`KC 인증 ${form.cert.number} 확인(모델명 ${answer.model})`);
              else {
                warnings.push(`KC 인증번호 ${form.cert.number} 조회 결과를 받지 못했습니다${answer?.message ? `: ${answer.message}` : ""}. 인증정보를 확인하세요.`);
                sweepPopups();
              }
            }
          }
        }

        // 5) 판매가 · 재고.
        const priceInput = textInputs(control("salePrice"))[0];
        if (priceInput) {
          typeInto(priceInput, String(form.salePrice));
          steps.push(`판매가 ${form.salePrice}원`);
        } else {
          warnings.push("판매가 칸을 찾지 못했습니다.");
        }
        const stockInput = textInputs(control("stock"))[0];
        if (stockInput) {
          typeInto(stockInput, String(form.stock));
          steps.push(`재고 ${form.stock}`);
        } else {
          warnings.push("재고수량 칸을 찾지 못했습니다.");
        }

        // 6) 상품이미지. 사람이 고르는 파일 칸에 넣으면 화면이 `/api/tstore/images` 로 올리고 썸네일을 그린다.
        //    첫 칸(`box_img_register`)이 대표, 끌어 옮기는 다섯 칸이 추가이미지다.
        const imageRoot = control("productImage");
        const images = (payload.images || []).slice(0, payload.maxImages || 6);
        const hasImage = (card) => [...card.querySelectorAll("img")].some((img) => img.getAttribute("src"));
        const putImage = async (card, image, index) => {
          const input = card?.querySelector('input[type="file"]');
          if (!input) return false;
          const transfer = new DataTransfer();
          transfer.items.add(toFile(image, `kakao${index}`));
          input.files = transfer.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
          return Boolean(await waitFor(() => hasImage(card), stepWait, 300));
        };
        if (images.length === 0) {
          warnings.push("상품이미지가 없습니다. 대표이미지를 직접 넣으세요.");
        } else {
          let placed = 0;
          if (await putImage(imageRoot?.querySelector(".box_img_register"), images[0], 0)) placed += 1;
          else warnings.push("대표이미지를 올리지 못했습니다. 상품이미지 첫 칸에 직접 넣으세요.");
          for (let index = 1; index < images.length; index += 1) {
            const card = [...(imageRoot?.querySelectorAll(".cdk-drop-list .card-register") || [])]
              .find((candidate) => !hasImage(candidate));
            if (!card) {
              warnings.push(`추가이미지 칸이 모자라 ${images.length - index}장은 넣지 못했습니다.`);
              break;
            }
            if (await putImage(card, images[index], index)) placed += 1;
            else warnings.push(`추가이미지 ${index}번째를 올리지 못했습니다.`);
          }
          if (placed > 0) steps.push(`상품이미지 ${placed}장`);
        }

        // 7) 상세설명. 편집기(CKEditor 4)가 사진을 넣을 때 쓰는 업로드(`type=EDITOR`)로 올려 그 주소로 넣는다.
        let detailHtml = payload.detailHtml || "";
        if (payload.detailImage?.dataUrl) {
          try {
            const body = new FormData();
            body.append("type", "EDITOR");
            body.append("ratio", "NONE");
            body.append("image[]", toFile(payload.detailImage, "detail"));
            const response = await fetch("/api/tstore/images", {
              method: "POST",
              body,
              credentials: "include",
              headers: { accept: "application/json" },
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            const entry = Array.isArray(result) ? result[0] : result;
            const hosted = String(entry?.data?.originUrl || "").trim();
            if (entry?.result !== "SUCCESS" || !/^https:\/\/[^/]*kakaocdn\.net\//.test(hosted)) {
              throw new Error("응답에 이미지 주소가 없습니다");
            }
            detailHtml = `<center><img src="${hosted}"></center>`;
            steps.push("상세이미지 톡스토어 업로드");
          } catch (error) {
            warnings.push(`상세이미지를 톡스토어에 올리지 못했습니다: ${error?.message || error}`);
          }
        }
        const editor = window.CKEDITOR?.instances?.editor1 || Object.values(window.CKEDITOR?.instances || {})[0];
        if (detailHtml && editor) {
          await new Promise((resolve) => {
            setTimeout(resolve, stepWait);
            try {
              editor.setData(detailHtml, { callback: resolve });
            } catch {
              resolve();
            }
          });
          editor.fire("change");
          const accepted = await waitFor(
            () => !control("productDetailDescription")?.classList.contains("ng-invalid"),
            Math.min(3000, stepWait),
          );
          if (accepted) steps.push("상세설명");
          else warnings.push("상세설명을 넣었지만 화면이 받지 않았습니다. 상품상세 칸을 확인하세요.");
        } else {
          warnings.push("상세설명에 넣을 이미지가 없습니다. 상품상세에 직접 넣으세요.");
        }

        // 8) 상품정보고시. 설정 창에서 상품군을 고르고, 칸마다 값을 치거나 `상품상세설명 참조` 를 체크한 뒤
        //    그 창의 [확인] 으로 폼에 넣는다 — 창 안에서만 쓰는 적용 단추다. 상품 [저장하기] 가 아니다.
        const noticeOpen = buttonIn(control("announcementInfo"), "상품정보고시 설정");
        const layer = noticeOpen
          ? (noticeOpen.click(), await waitFor(() => popups().find((popup) => /상품정보고시 설정/.test(popup.textContent || "")), stepWait))
          : null;
        if (!layer) {
          warnings.push("상품정보고시 설정 창을 열지 못했습니다. 직접 넣으세요.");
        } else {
          // 첫 목록은 판매자 템플릿, 상품군 이름이 그대로 있는 목록이 상품군이다.
          const group = await waitFor(() => dropdownWith(layer, form.notice.group), stepWait);
          const noticeRows = () => [...layer.querySelectorAll(".field-row")].filter(visible);
          if (!group || !(await pick(group, form.notice.group))) {
            warnings.push(`상품정보고시 상품군 '${form.notice.group}' 을 고르지 못했습니다. 직접 넣으세요.`);
            buttonIn(layer, "취소")?.click();
          } else {
            await waitFor(() => noticeRows().some((row) => row.querySelector("cu-textbox input, textarea")), stepWait);
            const keys = Object.keys(form.notice.values);
            let typed = 0;
            let referred = 0;
            for (const row of noticeRows()) {
              const label = clean(row.querySelector("strong.tit-field")?.childNodes[0]?.textContent);
              const input = row.querySelector("cu-textbox input, textarea");
              const refer = row.querySelector('cu-checkbox input[type="checkbox"]');
              if (!label || !input || !refer) continue;
              const key = keys.find((candidate) => label.startsWith(candidate));
              const value = key ? form.notice.values[key] : "";
              if (value) {
                if (refer.checked) {
                  refer.click();
                  await sleep(120);
                }
                typeInto(input, value);
                typed += 1;
              } else {
                if (!refer.checked) {
                  refer.click();
                  await sleep(120);
                }
                referred += 1;
              }
            }
            buttonIn(layer, "확인")?.click();
            const closed = await waitFor(() => !visible(layer), stepWait);
            if (closed) {
              steps.push(`상품정보고시 ${form.notice.group} (값 ${typed} · 상품상세설명 참조 ${referred})`);
            } else {
              const errors = [...new Set([...layer.querySelectorAll("*")]
                .filter((element) => visible(element) && !element.children.length && /입력해주세요|선택해주세요/.test(element.textContent))
                .map((element) => clean(element.textContent)))];
              warnings.push(`상품정보고시 창이 닫히지 않았습니다${errors.length ? `: ${errors.slice(0, 3).join(" / ")}` : ""}. 창에서 확인하세요.`);
            }
          }
        }

        // 9) 배송. 판매자 배송비 템플릿을 고르면 조건부 무료 · A/S 안내문구 · 도서산간 비용이 따라온다.
        if (form.deliveryTemplate) {
          const box = await waitFor(() => dropdownWith(control("delivery"), form.deliveryTemplate), Math.min(5000, stepWait));
          if (box && (await pick(box, form.deliveryTemplate))) steps.push(`배송비 템플릿 ${form.deliveryTemplate}`);
          else warnings.push(`배송비 템플릿 '${form.deliveryTemplate}' 을 찾지 못했습니다. 배송비를 확인하세요.`);
        }

        // 10) 브랜드 · 제조사 · 판매자 상품코드. 글자만 치면 받는다(검색 창을 열지 않는다).
        for (const [name, value, label] of [
          ["brand", form.brand, "브랜드"],
          ["manufacturer", form.manufacturer, "제조사"],
          ["storeManagementCode", form.sellerCode, "판매자 상품코드"],
        ]) {
          if (!value) continue;
          const input = textInputs(control(name))[0];
          if (input) {
            typeInto(input, value);
            steps.push(`${label} ${value}`);
          } else {
            warnings.push(`${label} 칸을 찾지 못했습니다.`);
          }
        }

        // 11) 추천 리워드. 화면 기본은 켜짐이고 기존 등록물은 끈다.
        const reward = [...(control("affiliate")?.querySelectorAll('input[type="checkbox"]') || [])].find(visible);
        if (reward && reward.checked !== form.affiliate) {
          reward.click();
          await sleep(200);
        }
        if (reward && reward.checked === form.affiliate) steps.push(form.affiliate ? "추천 리워드 켬" : "추천 리워드 끔");

        // 12) 화면이 아직 받지 않은 칸을 알린다(Angular 가 칸마다 매기는 상태). 저장은 사람이 누른다.
        await sleep(300);
        sweepPopups();
        const pending = [...new Set(topControls()
          .filter((element) => element.classList.contains("ng-invalid"))
          .map((element) => {
            const name = element.getAttribute("formcontrolname") || element.getAttribute("formgroupname")
              || element.getAttribute("formarrayname");
            return LABELS[name] || name;
          }))];
        if (pending.length > 0) warnings.push(`아직 화면이 받지 않은 칸: ${pending.join(", ")}`);
        else steps.push("필수 칸 확인");
        for (const message of new Set(said)) {
          if (message && !warnings.some((warning) => warning.includes(message))) warnings.push(`몰 안내: ${message}`);
        }
        window.scrollTo(0, 0);
        return { ok: true, steps, warnings, submitted: false };
      } finally {
        releaseDialogs();
      }
    })();
  }

  calls["kakao.fill"] = (payload) => fillKakaoProductForm(payload || {});
})();
