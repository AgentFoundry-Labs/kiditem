(function initializeKidsnoteProductRegister(root) {
  "use strict";

  // 키즈노트(WISA 스마트윙) 입점사 상품등록 폼 자동 채움.
  //
  // 쿠팡 WING 과 같은 자리지만 세 가지가 다르다.
  //  1. 이미지가 CDN URL 이 아니라 `input[type=file]` 이다. 페이지에서 우리 MinIO 를
  //     fetch 하면 CORS 로 막히므로 **서비스워커가 받아 data URL 로 넘긴다.**
  //  2. 상품정보제공고시는 `fieldset` 을 고른 뒤에야 `field{N}` textarea 가 생긴다.
  //     그래서 고시 값을 넣기 전에 생성될 때까지 기다린다.
  //  3. 상세설명은 두 단계다. 먼저 `up_fdisk` 호스팅 업로더(filetype=3)에 이미지를
  //     올려 **키즈노트 URL** 을 받고, 그 URL 로 `content2` HTML 을 만든다.
  //     우리 MinIO URL 을 그대로 넣으면 구매자 브라우저에서 상세페이지가 안 열린다.
  //
  // ⚠️ 제출하지 않는다. 키즈노트 등록은 몰 승인이 붙는 신청이라 되돌리기 어렵다.
  //    폼만 채우고 사람이 화면에서 확인한 뒤 누른다.

  const REGISTER_ORIGIN = "https://shop.kidsnote.com";
  const REGISTER_PATH = "/_manage/";
  const REGISTER_BODY = "product@product_register";
  const IMAGE_SLOTS = new Set(["upfile1", "upfile2", "upfile3"]);
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  const TAB_LOAD_TIMEOUT_MS = 60000;

  function isRegisterUrl(value) {
    if (typeof value !== "string" || !value.trim()) return false;
    let url;
    try {
      url = new URL(value.trim());
    } catch {
      return false;
    }
    return url.origin === REGISTER_ORIGIN
      && url.pathname === REGISTER_PATH
      && url.searchParams.get("body") === REGISTER_BODY;
  }

  /** 폼 지시가 우리가 만든 모양인지 본다. 임의 페이지에 임의 값을 넣지 않게 하는 문지기다. */
  function normalizeForm(value) {
    if (!value || typeof value !== "object") throw new Error("폼 데이터가 없습니다.");
    if (!isRegisterUrl(value.url)) throw new Error("키즈노트 상품등록 주소가 아닙니다.");
    if (value.formId !== "prdFrm") throw new Error("알 수 없는 폼입니다.");

    const fields = {};
    for (const [name, fieldValue] of Object.entries(value.fields || {})) {
      if (typeof name !== "string" || !name) continue;
      fields[name] = fieldValue === null || fieldValue === undefined ? "" : String(fieldValue);
    }
    const radios = {};
    for (const [name, radioValue] of Object.entries(value.radios || {})) {
      if (typeof name === "string" && name) radios[name] = String(radioValue);
    }
    const fileUploads = (Array.isArray(value.fileUploads) ? value.fileUploads : [])
      .filter((entry) => entry && IMAGE_SLOTS.has(entry.name) && typeof entry.url === "string");
    // 상세설명 이미지는 몰 호스팅에 올린 뒤 그 URL 로 HTML 을 만든다.
    const detailUploads = (Array.isArray(value.detailUploads) ? value.detailUploads : [])
      .filter((entry) => entry && typeof entry.url === "string");

    return {
      url: value.url,
      fields,
      checks: (Array.isArray(value.checks) ? value.checks : []).filter((n) => typeof n === "string"),
      radios,
      fileUploads,
      detailUploads,
      detailHtmlTarget: typeof value.detailHtmlTarget === "string" ? value.detailHtmlTarget : "",
      manualSteps: (Array.isArray(value.manualSteps) ? value.manualSteps : [])
        .filter((step) => typeof step === "string"),
    };
  }

  /**
   * 페이지 안에서 실행되는 채움 함수.
   *
   * 클로저를 못 쓰므로 필요한 것은 전부 인자로 받는다.
   */
  function fillKidsnoteProductForm(payload) {
    const steps = [];
    const warnings = [];
    const form = document.querySelector("#prdFrm");
    if (!form) {
      return { ok: false, error: "상품등록 폼(#prdFrm)이 없습니다. 로그인 상태와 화면을 확인하세요." };
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

  function create(options) {
    const chromeApi = options.chrome;
    const fetchFn = options.fetch;
    const interactiveTabs = options.interactiveTabs;
    const tabReason = options.tabReason;

    function waitForTabComplete(tabId, timeoutMs) {
      return new Promise((resolve) => {
        let done = false;
        let timer = null;
        const finish = (value) => {
          if (done) return;
          done = true;
          // 타이머를 남겨두면 성공한 뒤에도 워커가 깨어 있다.
          if (timer !== null) clearTimeout(timer);
          try { chromeApi.tabs.onUpdated.removeListener(listener); } catch { /* noop */ }
          resolve(value);
        };
        const listener = (changedTabId, info) => {
          if (changedTabId === tabId && info.status === "complete") finish(true);
        };
        chromeApi.tabs.onUpdated.addListener(listener);
        timer = setTimeout(() => finish(false), timeoutMs);
      });
    }

    /** 이미지는 워커가 받는다. 페이지에서 MinIO 를 직접 부르면 CORS 로 막힌다. */
    async function fetchImages(fileUploads) {
      const images = [];
      const failures = [];
      for (const upload of fileUploads) {
        try {
          const response = await fetchFn(upload.url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          if (blob.size > MAX_IMAGE_BYTES) throw new Error("이미지가 8MB 를 넘습니다.");
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("이미지 인코딩 실패"));
            reader.readAsDataURL(blob);
          });
          const fileName = (upload.url.split("/").pop() || "image.jpg").split("?")[0];
          images.push({ name: upload.name, dataUrl, fileName });
        } catch (error) {
          failures.push(`${upload.name}: ${error?.message || error}`);
        }
      }
      return { images, failures };
    }

    async function register(message) {
      let form;
      try {
        form = normalizeForm(message?.form);
      } catch (error) {
        return { ok: false, error: error?.message || "폼 데이터가 올바르지 않습니다." };
      }

      const { images, failures } = await fetchImages(form.fileUploads);
      const detail = await fetchImages(form.detailUploads.map((entry, index) => ({
        name: `detail${index + 1}`,
        url: entry.url,
      })));

      const tab = await interactiveTabs.createTab({ url: form.url, reason: tabReason });
      const loaded = await waitForTabComplete(tab.id, TAB_LOAD_TIMEOUT_MS);
      if (!loaded) {
        return { ok: false, tabId: tab.id, error: "키즈노트 상품등록 화면 로딩이 시간을 넘겼습니다." };
      }

      let injected;
      try {
        const [result] = await chromeApi.scripting.executeScript({
          target: { tabId: tab.id },
          func: fillKidsnoteProductForm,
          args: [{ ...form, images, detailImages: detail.images }],
        });
        injected = result?.result;
      } catch (error) {
        return {
          ok: false,
          tabId: tab.id,
          error: `폼 자동 채우기에 실패했습니다: ${error?.message || error}`,
        };
      }
      if (!injected?.ok) {
        return { ok: false, tabId: tab.id, error: injected?.error || "폼을 채우지 못했습니다." };
      }

      return {
        ok: true,
        tabId: tab.id,
        submitted: false,
        steps: injected.steps,
        warnings: [
          ...failures.map((f) => `이미지 다운로드 실패 — ${f}`),
          ...detail.failures.map((f) => `상세 이미지 다운로드 실패 — ${f}`),
          ...(injected.warnings || []),
        ],
        manualSteps: form.manualSteps,
      };
    }

    return Object.freeze({ register });
  }

  root.KidItemKidsnoteProductRegister = Object.freeze({
    create,
    isRegisterUrl,
    normalizeForm,
    fillKidsnoteProductForm,
  });
})(globalThis);
