// 키즈노트(WISA 스마트윙) 입점사 상품등록 폼 채우기(MAIN world, KID-256 — 옛 `background/orders/kidsnote-product-register.js`
// `fillKidsnoteProductForm` 이식). 확장 런타임 몰 쓰기(`extensions/src/sites/kidsnote/registration.ts`)가 `form-fill.js`(쓰기 탭
// 도우미) 뒤에 넣고 `kidsnote.fill`을 부른다. 몰 폼 명세 몰과 다른 것 셋: 이미지가 파일 칸이고(서비스워커가 data URL로 넘긴다),
// 상품정보제공고시는 `fieldset`을 고른 뒤에야 `field{N}` 칸이 생기며, 상세설명은 `up_fdisk` 호스팅 업로더(filetype=3)에 먼저
// 올려 키즈노트 주소로 HTML을 만든다(업로더 iframe의 폼 보내기는 첨부 저장이지 상품 저장이 아니다).
// ⚠️ 상품 등록 폼(#prdFrm)은 보내지 않는다 — 키즈노트 등록은 몰 승인이 붙는 신청이다(ADR-0019: 검증된 누르기가 없다).
(function installKidsnoteRegister() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});

  /** 페이지 안에서 도는 채움 함수. 인자로 받은 값만 쓴다. */
  function fillKidsnoteProductForm(payload) {
    const steps = [];
    const warnings = [];
    const form = document.querySelector("#prdFrm");
    if (!form) {
      // 폼이 없다 = 대개 로그인이 풀렸다 — 런타임이 그 탭에서 로그인하고 다시 채운다(`noForm`).
      return { ok: false, noForm: true, error: "상품등록 폼(#prdFrm)이 없습니다. 로그인 상태와 화면을 확인하세요." };
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const field = (name) => form.querySelector(`[name="${CSS.escape(name)}"]`);

    /** 업로더 목록에 보이는 호스팅 URL. 도메인은 라이브 실측(`kiditem.diskn.com`). */
    function hostedUrls(doc) {
      return [...doc.querySelectorAll("a[href],img[src]")]
        .map((el) => el.getAttribute("href") || el.getAttribute("src") || "")
        .filter((href) => href && !href.startsWith("data:") && /diskn\.com|\/data\//.test(href))
        .map((href) => new URL(href, doc.location.href).href);
    }

    function toFile(image) {
      const [head, base64] = String(image.dataUrl).split(",");
      const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return new File([bytes], image.fileName, { type: mime });
    }

    /**
     * 호스팅 업로더(iframe)에 파일 하나를 올리고 그 URL 을 돌려준다.
     *
     * 업로더는 hidden iframe 을 target 으로 POST 하므로 응답을 직접 못 읽는다.
     * 대신 업로드 후 목록에 나타나는 링크/이미지에서 파일명이 일치하는 것을 찾는다.
     */
    async function uploadToHosting(image, filetype) {
      const frame = document.getElementById(filetype === "3" ? "up_fdisk" : "up_aimg");
      const doc = frame?.contentDocument;
      if (!doc) throw new Error("호스팅 업로더를 찾지 못했습니다.");
      const form = [...doc.querySelectorAll("form")].find(
        (candidate) => candidate.querySelector('[name="upfile"]')
          && candidate.querySelector('[name="filetype"]')?.value === filetype,
      );
      if (!form) throw new Error("업로드 폼을 찾지 못했습니다.");
      const input = form.querySelector('[name="upfile"]');
      const transfer = new DataTransfer();
      transfer.items.add(toFile(image));
      const before = new Set(hostedUrls(doc));
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      form.submit();

      // 호스팅 URL 은 `https://kiditem.diskn.com/S8brNL1Xs4` 처럼 해시라서 파일명이 들어
      // 있지 않다. 업로드 전 목록을 찍어두고 새로 생긴 항목을 집는다.
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        await sleep(500);
        const now = hostedUrls(doc);
        const fresh = now.find((url) => !before.has(url));
        if (fresh) return fresh;
      }
      return null;
    }

    function setValue(name, value) {
      const el = field(name);
      if (!el) return false;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    return (async () => {
      // 1) 고시 카테고리를 먼저 고른다. field{N} textarea 는 이 선택으로 생긴다.
      const noticeCategory = payload.fields.fieldset;
      const noticeFieldNames = Object.keys(payload.fields).filter((n) => /^field\d+$/.test(n));
      if (noticeCategory) {
        if (setValue("fieldset", noticeCategory)) {
          steps.push(`fieldset:${noticeCategory}`);
          if (noticeFieldNames.length > 0) {
            const deadline = Date.now() + 8000;
            while (Date.now() < deadline && !field(noticeFieldNames[0])) await sleep(200);
            if (!field(noticeFieldNames[0])) {
              warnings.push("상품정보제공고시 입력칸이 생성되지 않아 고시를 채우지 못했습니다.");
            }
          }
        } else {
          warnings.push("상품정보제공고시 카테고리 칸을 찾지 못했습니다.");
        }
      }

      // 2) 분류는 계단식이다. big 을 고르면 mid 가 AJAX 로 채워지므로, 각 단계의
      //    옵션이 실제로 로드된 뒤에 다음 단계를 고른다. 빈 select 에 value 를 넣으면
      //    조용히 무시되고 화면에는 대분류만 들어간 채로 남는다.
      const CATEGORY_CHAIN = ["big", "mid", "small", "depth4"];
      for (const name of CATEGORY_CHAIN) {
        const want = payload.fields[name];
        if (!want) continue;
        const el = field(name);
        if (!el) { warnings.push(`분류 칸 ${name} 을(를) 찾지 못했습니다.`); break; }
        const deadline = Date.now() + 8000;
        const has = () => [...el.options].some((option) => option.value === want);
        while (Date.now() < deadline && !has()) await sleep(200);
        if (!has()) {
          warnings.push(`분류 ${name}=${want} 옵션이 로드되지 않아 그 아래 단계를 비웠습니다.`);
          break;
        }
        el.value = want;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        steps.push(`category:${name}=${want}`);
      }

      // 3) 나머지 일반 필드
      let filled = 0;
      const missing = [];
      for (const [name, value] of Object.entries(payload.fields)) {
        if (name === "fieldset" || CATEGORY_CHAIN.includes(name)) continue;
        if (setValue(name, value)) filled += 1;
        else missing.push(name);
      }
      steps.push(`fields:${filled}/${filled + missing.length}`);
      if (missing.length > 0) warnings.push(`입력칸을 찾지 못한 항목: ${missing.join(", ")}`);

      // 4) 체크박스 / 라디오
      for (const name of payload.checks) {
        const el = field(name);
        if (!el) { warnings.push(`체크박스 ${name} 을(를) 찾지 못했습니다.`); continue; }
        if (!el.checked) el.click();
        steps.push(`check:${name}`);
      }
      for (const [name, value] of Object.entries(payload.radios)) {
        const el = form.querySelector(`[name="${CSS.escape(name)}"][value="${CSS.escape(value)}"]`);
        if (!el) { warnings.push(`선택지 ${name}=${value} 를 찾지 못했습니다.`); continue; }
        if (!el.checked) el.click();
        steps.push(`radio:${name}=${value}`);
      }

      // 5) 이미지 — data URL 을 File 로 되돌려 DataTransfer 로 넣는다.
      for (const image of payload.images) {
        const input = field(image.name);
        if (!input) { warnings.push(`이미지 칸 ${image.name} 을(를) 찾지 못했습니다.`); continue; }
        try {
          const [head, base64] = String(image.dataUrl).split(",");
          const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          const file = new File([bytes], image.fileName, { type: mime });
          const transfer = new DataTransfer();
          transfer.items.add(file);
          input.files = transfer.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
          steps.push(`image:${image.name}`);
        } catch (error) {
          warnings.push(`이미지 ${image.name} 주입 실패: ${error?.message || error}`);
        }
      }

      // 6) 상세설명 이미지를 몰 호스팅(up_fdisk, filetype=3)에 올려 키즈노트 URL 을 받는다.
      //    우리 MinIO URL 을 HTML 에 그대로 박으면 구매자 브라우저에서 안 열린다.
      const hostedDetailUrls = [];
      for (const upload of payload.detailImages) {
        try {
          const hosted = await uploadToHosting(upload, "3");
          if (hosted) {
            hostedDetailUrls.push(hosted);
            steps.push(`hosting:detail:${hosted.split("/").pop()}`);
          } else {
            warnings.push(`상세설명 이미지 호스팅 URL 을 확인하지 못했습니다 (${upload.fileName}).`);
          }
        } catch (error) {
          warnings.push(`상세설명 이미지 업로드 실패: ${error?.message || error}`);
        }
      }

      // 7) 상세설명 HTML — 호스팅 URL 로만 만든다. 하나도 못 올렸으면 넣지 않는다.
      if (payload.detailHtmlTarget && hostedDetailUrls.length === 0) {
        warnings.push("호스팅에 올라간 상세 이미지가 없어 상세설명을 비워 두었습니다.");
      }
      if (payload.detailHtmlTarget && hostedDetailUrls.length > 0) {
        // 실측 상품의 상세설명은 `<center><img src="..."></center>` 한 줄이다.
        const html = hostedDetailUrls
          .map((url) => `<center><img src="${url}"></center>`)
          .join("");
        if (!setValue(payload.detailHtmlTarget, html)) {
          warnings.push(`상세설명 칸 ${payload.detailHtmlTarget} 을(를) 찾지 못했습니다.`);
        } else {
        steps.push(`detailHtml:${payload.detailHtmlTarget}`);
        let synced = false;
        for (const frame of document.querySelectorAll("iframe")) {
          try {
            const body = frame.contentDocument?.body;
            if (!body || !frame.contentDocument.designMode) continue;
            if (frame.contentDocument.designMode.toLowerCase() !== "on") continue;
            body.innerHTML = html;
            synced = true;
            break;
          } catch { /* cross-origin iframe 은 건너뛴다 */ }
        }
        if (!synced) {
          warnings.push("상세설명 편집기를 직접 갱신하지 못했습니다. 화면에서 상세설명이 들어갔는지 확인하세요.");
        }
        }
      }

      // 제출하지 않는다. 등록 신청은 몰 승인이 붙어 되돌리기 어렵다.
      return { ok: true, steps, warnings, submitted: false };
    })();
  }

  calls["kidsnote.fill"] = async (payload) => {
    // 몰이 띄우는 알림·확인 창은 알림 창 가드(쓰기 탭)가 받는다 — 확인창은 거절하고 문장은 몰 안내로 돌려준다.
    const said = [];
    const release = window.__kiditemWriteDialogs ? window.__kiditemWriteDialogs.listen((message) => said.push(String(message))) : () => undefined;
    try {
      const outcome = await fillKidsnoteProductForm(payload || {});
      if (outcome && Array.isArray(outcome.warnings)) {
        for (const message of new Set(said)) outcome.warnings.push(`몰 안내: ${message}`);
      }
      return { ...outcome, dialogs: said };
    } finally {
      release();
    }
  };
})();
