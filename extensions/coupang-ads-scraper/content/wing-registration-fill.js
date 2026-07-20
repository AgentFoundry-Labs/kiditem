// wing-registration-fill.js
// 쿠팡 WING 상품등록(formV2) 페이지 자동 채움 — 단일 상품 직접 등록.
// background(service-worker)가 formV2 탭을 열고 { action: 'fillWingForm', product, autoSubmit } 를 보내면
// 리버스한 순서대로 폼을 채운다.
//
// ⚠️ 제출(상품등록)은 **기본적으로 절대 누르지 않는다**. 사용자가 확인 후 직접 누른다.
//    웹의 등록 확인 모달에서 "상품등록까지 자동 실행"을 켠 경우에만 `autoSubmit: true` 가 실려 오고,
//    그때만 submitWingForm() 이 폼 하단의 제출 버튼을 누른다. 옵트인이 아니면 버튼을 찾지도 않는다.
//    제출은 2단계다: 폼 하단 '상품등록' → WING 확인 모달('판매요청 하시겠습니까?')의 '상품등록'.
//    두 번째 클릭이 없으면 아무것도 등록되지 않는다. 자세한 DOM 은 CONFIRM_MODAL_SELECTOR 주석 참조.
//
// product 형태(WingProduct, wing-registration-flow.ts):
//   { categoryCell:"[64687] 생활용품>생활소품>열쇠고리/키홀더", productName, sellerProductName,
//     brand, maker,
//     searchKeyword, searchOptions:[{type,value}], additionalImageUrls:[], detailImageUrls:[],
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
  /**
   * 공백을 모두 제거하고 비교한다.
   * 카테고리 제안은 `생활용품>생활소품>열쇠고리/키홀더` 로 보이지만 DOM 은 `>` 주변이나
   * 중첩 요소 사이에 공백/개행을 넣는다. trim 만으로는 절대 일치하지 않아
   * 제안이 화면에 떠 있는데도 클릭을 못 하는 문제가 있었다.
   */
  const normText = (s) => (s || '').replace(/\s+/g, '');
  const elByExactText = (text) => {
    const target = normText(text);
    const matches = [...document.querySelectorAll('li,div,span,button,a')].filter(
      (e) => normText(e.textContent) === target && e.offsetParent !== null,
    );
    // 같은 텍스트를 감싸는 조상이 여럿 걸리므로 가장 안쪽(마지막) 요소를 클릭 대상으로 쓴다.
    return matches[matches.length - 1] || null;
  };

  /**
   * 옵션 목록 표(`.option-content`)의 체크박스들.
   *
   * 라이브 실측(formV2, 2026-07): 이 표는 `<table>` 이 아니라 div 그리드다.
   *   .option-content
   *     .option-pane-table-head  … span.sc-common-check > input  ← 전체선택
   *     .option-pane-table-content
   *       .option-pane-table-row > .option-pane-table-cell.checkbox > span.sc-common-check > input
   *
   * ⚠️ `.option-content` 안에는 '판매자 자동가격조정'·'묶음배송' 토글도 checkbox 로 들어 있다.
   *    그것들은 `label > input` 이라 `span.sc-common-check > input` 로 좁히면 걸리지 않는다.
   */
  const OPTION_ROOT_SELECTOR = '.option-content';
  const OPTION_SELECT_ALL_SELECTOR =
    '.option-pane-table-head span.sc-common-check > input[type="checkbox"]';
  const OPTION_ROW_CHECK_SELECTOR =
    '.option-pane-table-content .option-pane-table-cell.checkbox span.sc-common-check > input[type="checkbox"]';

  function optionRowChecks() {
    const root = document.querySelector(OPTION_ROOT_SELECTOR);
    return root ? [...root.querySelectorAll(OPTION_ROW_CHECK_SELECTOR)] : [];
  }

  /**
   * 일괄입력 전에 옵션 행을 선택한다.
   *
   * ⭐ 라이브 실증: **행을 선택하지 않으면 일괄입력이 조용히 무시된다.**
   *    다이얼로그는 정상적으로 뜨고 '저장'도 눌리지만 행의 판매가/재고수량은 빈 채로 남는다.
   *    (재고수량 999 를 미선택 상태로 저장 → 행 입력칸 여전히 빈값,
   *     전체선택 후 동일 저장 → 999 반영. 판매가도 동일)
   *    에러도 토스트도 없어서 "자동채움이 됐는데 값만 없는" 상태가 된다.
   *
   * 전체선택 체크박스는 React 상태를 거쳐 각 행에 전파되므로 한 틱 기다린 뒤 확인한다.
   */
  async function selectAllOptionRows(log = () => {}) {
    const root = document.querySelector(OPTION_ROOT_SELECTOR);
    if (!root) {
      log('optionSelect:noTable');
      return false;
    }
    if (optionRowChecks().length === 0) {
      log('optionSelect:noRows');
      return false;
    }

    const selectAll = root.querySelector(OPTION_SELECT_ALL_SELECTOR);
    if (selectAll && !selectAll.checked) selectAll.click();

    const settled = await waitFor(
      () => {
        const rows = optionRowChecks();
        return rows.length > 0 && rows.every((row) => row.checked) ? rows.length : null;
      },
      { timeout: 4000, interval: 200 },
    );
    if (settled) {
      log(`optionSelect:${settled}`);
      return true;
    }

    // 전체선택이 전파되지 않으면 행 체크박스를 하나씩 누른다.
    for (const row of optionRowChecks()) {
      if (!row.checked) row.click();
    }
    const rows = optionRowChecks();
    const ok = rows.length > 0 && rows.every((row) => row.checked);
    log(ok ? `optionSelect:rows:${rows.length}` : 'optionSelect:failed');
    return ok;
  }

  /**
   * WING 의 '판매가 일괄입력' / '재고수량 일괄입력' 처리.
   * 버튼을 누르면 number 인풋이 하나 새로 뜨고, 값을 넣고 '확인'을 누르면 전 옵션 행에 적용된다.
   * 행별 입력칸을 직접 찾는 것보다 DOM 변화에 훨씬 덜 민감하다.
   *
   * ⚠️ 호출 전에 반드시 `selectAllOptionRows()` 로 행을 선택해야 한다(위 주석 참조).
   */
  async function bulkFillByButton(buttonText, value) {
    const trigger = btnByText(buttonText);
    if (!trigger) return false;

    const before = document.querySelectorAll('input[type="number"]').length;
    trigger.click();

    const input = await waitFor(
      () => {
        const nums = [...document.querySelectorAll('input[type="number"]')];
        return nums.length > before ? nums[nums.length - 1] : null;
      },
      { timeout: 5000 },
    );
    if (!input) return false;

    setReactValue(input, String(value));
    await sleep(400);

    // 일괄입력 다이얼로그의 적용 버튼은 '확인'이 아니라 **'저장'** 이다.
    // ⚠️ 문서 전역에서 '확인'을 찾아 누르면 화면에 없는 별점 설문의 확인이 눌려
    //    "별점을 선택해주세요" 모달이 뜨고 이후 작업이 전부 막힌다. 반드시 이 입력칸을
    //    감싸는 다이얼로그 안에서 '저장'만 찾는다.
    const save = btnWithinAncestors(input, '저장');
    if (!save) return false;
    save.click();
    await sleep(900);
    return true;
  }

  function blobToFile(blob, url) {
    const mime = blob.type || 'image/jpeg';
    const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const base = (url.split('/').pop() || 'image').split('?')[0];
    return new File([blob], /\.\w+$/.test(base) ? base : `${base}.${ext}`, { type: mime });
  }

  /**
   * 이미지 bytes 를 File 로 받아온다.
   *
   * 라이브 확인: wing.coupang.com 에서 로컬 MinIO(localhost:9000) 로의 fetch 가 **직접 성공**한다.
   * 그래서 직접 받는 것을 1순위로 두고, 실패할 때만 background 중계로 넘어간다.
   * (예전에는 background 중계 → data URL → fetch(dataUrl) 3단계를 거쳤는데,
   *  마지막 단계가 페이지 CSP 에 막혀 이미지가 조용히 실패했다.)
   */
  async function fetchImageFile(url) {
    try {
      const res = await fetch(url);
      if (res.ok) return blobToFile(await res.blob(), url);
    } catch (_) {
      /* 아래 background 중계로 폴백 */
    }

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'fetchImageAsDataUrl', url }, (res) => {
        if (chrome.runtime.lastError || !res?.ok || !res.dataUrl) return resolve(null);
        try {
          const [head, b64] = String(res.dataUrl).split(',');
          const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
          resolve(blobToFile(new Blob([bytes], { type: mime }), url));
        } catch {
          resolve(null);
        }
      });
    });
  }

  /**
   * ★ 쿠팡 이미지 업로더는 React 가 아니라 **Dropzone.js**(Vue 래퍼)다.
   *
   * 라이브 확인한 DOM:
   *   <div id="image-uploader-492" class="customdropzone dz-clickable">
   *     <div class="dz-message"><div class="dropzone-custom-content">…
   *
   * Dropzone 은 `clickable` 모드에서 **hiddenFileInput 을 `document.body` 직속 자식으로**
   * 만들어 둔다. 라이브 확인: `image/` accept 를 가진 file input 두 개의 부모가 전부 `BODY`.
   * 즉 **파일 input 은 드롭존의 자손이 아니다.** 그래서
   *   - input 조상을 타고 올라가 드롭존을 찾는 방식은 **원리적으로 실패**하고
   *   - `input.files = dt.files` + `change` 도 Dropzone 이 듣지 않아 무시된다
   *     (Dropzone 은 자기 input 의 change 만 자기 핸들러로 듣는데, 우리가 만든 이벤트는
   *      files 를 이미 세팅한 뒤라 내부 큐(`addFile`)를 타지 않는다).
   *
   * 결론: **드롭존 엘리먼트에 직접 drop 을 쏴야 한다.** 문서 순서 = 대표(0) / 추가(1).
   */
  const DROP_ZONE_SELECTOR = '.customdropzone, .dropzone';

  function visibleDropZones() {
    return [...document.querySelectorAll(DROP_ZONE_SELECTOR)].filter((z) => z.offsetParent !== null);
  }

  /** '추가이미지 (n/9)' 카운터의 n. 없으면 null. */
  function readExtraImageCounter() {
    const m = (document.body.innerText || '').match(/추가\s*이미지[^(]{0,20}\((\d+)\s*\/\s*(\d+)\)/);
    return m ? Number(m[1]) : null;
  }

  /**
   * 성공 판정 스코프. 드롭존이 속한 `.element-row`(대표이미지 / 추가이미지 한 덩어리)로 좁힌다.
   * body 전체를 보면 숨은 모달의 img 80여 개가 섞여 판정이 무뎌진다.
   */
  function uploadScope(zone, input) {
    if (zone) return zone.closest('.element-row') || zone.parentElement || zone;
    return input?.parentElement || document.body;
  }

  /**
   * 업로드 성공 판정용 스냅샷.
   * ⚠️ Dropzone 은 미리보기를 blob:/data: 로 만들지 않는다 — 드롭 즉시 쿠팡 CDN 으로
   *    업로드하고 `//image.coupangcdn.com/image/vendor_inventory/…` 를 src 로 넣는다.
   *    (라이브 확인) 따라서 blob: 만 세면 대표이미지는 영영 실패로 잡힌다.
   *    **src 가 비어 있지 않은 img 의 수**를 센다.
   * 아이콘 img 도 같이 세지지만 전/후 차이로만 판단하므로 문제되지 않는다.
   */
  function uploadSnapshot(scope) {
    const imgs = scope ? [...scope.querySelectorAll('img')] : [];
    return {
      counter: readExtraImageCounter(),
      imgs: imgs.length,
      loaded: imgs.filter((im) => (im.getAttribute('src') || '').trim() !== '').length,
      ready: imgs.filter(
        (im) =>
          (im.getAttribute('src') || '').trim() !== '' &&
          im.complete &&
          Number(im.naturalWidth) > 0,
      ).length,
    };
  }

  /** 스냅샷이 "업로드가 실제로 반영됐다"고 볼 만큼 변했는가. */
  function uploadAccepted(before, after) {
    if (before.counter !== null && after.counter !== null && after.counter > before.counter) return true;
    if (after.loaded > before.loaded) return true;
    return after.imgs > before.imgs;
  }

  /** 드롭은 쿠팡 CDN 업로드를 동반하므로 장당 넉넉히 기다린다. */
  async function waitForUploadAccepted(scope, before, timeout) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      await sleep(400);
      if (uploadAccepted(before, uploadSnapshot(scope))) return true;
    }
    return false;
  }

  function makeDataTransfer(files) {
    const dt = new DataTransfer();
    for (const file of files) dt.items.add(file);
    return dt;
  }

  /**
   * dragenter → dragover → drop 을 **같은 DataTransfer** 로 디스패치한다.
   * Dropzone 은 drop 핸들러에서 `e.dataTransfer.files` 를 읽으므로 이 셋이면 충분하다.
   * DragEvent 생성자가 dataTransfer 를 못 받는 환경에서는 Event 에 직접 붙인다.
   */
  function dispatchDropSequence(zone, files) {
    const dt = makeDataTransfer(files);
    for (const type of ['dragenter', 'dragover', 'drop']) {
      let ev;
      try {
        ev = new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: dt });
      } catch (_) {
        ev = new Event(type, { bubbles: true, cancelable: true });
      }
      if (!ev.dataTransfer) {
        try {
          Object.defineProperty(ev, 'dataTransfer', { value: dt });
        } catch (_) {}
      }
      zone.dispatchEvent(ev);
    }
  }

  /**
   * 이미지 파일들을 n 번째 업로더에 넣는다(0=대표, 1=추가).
   *
   * 1순위: 드롭존 드래그앤드롭 — 라이브에서 유일하게 동작하는 경로.
   * 2순위: 예전 `input.files` + `change` 폴백. 현재 WING 에서는 안 먹지만
   *        업로더가 교체될 경우를 대비해 남긴다.
   * 성공/실패는 카운터·미리보기 변화로 판정해 steps 로그에 남긴다.
   *
   * ⚠️ 인덱스가 안 맞으면 **차라리 실패시킨다.** 대표이미지를 추가이미지 칸에 넣는 것은
   *    조용한 오등록이라 실패보다 나쁘다. 다른 인덱스 드롭존으로 재시도하지 않는다.
   */
  async function uploadImagesToInput(inputIndex, urls, log = () => {}) {
    const tag = inputIndex === 0 ? 'rep' : 'extra';

    const zone = visibleDropZones()[inputIndex] || null;
    const target =
      [...document.querySelectorAll('input[type="file"]')].filter((el) => /image\//.test(el.accept || ''))[
        inputIndex
      ] || null;
    if (!zone && !target) {
      log(`image:${tag}:noTarget`);
      return false;
    }

    const files = (await Promise.all(urls.slice(0, 10).map(fetchImageFile))).filter(Boolean);
    if (files.length === 0) {
      log(`image:${tag}:fetchFailed`);
      return false;
    }
    // 대표이미지는 1장만 받는다. multiple 은 추가이미지(최대 9장).
    const payload = inputIndex === 0 ? files.slice(0, 1) : files.slice(0, 9);

    const scope = uploadScope(zone, target);
    const before = uploadSnapshot(scope);
    const timeout = 8000 + 4000 * payload.length;

    // 1) 드롭존 드래그앤드롭
    if (zone) {
      dispatchDropSequence(zone, payload);
      if (await waitForUploadAccepted(scope, before, timeout)) {
        log(`image:${tag}:drop:${payload.length}`);
        return true;
      }
      log(`image:${tag}:dropRejected`);
    } else {
      log(`image:${tag}:noDropZone`);
    }

    // 2) 폴백: DataTransfer + change
    if (target) {
      target.files = makeDataTransfer(payload).files;
      target.dispatchEvent(new Event('change', { bubbles: true }));
      if (await waitForUploadAccepted(scope, before, timeout)) {
        log(`image:${tag}:change:${payload.length}`);
        return true;
      }
    }

    log(`image:${tag}:notAccepted`);
    return false;
  }

  /**
   * WING HTML 상세설명이 참조할 수 있는 쿠팡 vendor_inventory CDN URL 만 허용한다.
   * 로컬 MinIO URL 을 HTML 에 직접 넣으면 판매 페이지의 구매자 브라우저에서는 열리지 않는다.
   */
  function normalizeVendorInventoryCdnUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const raw = value.trim().startsWith('//') ? `https:${value.trim()}` : value.trim();
      const url = new URL(raw, window.location.href);
      if (!/^image\d*\.coupangcdn\.com$/i.test(url.hostname)) return null;
      if (!url.pathname.startsWith('/image/vendor_inventory/')) return null;
      if (!/^https?:$/.test(url.protocol)) return null;
      if (url.port || url.username || url.password) return null;
      url.protocol = 'https:';
      url.hash = '';
      return url.href;
    } catch (_) {
      return null;
    }
  }

  function buildDetailHtml(cdnUrl) {
    return `<center> <img src="${cdnUrl}"> </center>`;
  }

  function isVisible(el) {
    if (!el || el.isConnected === false) return false;
    if (typeof el.getClientRects === 'function' && el.getClientRects().length > 0) return true;
    return el.offsetParent !== null;
  }

  /**
   * uploadV2 응답 message 의 허용 형태: `vendor_inventory/...` 단일 상대 경로.
   * URL, 배열, traversal, query/hash, 공백·역슬래시가 섞인 값은 모두 거부한다.
   */
  function normalizeVendorInventoryPath(value) {
    if (typeof value !== 'string') return null;
    if (value !== value.trim()) return null;
    const path = value;
    if (!path || path.length > 2048) return null;
    if (!path.startsWith('vendor_inventory/')) return null;
    if (!/^[A-Za-z0-9._/-]+$/.test(path)) return null;
    if (path.includes('\\') || path.includes('?') || path.includes('#')) return null;
    const segments = path.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
    return path;
  }

  /**
   * 긴 이미지를 WING 의 단일 파일 업로드 API 로 보내 CDN URL 한 개를 얻는다.
   * 상세 이미지 모달(auto-split-image)은 15,760px 이미지를 여러 장으로 쪼개므로 쓰지 않는다.
   * 이 호출은 CDN staging 만 수행하며 상품등록/임시저장은 절대 누르지 않는다.
   */
  async function uploadDetailImageToCoupang(sourceUrl, log) {
    const file = await fetchImageFile(sourceUrl);
    if (!file) {
      log('detailFetchFailed');
      return null;
    }

    const form = new FormData();
    form.append('multipartFile', file, file.name);
    let response;
    try {
      response = await fetch('/tenants/seller-web/file/resize/uploadV2', {
        method: 'POST',
        credentials: 'same-origin',
        body: form,
      });
    } catch (_) {
      log('detailCdnUploadNetworkFailed');
      return null;
    }

    if (!response.ok) {
      log(`detailCdnUploadHttp:${response.status}`);
      return null;
    }

    let payload;
    try {
      payload = await response.json();
    } catch (_) {
      log('detailCdnUploadInvalidJson');
      return null;
    }

    if (!payload || payload.success !== true) {
      log('detailCdnUploadRejected');
      return null;
    }
    const path = normalizeVendorInventoryPath(payload.message);
    if (!path) {
      log('detailCdnUploadInvalidPath');
      return null;
    }
    return normalizeVendorInventoryCdnUrl(
      `https://image.coupangcdn.com/image/${path}`,
    );
  }

  function findDetailDescriptionSection() {
    const faq = document.querySelector('a[data-faq-id="264"]');
    const byFaq = faq?.closest?.('.form-section');
    if (byFaq) return byFaq;

    const title = [...document.querySelectorAll('h2,h3,strong,span,div')].find(
      (element) =>
        (element.textContent || '').trim() === '상세설명' &&
        element.children.length === 0,
    );
    return title?.closest?.('.form-section') || null;
  }

  function isControlDisabled(control) {
    if (!control) return true;
    const className = typeof control.className === 'string' ? control.className : '';
    return Boolean(
      control.disabled ||
      control.hasAttribute?.('disabled') ||
      control.getAttribute?.('aria-disabled') === 'true' ||
      /(?:^|\s)disabled(?:\s|$)/.test(className),
    );
  }

  /**
   * staging 업로드에서 얻은 쿠팡 CDN URL 한 개를 최종 HTML 상세설명으로 저장한다.
   * 상품등록/임시저장 버튼은 누르지 않는다.
   */
  async function applyDetailHtml(cdnUrl, log) {
    const normalized = normalizeVendorInventoryCdnUrl(cdnUrl);
    if (!normalized) {
      log('detailHtmlInvalidCdn');
      return false;
    }

    const section = findDetailDescriptionSection();
    const htmlTab = section?.querySelector('#tab-content-2');
    const htmlTabLabel = section?.querySelector('#tab-content-2 + label');
    if (!section || !htmlTab || !htmlTabLabel) {
      log('detailHtmlNoPanel');
      return false;
    }

    htmlTabLabel.click();
    // 활성 탭 판정에 `htmlTab.checked` 를 쓰면 안 된다. 라이브 WING 의 `#tab-content-*`
    // 라디오는 **어느 것도 checked 가 되지 않는다**(라디오 3개 모두 prop/attr/`:checked`
    // 전부 false). 탭 전환은 React state 로만 이뤄지고 라디오는 장식이다.
    // 그래서 예전 조건은 항상 거짓이라 여기서 늘 멈췄다.
    // `.html-area-content textarea` 는 HTML 작성 탭에서만 렌더되므로(다른 탭에서는
    // 아예 없음 — 라이브 확인) 이게 정확한 활성 신호다.
    const textarea = await waitFor(() => {
      const candidate = section.querySelector('.html-area-content textarea');
      return candidate && isVisible(candidate) ? candidate : null;
    }, { timeout: 5000 });
    if (!textarea) {
      log('detailHtmlNoTextarea');
      return false;
    }

    const html = buildDetailHtml(normalized);
    setReactValue(textarea, html);
    textarea.dispatchEvent(new Event('blur', { bubbles: true }));

    // #panel-contents 는 section 의 조상이다. section 내부에서는 로컬 클래스만 사용한다.
    const save = section.querySelector('a.applyHtml');
    if (!save) {
      log('detailHtmlNoSave');
      return false;
    }
    const enabledSave = await waitFor(
      () => (!isControlDisabled(save) ? save : null),
      { timeout: 5000 },
    );
    if (!enabledSave) {
      log('detailHtmlSaveDisabled');
      return false;
    }
    enabledSave.click();

    // 라이브 WING 은 저장 중 applyHtml 을 활성화하고 revision 반영이 끝나면 다시 disabled 로
    // 되돌린다. 그 복귀 신호와 textarea 안의 CDN URL 을 함께 검증한다.
    //
    // ⚠️ `textarea.value === html` 로 **정확히 일치**를 요구하면 안 된다. 저장 직후 WING 이
    // HTML 을 자기 형식으로 다시 찍어내며 개행을 넣는다(라이브 실측):
    //   보낸 값 `<center> <img src="..."> </center>`
    //   저장 후 `<center> \n <img src="..."> \n</center>`
    // 그래서 정확 일치는 영원히 거짓이고, 실제로 저장이 됐는데도 실패로 보고했다.
    // 우리가 보장해야 하는 것은 "그 CDN 이미지가 상세설명에 들어갔다"이므로 URL 포함으로 본다.
    const applied = await waitFor(
      () => textarea.value.includes(normalized) && isControlDisabled(save),
      { timeout: 10000 },
    );
    if (!applied) {
      log('detailHtmlNotApplied');
      return false;
    }
    log('detailHtml:1');
    return true;
  }

  /**
   * 특정 요소를 감싸는 조상들을 타고 올라가며 그 안에서만 버튼을 찾는다.
   * 문서 전체 검색(btnByText)은 같은 라벨의 다른 버튼을 집을 위험이 있다.
   */
  function btnWithinAncestors(el, text, maxDepth = 8) {
    let node = el?.parentElement || null;
    for (let i = 0; i < maxDepth && node; i += 1) {
      const found = btnByText(text, node);
      if (found) return found;
      node = node.parentElement;
    }
    return null;
  }

  /**
   * 일괄입력 다이얼로그의 '확인'을 고른다.
   *
   * 페이지에는 '확인' 버튼이 둘이다:
   *   - 별점 설문의 '확인'  → 누르면 "별점을 선택해주세요" 모달이 떠서 이후가 전부 막힌다
   *   - 일괄입력 다이얼로그의 '확인' → 같은 컨테이너에 '취소'가 함께 있다
   * 다이얼로그는 포털로 렌더돼 입력칸의 조상 체인에 없을 수 있으므로,
   * "취소와 짝을 이루는 확인"이라는 구조로 식별한다.
   */
  function findDialogConfirm() {
    const confirms = [...document.querySelectorAll('button')].filter(
      (b) => (b.textContent || '').trim() === '확인' && b.offsetParent !== null,
    );
    for (const btn of confirms) {
      let node = btn.parentElement;
      for (let i = 0; i < 4 && node; i += 1) {
        if (btnByText('취소', node)) return btn;
        node = node.parentElement;
      }
    }
    return null;
  }

  /**
   * WING 이 띄우는 방해 모달을 닫는다.
   * '별점을 선택해주세요' 는 페이지 만족도 설문(폼 하단 '페이지 별점을 주세요!')에서 뜬다.
   * 등록과 무관하지만 오버레이가 클릭을 가로막아 이후 단계가 전부 실패한다.
   */
  // 등록과 무관하게 뜨는 안내 모달들. 오버레이가 클릭을 막아 이후 단계가 전부 실패한다.
  //  - '별점을 선택해주세요.'            : 페이지 만족도 설문
  //  - '선택한 옵션이 없습니다...'        : 상품명 입력 시 도는 쿠팡 자동 카탈로그 매칭 안내
  const KNOWN_MODAL_TEXTS = [
    '별점을선택해주세요.',
    '선택한옵션이없습니다.옵션을선택해주세요!',
    '최대9개까지업로드할수있습니다.',
  ];

  function dismissBlockingModal() {
    // 텍스트를 "포함"하는 요소로 찾으면 body 같은 거대 컨테이너까지 걸려,
    // 조상을 타고 올라가다 엉뚱한 '확인'(예: 별점 설문)을 눌러 모달을 오히려 띄운다.
    // 반드시 그 문구만 담은 말단 요소로 한정한다.
    const hit = [...document.querySelectorAll('div,p,span,h2,h3')].find((e) => {
      const t = (e.textContent || '').replace(/\s+/g, '');
      return KNOWN_MODAL_TEXTS.includes(t) && e.offsetParent !== null;
    });
    if (!hit) return false;

    // 모달 컨테이너(가까운 조상 3단계) 안의 '확인'만 누른다. 못 찾으면 아무것도 안 한다.
    let node = hit.parentElement;
    for (let i = 0; i < 3 && node; i += 1) {
      const confirm = btnByText('확인', node);
      if (confirm) {
        confirm.click();
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  /**
   * 채우는 동안 별점 모달이 다시 떠도 계속 걷어낸다.
   * 고정 시점 호출만으로는 중간에 뜬 모달을 놓쳐 이후 단계가 전부 막혔다.
   */
  function startModalWatchdog() {
    const timer = setInterval(dismissBlockingModal, 700);
    return () => clearInterval(timer);
  }

  /**
   * 상품정보제공고시.
   *
   * 라이브 실측(formV2, 2026-07 / 카테고리 = 생활용품>생활소품>열쇠고리/키홀더):
   *   .notice-category-section
   *     .notice-category-option-section
   *       .selection-wrapper > .selection
   *         ul.selection-collapse > li.init.option   ← 현재 선택값(클릭하면 펼쳐진다)
   *         ul.selection-expand   > li.option        ← 16개 고시 카테고리
   *       > span.sc-common-check > input[type=checkbox]  ← '전체 상품 상세페이지 참조'
   *     .notice-category-input-wrapper …             ← 항목별 행(각자 '상품 상세페이지 참조')
   *
   * 전체 체크박스를 누르면 항목별 체크박스가 전부 따라 켜지는 것을 실측 확인했다.
   */
  const NOTICE_SECTION_SELECTOR = '.notice-category-option-section';

  /**
   * ⚠️ **의도적으로 `product.noticeCategory` 를 쓰지 않는다.**
   *
   * 프리셋(WING_TOY_WATERGUN_PRESET)의 고시 카테고리는 `어린이제품` 인데, 실제로 등록하는
   * 상품은 열쇠고리처럼 완구가 아닌 것이 섞여 있다. 카테고리 → 고시 스키마 매핑이 아직
   * 없는 상태(재기획서 B4)에서 프리셋 값을 그대로 밀면 **틀린 고시 카테고리로 등록**된다.
   * 고시 항목은 카테고리마다 이름·개수가 달라서 값 매핑도 함께 틀어진다.
   *
   * 그래서 매핑이 생기기 전까지는 어느 상품에나 유효한 `기타 재화`(품명 및 모델명 /
   * 인증·허가 사항 / 제조국 / 제조자 / 소비자상담 전화번호 5항목) + `전체 상품 상세페이지 참조`
   * 를 **안전한 기본값**으로 고정한다. 억지 추론보다 상세페이지 참조가 정확하다.
   * 카테고리별 매핑이 들어오면 이 상수를 payload 기반 선택으로 교체할 것.
   */
  const NOTICE_DEFAULT_CATEGORY = '기타 재화';

  function noticeSection() {
    return document.querySelector(NOTICE_SECTION_SELECTOR);
  }

  /** 고시 카테고리 드롭다운에서 `label` 을 고른다. */
  async function selectNoticeCategory(section, label) {
    const current = section.querySelector('ul.selection-collapse li.init.option');
    if (!current) return false;
    if (normText(current.textContent) === normText(label)) return true;

    current.click();
    const option = await waitFor(
      () => {
        const expand = section.querySelector('ul.selection-expand');
        if (!expand) return null;
        return (
          [...expand.querySelectorAll('li.option')].find(
            (li) => normText(li.textContent) === normText(label),
          ) || null
        );
      },
      { timeout: 5000 },
    );
    if (!option) return false;
    option.click();

    return Boolean(
      await waitFor(
        () => {
          const now = section.querySelector('ul.selection-collapse li.init.option');
          return now && normText(now.textContent) === normText(label);
        },
        { timeout: 5000 },
      ),
    );
  }

  /**
   * 고시 카테고리를 고르고 '전체 상품 상세페이지 참조'를 켠다.
   *
   * ⚠️ 체크박스 탐색은 반드시 `.notice-category-option-section` 안으로 한정한다.
   *    문서 전역에서 찾으면 화면 우하단 '페이지 별점주기' 위젯 같은 무관한 컨트롤을 건드려
   *    모달이 뜨고 이후 단계가 전부 막힌다(과거 사고).
   */
  async function fillProductNotice(log) {
    const section = await waitFor(noticeSection, { timeout: 8000 });
    if (!section) {
      log('noticeNoSection');
      return false;
    }

    if (!(await selectNoticeCategory(section, NOTICE_DEFAULT_CATEGORY))) {
      log('noticeCategoryFailed');
      return false;
    }
    log('noticeCategory:' + NOTICE_DEFAULT_CATEGORY);

    const referAll = section.querySelector(':scope > span.sc-common-check > input[type="checkbox"]');
    if (!referAll) {
      log('noticeNoReferAll');
      return false;
    }
    if (!referAll.checked) referAll.click();

    // 항목별 행은 `.notice-category-option-section` 이 아니라 그 부모
    // `.notice-category-section` 아래에 있다(라이브 실측: 기타 재화 = 5행).
    const noticeRoot = section.closest('.notice-category-section') || section.parentElement;
    const applied = await waitFor(
      () => {
        const rows = [
          ...noticeRoot.querySelectorAll(
            '.notice-category-input-wrapper span.sc-common-check > input[type="checkbox"]',
          ),
        ];
        return rows.length > 0 && rows.every((row) => row.checked) ? rows.length : null;
      },
      { timeout: 4000, interval: 200 },
    );
    if (!applied) {
      log('noticeReferAllNotApplied');
      return false;
    }
    log(`noticeReferAll:${applied}`);
    return true;
  }

  /**
   * 옵션 값 한 개를 해당 입력칸에 넣고 그 행의 '추가' 버튼을 누른다.
   * 색상/수량이 각자 다른 행이므로 입력칸 기준으로 같은 행의 버튼을 찾아야 한다.
   */
  async function addOptionValue(placeholder, value) {
    const input = byPlaceholder(placeholder);
    if (!input) return false;
    setReactValue(input, value);
    await sleep(300);

    let el = input.closest('div');
    let addBtn = null;
    for (let i = 0; i < 6 && el && !addBtn; i++) {
      addBtn = btnByText('추가', el);
      el = el.parentElement;
    }
    if (!addBtn) return false;
    addBtn.click();
    await sleep(800);
    return true;
  }

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * 제출(상품등록) — 옵트인 전용. 이 아래 코드는 autoSubmit === true 일 때만 실행된다.
   * ─────────────────────────────────────────────────────────────────────────
   */

  // 신규 등록 화면은 '상품등록', 이미 등록된 상품 수정 화면은 '수정 및 검수 요청'.
  // **완전일치**로만 찾는다. 부분일치를 쓰면 '임시저장', '판매요청', 별점 위젯의 '등록' 이
  // 전부 걸린다.
  const SUBMIT_BUTTON_TEXTS = ['상품등록', '수정 및 검수 요청'];

  /**
   * ⚠️⚠️ 절대 누르면 안 되는 버튼들.
   *
   * 과거에 문서 전역에서 버튼을 찾다가 '페이지 별점주기' 위젯의 `등록`
   * (`#report-rating-trigger`)을 눌러 "별점을 선택해주세요" 모달이 뜨고 이후 작업이
   * 전부 막힌 이력이 있다. 완전일치 텍스트만으로도 '등록' != '상품등록' 이라 걸리지
   * 않지만, 위젯 문구가 바뀌어도 안전하도록 id/class 기반 거부를 한 겹 더 둔다.
   */
  const FORBIDDEN_SUBMIT_PATTERN = /report-rating|rating|survey|feedback|nps/i;

  // 눌렀을 때 등록이 아닌 다른 일이 벌어지는 버튼들. 실수로라도 대상이 되면 안 된다.
  //  - '취소'            : 확인 모달을 닫아 등록을 취소시킨다
  //  - '상품목록'/'새로운 상품등록' : 완료 모달의 이동 버튼. 누르면 화면이 떠나 ID 를 못 읽는다.
  //                        (웹이 폴링해서 화면을 옮긴다 — 커밋 f4da499c)
  const NEVER_CLICK_TEXTS = [
    '임시저장',
    '판매요청',
    '삭제',
    '취소',
    '등록',
    '상품목록',
    '새로운 상품등록',
  ];

  /**
   * 폼 하단 '상품등록' → **확인 모달** → 모달의 '상품등록' → 완료 모달.
   *
   * 라이브 실측(formV2, 2026-07):
   *  - 확인 모달은 **SweetAlert 1.x 싱글턴**이다. `div.sweet-alert` 가 문서에 항상 딱 하나
   *    존재하고(닫혀 있을 때는 숨김 + 자리표시 텍스트 `Title`/`Text`/`Cancel`/`OK`),
   *    열릴 때 제목·버튼 라벨만 갈아끼운다.
   *      div.sweet-alert
   *        h2.alert-title   … '판매요청 하시겠습니까?'
   *        p.alert-text
   *        div.alert-buttons
   *          button.cancel  … '취소'      ← ⚠️ 절대 누르지 않는다
   *          button.confirm … '상품등록'  ← 최종 확인(등록이 실제로 일어난다)
   *  - 번들 실측: `confirmButtonText: this.$t(this.requestApprovalBtn)` 이라
   *    확인 버튼 라벨이 폼 버튼과 **같은 문구**('상품등록' / 수정화면은 '수정 및 검수 요청')다.
   *  - 완료 모달은 별도 Vue 컴포넌트(`InventorySavePopUp` + `Modal`)라 `.sweet-alert` 가
   *    아니다. 그래서 확인 클릭을 `.sweet-alert` 안으로 가두면 완료 모달의
   *    '상품목록'/'새로운 상품등록'은 **구조적으로** 눌릴 수 없다.
   *
   * ⚠️ 확인 버튼은 **반드시 이 모달 컨테이너 안에서만** 찾는다. 과거에 문서 전역에서
   *    버튼을 찾다가 숨어 있던 별점 위젯을 눌러 모달 지옥에 빠진 이력이 있다.
   */
  const CONFIRM_MODAL_SELECTOR = '.sweet-alert';
  const CONFIRM_MODAL_CONFIRM_SELECTOR = 'button.confirm';

  /** 버튼이 확인 모달 안에 있는가(조상 체인으로 판정). */
  function isInsideConfirmModal(element) {
    let node = element;
    for (let i = 0; i < 8 && node; i += 1) {
      const className = typeof node.className === 'string' ? node.className : '';
      if (/(?:^|\s)sweet-alert(?:\s|$)/.test(className)) return true;
      node = node.parentElement;
    }
    return false;
  }

  function isForbiddenSubmitTarget(button) {
    let node = button;
    for (let i = 0; i < 6 && node; i += 1) {
      const id = typeof node.id === 'string' ? node.id : '';
      const className = typeof node.className === 'string' ? node.className : '';
      if (FORBIDDEN_SUBMIT_PATTERN.test(id) || FORBIDDEN_SUBMIT_PATTERN.test(className)) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  /**
   * 폼 하단 액션바의 제출 버튼을 찾는다.
   *
   * 범위를 좁히는 순서:
   *   1) 화면에 보이는 버튼만(offsetParent)
   *   2) 텍스트 **완전일치** (SUBMIT_BUTTON_TEXTS)
   *   3) 별점/설문 위젯 조상 거부 (isForbiddenSubmitTarget)
   *   4) 확인 모달(.sweet-alert) 내부 버튼 거부
   *   5) 비활성 버튼 거부
   * 여러 개가 남으면 문서 순서상 마지막(= 폼 하단 액션바)을 쓴다.
   *
   * ⚠️ 4) 가 필요한 이유: 확인 모달의 확인 버튼은 폼 버튼과 **라벨이 똑같고**
   *    `.sweet-alert` 는 문서 순서상 폼보다 **뒤**에 있다(라이브 실측: body 말단 div).
   *    모달이 떠 있는 상태에서 이 함수를 부르면 "마지막 후보" 규칙 때문에 모달의 확인이
   *    폼 제출 버튼으로 잡힌다. 두 단계는 서로 다른 함수가 각자 책임진다.
   */
  function findSubmitButton() {
    const candidates = [...document.querySelectorAll('button')].filter((b) => {
      const text = (b.textContent || '').trim();
      if (!SUBMIT_BUTTON_TEXTS.includes(text)) return false;
      // SUBMIT_BUTTON_TEXTS 가 나중에 넓어져도 이 문구들은 절대 통과하지 못하게 막는다.
      if (NEVER_CLICK_TEXTS.includes(text)) return false;
      if (b.offsetParent === null) return false;
      if (isForbiddenSubmitTarget(b)) return false;
      if (isInsideConfirmModal(b)) return false;
      if (b.disabled === true) return false;
      if (typeof b.hasAttribute === 'function' && b.hasAttribute('disabled')) return false;
      return true;
    });
    return candidates.length ? candidates[candidates.length - 1] : null;
  }

  /**
   * 열려 있는 확인 모달의 확인 버튼. 없으면 null.
   *
   * 판정 조건(모두 만족해야 한다):
   *   1) `.sweet-alert` 컨테이너가 화면에 보인다
   *   2) 그 **안**의 `button.confirm` 이 보인다
   *   3) 확인 버튼 라벨이 제출 문구(SUBMIT_BUTTON_TEXTS)와 완전일치한다
   *
   * 3) 이 핵심 안전장치다. WING 은 같은 SweetAlert 싱글턴을 '최대 9개까지 업로드할 수
   * 있습니다.' 같은 단순 안내에도 재사용하는데, 그런 알림의 확인 라벨은 '확인'이다.
   * 라벨을 확인하지 않으면 등록과 무관한 알림을 등록 확인으로 오인해 누르게 된다.
   */
  function findConfirmModalButton() {
    const modals = [...document.querySelectorAll(CONFIRM_MODAL_SELECTOR)].filter(isVisible);
    for (const modal of modals) {
      const confirm = modal.querySelector(CONFIRM_MODAL_CONFIRM_SELECTOR);
      if (!confirm || !isVisible(confirm)) continue;
      const text = (confirm.textContent || '').trim();
      if (!SUBMIT_BUTTON_TEXTS.includes(text)) continue;
      if (NEVER_CLICK_TEXTS.includes(text)) continue;
      if (isControlDisabled(confirm)) continue;
      return confirm;
    }
    return null;
  }

  /**
   * 등록 성공 안내에서 등록상품ID(쿠팡 vendorInventoryId, 10자리 이상 숫자)를 뽑는다.
   *
   * 라이브 문구(번들 실측 — 완료 모달은 단일 템플릿 리터럴
   * `` `${$t(inventoryIdText)} : ${inventoryId}` `` 로 렌더된다):
   *   `등록상품ID : 16311492950`
   * 콜론+공백은 `[^0-9]{0,10}` 안에 들어오므로 기존 패턴으로 그대로 잡힌다.
   */
  function extractRegisteredProductId() {
    const fromUrl = /vendorInventoryId=(\d{8,})/.exec(location.href || '');
    if (fromUrl) return fromUrl[1];
    const body = (document.body && document.body.innerText) || '';
    const match = /등록상품ID[^0-9]{0,10}(\d{8,})/.exec(body) || /상품번호[^0-9]{0,10}(\d{8,})/.exec(body);
    return match ? match[1] : null;
  }

  const SUBMIT_SUCCESS_TEXTS = ['상품이등록되었습니다', '등록이완료', '등록되었습니다', '검수요청이완료'];

  function hasSubmitSuccessText() {
    const body = ((document.body && document.body.innerText) || '').replace(/\s+/g, '');
    return SUBMIT_SUCCESS_TEXTS.some((t) => body.includes(t));
  }

  /**
   * 폼 제출. 성공을 **확증하지 못하면 ok:false + status:'unknown'** 으로 돌려준다.
   * 추측으로 성공을 보고하면 웹이 실제로 등록되지 않은 상품을 등록상품 목록에 올린다.
   */
  async function submitWingForm(log) {
    const button = findSubmitButton();
    if (!button) {
      log('submit:noButton');
      return {
        attempted: true,
        clicked: false,
        ok: false,
        status: 'no_button',
        externalListingId: null,
        error: '상품등록 버튼을 찾지 못했습니다. 열린 WING 탭에서 직접 등록해 주세요.',
      };
    }

    const label = (button.textContent || '').trim();
    log(`submit:click:${label}`);
    button.click();

    // 제출 직후 등록과 무관한 안내 모달이 끼어들 수 있다. 알려진 것만 걷어낸다.
    await sleep(1500);
    if (dismissBlockingModal()) log('submit:dismissedModal');

    // 확인 모달('판매요청 하시겠습니까?')의 확인 버튼을 한 번 더 누른다.
    // 이 클릭이 있어야 실제 등록이 일어난다 — 여기서 멈추면 아무것도 등록되지 않는다.
    //
    // 모달이 뜨지 않고 바로 등록되는 흐름도 있을 수 있으므로, 일정 시간 기다렸다가
    // 없으면 그냥 진행한다. 등록 여부는 아래 완료 문구 폴링이 최종 판정한다.
    const confirmButton = await waitFor(findConfirmModalButton, { timeout: 6000, interval: 250 });
    if (confirmButton) {
      // ⚠️ 같은 모달의 '취소'는 절대 건드리지 않는다. findConfirmModalButton 이
      //    `button.confirm` 만 돌려주므로 취소는 애초에 후보가 아니다.
      log(`submit:confirmModal:${(confirmButton.textContent || '').trim()}`);
      confirmButton.click();
      await sleep(1200);
    } else {
      log('submit:noConfirmModal');
    }

    for (let i = 0; i < 20; i += 1) {
      if (hasSubmitSuccessText()) {
        const externalListingId = extractRegisteredProductId();
        log(externalListingId ? `submit:ok:${externalListingId}` : 'submit:ok:noId');
        return {
          attempted: true,
          clicked: true,
          ok: true,
          status: 'registered',
          label,
          externalListingId,
        };
      }
      await sleep(1000);
    }

    log('submit:unconfirmed');
    return {
      attempted: true,
      clicked: true,
      ok: false,
      status: 'unknown',
      label,
      externalListingId: extractRegisteredProductId(),
      error:
        '상품등록을 진행했지만 완료 안내를 확인하지 못했습니다. 확인 모달이 남아 있을 수 있으니 WING 탭에서 등록 결과를 직접 확인해 주세요.',
    };
  }

  async function fillWingForm(product, autoSubmit = false, expectedVendorId) {
    const steps = [];
    const log = (s) => steps.push(s);
    let detailUploadError = null;
    const accountIdentity = globalThis.KidItemWingAccountIdentity
      ?.verifyExpectedVendorId(expectedVendorId);
    if (!accountIdentity?.ok) {
      return { ok: false, error: accountIdentity?.error || 'WING account verification helper is unavailable.', steps };
    }
    const evidence = accountIdentity ? {
      wingVendorId: accountIdentity.vendorId,
      wingIdentitySource: accountIdentity.source,
    } : undefined;

    // formV2 는 React 앱이라 탭 로드 완료 후에도 폼이 한참 뒤에 그려진다.
    // 고정 대기(background 의 2.5초)로는 부족해 예전엔 모든 셀렉터가 null 이 되어
    // "아무것도 안 채워졌는데 에러도 없는" 상태가 됐다. 실제 요소가 나타날 때까지 기다린다.
    const ready = await waitFor(() => byPlaceholder('카테고리명 입력'), { timeout: 60000 });
    if (!ready) {
      return { ok: false, error: 'WING 상품등록 폼이 준비되지 않았습니다(60초 대기 초과).', steps, evidence };
    }
    log('formReady');

    // 1) 판매방식: 판매자배송(기본 체크). 로켓그로스 건드리지 않음.
    //    (formV2 는 판매자배송이 기본 체크되어 있어 별도 조작 불필요)

    // 2) 브랜드: 항상 '브랜드 없음(또는 자체제작)' 을 체크한다.
    //    브랜드명을 입력하려 했다가 셀렉터가 '카탈로그 매칭하기' 검색창을 잡아
    //    거기에 브랜드명이 들어가는 사고가 있었다. 자체제작이므로 체크가 정답이다.
    const selfMade = document.querySelector('input[name="selfMade"]');
    if (selfMade && !selfMade.checked) {
      selfMade.click();
      log('brandNone');
    }

    // 2-1) 등록상품명(판매자관리용): 노출상품명과 별개의 판매자 내부 관리용 이름이다.
    //      기본은 접혀 있어서 `#feature-switch-ProductName` 을 눌러야 입력칸이 렌더된다.
    //      (라이브 실측: 판매중 상품에 `3000선인장딸깍키링` 처럼 셀피아 상품명이 들어가 있다)
    if (product.sellerProductName) {
      const toggle = document.querySelector('#feature-switch-ProductName span.cursor-pointer');
      if (toggle) {
        toggle.click();
        const sellerNameInput = await waitFor(
          () => document.querySelector('input[name="InputWithCounter_3"]'),
          { timeout: 5000 },
        );
        if (sellerNameInput) {
          setReactValue(sellerNameInput, String(product.sellerProductName).slice(0, 100));
          log('sellerProductName');
        } else {
          log('sellerProductNameNoInput');
        }
      } else {
        log('sellerProductNameNoToggle');
      }
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

    // 4-1) 제조사: 카테고리를 고르기 전에는 렌더되지 않으므로 반드시 이 순서여야 한다.
    //      브랜드는 '브랜드 없음' 체크로 비우지만 제조사는 별개 필드다.
    //      (라이브 실측: 브랜드=브랜드없음 체크, 제조사=`해피프랜즈`. 과거에 이 값을
    //       브랜드로 오해해 카탈로그 검색창에 넣은 사고가 있었다 — 제조사가 제자리다)
    if (product.maker) {
      const makerInput = byPlaceholder('제조사를 알 수 없는 경우 브랜드명을 입력해주세요.');
      if (makerInput) {
        setReactValue(makerInput, String(product.maker));
        log('maker');
      } else {
        log('makerNoInput');
      }
    }

    // 5) 옵션: 색상과 수량은 **서로 다른 입력칸**이다.
    //    색상 = placeholder '옵션값 입력' (텍스트)
    //    수량 = placeholder '숫자만 입력' (숫자 + '개' 단위 셀렉트)
    //    예전에는 둘 다 '옵션값 입력' 에 넣어 수량이 색상칸으로 들어갔다.
    const variant = (product.variants || [])[0];
    if (variant && Array.isArray(variant.purchaseOptions)) {
      for (const opt of variant.purchaseOptions) {
        const isQuantity = String(opt.type || '').includes('수량');
        const placeholder = isQuantity ? '숫자만 입력' : '옵션값 입력';
        // 수량은 숫자만 받는다. '1개' 같은 값이 와도 숫자만 남긴다.
        const value = isQuantity
          ? String(opt.value || '').replace(/[^\d]/g, '') || '1'
          : String(opt.value || '');
        if (await addOptionValue(placeholder, value)) {
          log('option:' + opt.type + '=' + value);
        } else {
          log('optionFailed:' + opt.type);
        }
      }
    }

    // 5-1) 판매가·재고수량: 옵션 행마다 채우지 않고 WING 의 '일괄입력' 버튼을 쓴다.
    //      둘 다 등록 필수값인데 기존에는 아예 입력하지 않아 등록이 반려됐다.
    //
    //      순서는 **선택 → 일괄입력 → 저장** 이다. 행 선택을 빼먹으면 일괄입력이 조용히
    //      무시되어 옵션표가 빈 채로 남는다(selectAllOptionRows 주석의 라이브 실증 참조).
    if (variant) {
      const selected = await selectAllOptionRows(log);
      if (!selected) {
        log('bulkFillSkipped:noSelection');
      } else {
        if (Number(variant.salePrice) > 0 && (await bulkFillByButton('판매가 일괄입력', variant.salePrice))) {
          log('salePrice:' + variant.salePrice);
        }
        // 판매가 저장 뒤 표가 다시 그려지면서 선택이 풀릴 수 있어 재고 전에 다시 확인한다.
        await selectAllOptionRows(log);
        if (Number(variant.stock) > 0 && (await bulkFillByButton('재고수량 일괄입력', variant.stock))) {
          log('stock:' + variant.stock);
        }
      }
    }

    // 6) 이미지: 파일로 직접 업로드한다.
    //    자체 제작 썸네일·상세페이지는 로컬 MinIO(localhost:9000)에 있어 쿠팡이 URL 로
    //    가져갈 수 없다. 그래서 URL 방식이 아니라 bytes 를 받아 file input 에 넣는다.
    const repUrl = variant && variant.representativeImageUrl;
    const extraUrls = (product.additionalImageUrls || []).filter(Boolean);
    //    업로드 성공/실패는 uploadImagesToInput 이 카운터·미리보기 변화로 판정해 직접 로그를 남긴다.
    if (repUrl) await uploadImagesToInput(0, [repUrl], log);
    if (extraUrls.length) await uploadImagesToInput(1, extraUrls, log);

    // 7) 상세설명: 긴 이미지 bytes 를 WING 단일 파일 API(uploadV2)에 staging 업로드해
    //    쿠팡 CDN URL 한 개를 얻은 뒤, 최종값은 반드시 HTML 작성 탭에 centered <img> 로 저장한다.
    //    MinIO(localhost) URL 을 HTML 에 직접 넣거나 이미지 등록 타입으로 끝내지 않는다.
    const detailUrls = (product.detailImageUrls || []).filter(Boolean);
    if (detailUrls.length > 1) {
      log(`detailSourceMultiple:${detailUrls.length}`);
      detailUploadError =
        '상세설명 원본은 긴 이미지 한 장이어야 합니다. 여러 이미지가 전달되어 HTML 적용을 중단했습니다.';
    } else if (detailUrls.length === 1) {
      const cdnUrl = await uploadDetailImageToCoupang(detailUrls[0], log);
      const ok = cdnUrl ? await applyDetailHtml(cdnUrl, log) : false;
      if (!ok) {
        log('detailHtmlFailed');
        detailUploadError =
          '상세설명을 쿠팡 CDN 이미지 기반 HTML로 적용하지 못했습니다. 열린 WING 탭에서 HTML 작성을 확인해 주세요.';
      }
    }

    // 3') 노출상품명 — **맨 마지막에** 넣는다.
    //    상품명을 입력하면 쿠팡이 '카탈로그 매칭' 자동검색을 돌려 결과 카드들을 렌더한다.
    //    그 상태에서 카테고리/옵션 단계를 진행하면 검색결과 영역의 요소를 잘못 집어
    //    "선택한 옵션이 없습니다"·"별점을 선택해주세요" 모달이 떴다.
    const nameInput =
      document.querySelector('input[name="InputWithCounter_2"]') ||
      byPlaceholder('상품 모델(해당 시) + 상품 유형 + 핵심 특징');
    if (nameInput && product.productName) {
      setReactValue(nameInput, product.productName);
      log('name');
      // 상품명 입력은 쿠팡 자동 카탈로그 매칭을 돌린다. 그 결과 안내 모달이 뜨면 닫는다.
      await sleep(2500);
      if (dismissBlockingModal()) log('dismissedCatalogModal');
      await sleep(600);
      if (dismissBlockingModal()) log('dismissedModal2');
    }

    // 8) 상품정보제공고시: `기타 재화` + `전체 상품 상세페이지 참조`.
    //    이전에는 이 섹션을 아예 건드리지 않아 `선택하세요` 로 남아 등록이 막혔다.
    //    카테고리 고정 이유는 NOTICE_DEFAULT_CATEGORY 주석 참조.
    //    배송/반품은 계정 기본값이 이미 채워져 있어 손대지 않는다.
    //    ⚠️ 상품등록/임시저장 버튼은 누르지 않는다.
    await fillProductNotice(log);

    // 상세페이지가 요청됐는데 최종 HTML 타입으로 적용되지 않았다면 전체 성공으로 보고하지 않는다.
    // 폼은 열린 채로 남겨 사용자가 보정할 수 있고, 웹에는 실패 이유와 steps 가 전달된다.
    // ⚠️ 이 경우 autoSubmit 이 켜져 있어도 제출하지 않는다. 반쯤 채워진 폼을 쿠팡에 올리면 안 된다.
    if (detailUploadError) {
      return { ok: false, error: detailUploadError, steps, evidence };
    }

    // 9) 제출 — **옵트인일 때만**. autoSubmit 이 아니면 제출 버튼을 찾지도 않는다.
    if (autoSubmit === true) {
      const submission = await submitWingForm(log);
      return { ok: true, steps, submission, evidence };
    }

    return { ok: true, steps, submission: { attempted: false }, evidence };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.action === 'fillWingForm') {
      fillWingForm(msg.product || {}, msg.autoSubmit === true, msg.expectedVendorId)
        .then((r) => sendResponse(r))
        .catch((e) => sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }));
      return true; // async response
    }
    return false;
  });
})();
