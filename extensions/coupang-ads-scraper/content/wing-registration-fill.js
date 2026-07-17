// wing-registration-fill.js
// 쿠팡 WING 상품등록(formV2) 페이지 자동 채움 — 단일 상품 직접 등록.
// background(service-worker)가 formV2 탭을 열고 { action: 'fillWingForm', product } 를 보내면
// 리버스한 순서대로 폼을 채운다. ⚠️ 제출(상품등록)은 절대 자동으로 누르지 않는다 — 사용자가 확인 후 직접.
//
// product 형태(WingProduct, wing-registration-flow.ts):
//   { categoryCell:"[77390] 완구/취미>스포츠/야외완구>물총", productName, brand, maker,
//     searchKeyword, searchOptions:[{type,value}], additionalImageUrls:[], detailImageUrl,
//     noticeCategory, noticeValues:[], variants:[{ purchaseOptions:[{type,value}], salePrice, origPrice, stock, representativeImageUrl }] }

(function () {
  'use strict';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(getter, { timeout = 15000, interval = 300 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const v = getter();
        if (v) return v;
      } catch (_) {}
      await sleep(interval);
    }
    return null;
  }

  // React 제어 인풋에 값 주입(네이티브 setter + input/change 이벤트).
  function setReactValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const byPlaceholder = (ph) => document.querySelector(`input[placeholder="${ph}"], textarea[placeholder="${ph}"]`);
  const btnByText = (text, root = document) =>
    [...root.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === text);
  const elByExactText = (text) =>
    [...document.querySelectorAll('li,div,span,button,a')].find(
      (e) => (e.textContent || '').trim() === text,
    );

  async function fillWingForm(product) {
    const steps = [];
    const log = (s) => steps.push(s);

    // 1) 판매방식: 판매자배송(기본 체크). 로켓그로스 건드리지 않음.
    //    (formV2 는 판매자배송이 기본 체크되어 있어 별도 조작 불필요)

    // 2) 브랜드 없음(또는 자체제작)
    const selfMade = document.querySelector('input[name="selfMade"]');
    if (selfMade && !selfMade.checked) {
      selfMade.click();
      log('brandNone');
    }

    // 3) 노출상품명
    const nameInput =
      document.querySelector('input[name="InputWithCounter_2"]') ||
      byPlaceholder('상품 모델(해당 시) + 상품 유형 + 핵심 특징');
    if (nameInput && product.productName) {
      setReactValue(nameInput, product.productName);
      log('name');
    }

    // 4) 카테고리: "[코드] 대>중>소" → leaf 로 검색해 전체 경로 제안 클릭
    const pathText = String(product.categoryCell || '').replace(/^\[\d+\]\s*/, '').trim();
    const leaf = (pathText.split('>').pop() || '').trim();
    const catInput = byPlaceholder('카테고리명 입력');
    if (catInput && leaf) {
      catInput.focus();
      setReactValue(catInput, leaf);
      const opt = await waitFor(() => elByExactText(pathText), { timeout: 8000 });
      if (opt) {
        opt.click();
        log('category:' + pathText);
      } else {
        log('categoryNoSuggestion');
      }
      // 카테고리 선택 → 옵션/이미지 섹션 언락 대기
      await waitFor(() => byPlaceholder('옵션값 입력'), { timeout: 8000 });
      await sleep(800);
    }

    // 5) 옵션: 첫 variant 의 구매옵션(색상·수량) 값 입력 + 추가
    const variant = (product.variants || [])[0];
    if (variant && Array.isArray(variant.purchaseOptions)) {
      for (const opt of variant.purchaseOptions) {
        // 현재 열려있는 옵션값 입력(마지막 것) 사용
        const optInputs = [...document.querySelectorAll('input[placeholder="옵션값 입력"]')];
        const target = optInputs[optInputs.length - 1];
        if (!target) break;
        setReactValue(target, String(opt.value));
        await sleep(200);
        // 같은 행의 '추가' 버튼
        let el = target.closest('div');
        let addBtn = null;
        for (let i = 0; i < 5 && el && !addBtn; i++) {
          addBtn = btnByText('추가', el);
          el = el.parentElement;
        }
        if (addBtn) {
          addBtn.click();
          log('option:' + opt.type + '=' + opt.value);
          await sleep(600);
        }
      }
    }

    // 6) 이미지: "이미지 URL주소로 등록" — 대표+추가 이미지 URL
    const imageUrls = [
      variant && variant.representativeImageUrl,
      ...(product.additionalImageUrls || []),
    ].filter(Boolean);
    const imageUrlBtn = btnByText('이미지 URL주소로 등록');
    if (imageUrlBtn && imageUrls.length) {
      imageUrlBtn.click();
      await sleep(600);
      // 열린 URL 입력 영역에 주소들 입력 (모달/인풋 구조는 라이브에서 확정 필요)
      const urlBox =
        byPlaceholder('이미지 URL을 입력하세요.') ||
        document.querySelector('textarea, input[type="text"][placeholder*="URL"]');
      if (urlBox) {
        setReactValue(urlBox, imageUrls.join('\n'));
        log('imageUrls:' + imageUrls.length);
        const confirm = btnByText('등록') || btnByText('확인') || btnByText('적용');
        if (confirm) confirm.click();
      }
      await sleep(600);
    }

    // 7) 상세설명: "텍스트(HTML) 추가" — detailImageUrl(또는 상세 HTML)
    //    현재는 상세페이지 이미지 URL 을 <img> 로 감싸 삽입 시도.
    if (product.detailImageUrl) {
      const htmlBtn = btnByText('텍스트(HTML) 추가');
      if (htmlBtn) {
        htmlBtn.click();
        await sleep(600);
        const htmlBox = document.querySelector('textarea');
        if (htmlBox) {
          setReactValue(htmlBox, `<img src="${product.detailImageUrl}" style="max-width:100%" />`);
          log('detailHtml');
          const apply = btnByText('등록') || btnByText('적용') || btnByText('확인');
          if (apply) apply.click();
        }
      }
    }

    // 8) 상품정보제공고시 / 배송 / 반품 — 기본값 존재. 고시 값은 라이브에서 필드별 매핑 필요.
    //    ⚠️ 상품등록/임시저장 버튼은 누르지 않는다.

    return { ok: true, steps };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.action === 'fillWingForm') {
      fillWingForm(msg.product || {})
        .then((r) => sendResponse(r))
        .catch((e) => sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }));
      return true; // async response
    }
    return false;
  });
})();
