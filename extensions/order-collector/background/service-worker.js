const ICECREAM_MALL_URL = "https://po.i-screammall.co.kr/main.do";
const ICECREAM_MALL_TAB_MATCHES = [
  "https://*.i-screammall.co.kr/*",
  "https://*.i-screammedia.com/*",
  "https://*.i-screammedia.co.kr/*",
];
const SELLPIA_ORDER_UPLOAD_URL = "https://kiditem.sellpia.com/order_collect.html?ctype=OM_FILE";
const SELLPIA_TAB_MATCHES = ["https://*.sellpia.com/*"];
const ICECREAM_DELIVERY_HEADERS = [
  "No",
  "주문번호",
  "배송번호",
  "사이트",
  "주문완료일시",
  "주문구분",
  "주문내역구분",
  "주문내역상태",
  "배송유형",
  "배송종류",
  "배송처리유형",
  "택배사",
  "송장번호",
  "배송조회",
  "주문판매유형",
  "거래명세서동봉여부",
  "합배송여부",
  "직배변경 사유",
  "상품번호",
  "상품명",
  "단품명",
  "출고수량",
  "추가입력옵션",
  "증정품",
  "정상가",
  "판매가",
  "판매가(합계)",
  "공급가",
  "공급가(합계)",
  "배송비",
  "Y주문번호",
  "입점사",
  "회원ID",
  "주문자",
  "수취인",
  "수취인휴대폰번호",
  "우편번호",
  "배송지",
  "배송요청사항",
  "배송지시일시",
  "출고지시일시",
  "출고완료일시",
];

chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === "ping") {
    sendResponse({
      success: true,
      version: chrome.runtime.getManifest().version,
      capabilities: {
        orderCollectionIcecreamMall: true,
      },
    });
    return false;
  }

  if (msg?.action === "collectIcecreamMallOrders") {
    collectIcecreamMallOrders(
      typeof msg.date === "string" ? msg.date : null,
      normalizeIcecreamMallCredentials(msg.credentials),
    )
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "아이스크림몰 주문 수집 실패",
        });
      });
    return true;
  }

  if (msg?.action === "sendOrderFileToSellpia") {
    sendOrderFileToSellpia({
      shopName: typeof msg.shopName === "string" ? msg.shopName : null,
      fileName: typeof msg.fileName === "string" ? msg.fileName : null,
      fileBase64: typeof msg.fileBase64 === "string" ? msg.fileBase64 : null,
    })
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error?.message || "셀피아 전송 실패",
        });
      });
    return true;
  }

  return false;
});

function normalizeIcecreamMallCredentials(value) {
  if (!value || typeof value !== "object") return null;
  const loginId = typeof value.loginId === "string" ? value.loginId.trim() : "";
  const password = typeof value.password === "string" ? value.password : "";
  if (!loginId || !password) return null;
  return { loginId, password };
}

// ── 셀피아 전송 (API 아님 — order_collect 화면에 판매처 선택 + 파일 주입 + 주문접수 클릭) ──
async function sendOrderFileToSellpia({ shopName, fileName, fileBase64 }) {
  if (!fileBase64 || !fileName) {
    return { success: false, error: "셀피아로 보낼 파일이 없습니다." };
  }

  const tab = await findOrCreateSellpiaTab();
  if (!tab.id) {
    return { success: false, error: "셀피아 탭을 열 수 없습니다." };
  }

  await waitForTabReady(tab.id);

  const injected = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectSellpiaOrderFile,
      args: [{ shopName: shopName || null, fileName, fileBase64 }],
    }),
    45000,
    "셀피아 주문접수 화면 주입 시간이 초과되었습니다.",
  );

  const result = injected[0]?.result ?? {
    success: false,
    error: "셀피아 주문접수 화면에 접근하지 못했습니다.",
  };
  const currentTab = await chrome.tabs.get(tab.id).catch(() => tab);
  return { ...result, url: currentTab.url || tab.url || SELLPIA_ORDER_UPLOAD_URL };
}

async function findOrCreateSellpiaTab() {
  const tabs = await chrome.tabs.query({ url: SELLPIA_TAB_MATCHES });
  const onUploadPage = tabs.find((tab) => (tab.url || "").includes("order_collect.html"));
  if (onUploadPage?.id) {
    await chrome.tabs.update(onUploadPage.id, { active: true });
    return onUploadPage;
  }
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: SELLPIA_ORDER_UPLOAD_URL, active: true });
    return chrome.tabs.get(tabs[0].id);
  }
  return chrome.tabs.create({ url: SELLPIA_ORDER_UPLOAD_URL, active: true });
}

async function injectSellpiaOrderFile(payload) {
  const shopName = payload.shopName;
  const fileName = payload.fileName;
  const fileBase64 = payload.fileBase64;
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // 0) 화면/판매처 옵션 로딩 대기 — 새 탭은 옵션이 AJAX 로 늦게 채워진다.
  let shopSelect = null;
  let matched = null;
  const target = (shopName || "").replace(/\s+/g, "");
  const pageReadyAt = Date.now() + 10000;
  while (Date.now() < pageReadyAt) {
    shopSelect = document.getElementById("search_om_shop");
    if (shopSelect && shopSelect.options.length > 1) {
      if (!shopName) break;
      matched = Array.from(shopSelect.options).find(
        (option) =>
          option.value && String(option.textContent || "").replace(/\s+/g, "").includes(target),
      );
      if (matched) break;
    }
    await delay(300);
  }

  const fileInput = document.getElementById("userfile");
  const submitButton = document.getElementById("btn_om_upload");

  if (!shopSelect || !fileInput) {
    return {
      success: false,
      pendingPage: true,
      error:
        "셀피아 주문접수(파일 업로드) 화면 요소를 찾지 못했습니다. order_collect 화면이 열렸는지/로그인 상태인지 확인해주세요.",
    };
  }
  if (shopName && !matched) {
    return {
      success: false,
      error: `셀피아 판매처 목록에서 '${shopName}' 을(를) 찾지 못했습니다. 셀피아 거래처 등록을 확인해주세요.`,
    };
  }

  // 1) 판매처 선택 — 셀피아가 이 시점에 엑셀양식을 비동기로 자동 로드한다.
  if (matched) setSelectValue(shopSelect, matched.value);

  // 2) 엑셀양식(om_excelformed) 자동 로드 대기 — 이걸 안 기다리고 주문접수하면
  //    "엑셀양식이 정해지지 않았습니다" 에러. (탭이 이미 열려 있으면 즉시 통과)
  const excelSelect = document.getElementById("om_excelformed");
  if (excelSelect) {
    const excelReadyAt = Date.now() + 10000;
    while (Date.now() < excelReadyAt && !excelSelect.value) {
      await delay(300);
    }
    if (!excelSelect.value) {
      return {
        success: false,
        shop: matched ? String(matched.textContent || "").trim() : null,
        error:
          "셀피아 엑셀양식이 자동으로 설정되지 않았습니다. 해당 판매처의 엑셀양식을 셀피아에서 먼저 설정해주세요.",
      };
    }
  }

  // 3) 파일 주입 (file input 은 값 직접 설정 불가 → DataTransfer 로 files 세팅)
  let bytes;
  try {
    bytes = base64ToBytes(fileBase64);
  } catch (error) {
    return { success: false, error: "전송 파일 디코딩에 실패했습니다." };
  }
  const file = new File([bytes], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  fileInput.dispatchEvent(new Event("input", { bubbles: true }));
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  if (fileInput.files.length !== 1) {
    return {
      success: false,
      shop: matched ? String(matched.textContent || "").trim() : null,
      error: "셀피아 파일 입력칸에 파일을 넣지 못했습니다.",
    };
  }

  // 4) 주문접수 클릭 (om_fileupload())
  if (!submitButton) {
    return {
      success: false,
      shop: matched ? String(matched.textContent || "").trim() : null,
      fileName,
      error: "파일은 주입했지만 '주문접수' 버튼을 찾지 못했습니다.",
    };
  }
  submitButton.click();

  return {
    success: true,
    submitted: true,
    shop: matched ? String(matched.textContent || "").trim() : null,
    excelFormat: excelSelect ? excelSelect.value : null,
    fileName,
  };

  function setSelectValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const length = binary.length;
    const result = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      result[i] = binary.charCodeAt(i);
    }
    return result;
  }
}

async function collectIcecreamMallOrders(date, credentials) {
  const tab = await findOrCreateIcecreamMallTab();
  if (!tab.id) {
    return { success: false, error: "아이스크림몰 탭을 열 수 없습니다." };
  }

  await waitForTabReady(tab.id);
  const login = await withTimeout(
    ensureIcecreamMallLogin(tab.id, credentials),
    35000,
    "아이스크림몰 로그인 자동 입력 시간이 초과되었습니다.",
  );
  if (!login.success) {
    const currentTab = await chrome.tabs.get(tab.id).catch(() => tab);
    return {
      success: false,
      pendingLogin: login.pendingLogin ?? true,
      url: currentTab.url || tab.url || ICECREAM_MALL_URL,
      error: login.error || "아이스크림몰 로그인 자동 입력에 실패했습니다.",
    };
  }

  const deliveryInquiry = await withTimeout(
    openIcecreamMallDeliveryInquiry(tab.id),
    15000,
    "아이스크림몰 배송조회 화면 이동 시간이 초과되었습니다.",
  );
  if (!deliveryInquiry.success) {
    const currentTab = await chrome.tabs.get(tab.id).catch(() => tab);
    return {
      success: false,
      pendingLogin: deliveryInquiry.pendingLogin,
      url: currentTab.url || tab.url || ICECREAM_MALL_URL,
      error: deliveryInquiry.error,
    };
  }

  const deliveryFrameId = await findIcecreamMallDeliveryFrameId(tab.id);
  const target =
    deliveryFrameId == null ? { tabId: tab.id, allFrames: true } : { tabId: tab.id, frameIds: [deliveryFrameId] };
  const injected = await withTimeout(
    chrome.scripting.executeScript({
      target,
      func: scrapeIcecreamMallDeliveryGrid,
      args: [date, ICECREAM_DELIVERY_HEADERS],
    }),
    28000,
    "아이스크림몰 배송목록 수집 시간이 초과되었습니다.",
  );

  const results = injected.map((item) => item.result).filter(Boolean);
  const candidates = results.filter((item) => item?.success && Array.isArray(item.rows));
  candidates.sort((a, b) => b.rows.length - a.rows.length);
  const best = candidates[0];

  if (!best) {
    const failure = summarizeScrapeFailures(results);
    return {
      success: false,
      pendingLogin: false,
      url: tab.url || ICECREAM_MALL_URL,
      error: failure || "아이스크림몰 배송조회 화면은 열었지만 배송목록 표를 찾지 못했습니다.",
    };
  }

  return {
    success: true,
    tabId: tab.id,
    url: tab.url || ICECREAM_MALL_URL,
    ...best,
  };
}

async function findIcecreamMallDeliveryFrameId(tabId) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: detectIcecreamMallDeliveryFrame,
  });
  const candidates = injected
    .filter((item) => item.result?.candidate)
    .sort((a, b) => (b.result.score || 0) - (a.result.score || 0));
  return candidates[0]?.frameId ?? null;
}

function detectIcecreamMallDeliveryFrame() {
  const text = document.body?.innerText || "";
  const compact = text.replace(/\s+/g, "");
  const href = location.href || "";
  let score = 0;
  if (href.includes("deliveryInquiry.deliveryInquiryListView")) score += 10;
  if (compact.includes("배송조회")) score += 5;
  if (compact.includes("배송목록")) score += 5;
  if (compact.includes("주문번호") && compact.includes("배송번호")) score += 5;
  if (compact.includes("상품번호") || compact.includes("상품명")) score += 2;
  return {
    candidate: score > 0,
    score,
    href,
  };
}

function summarizeScrapeFailures(results) {
  const reasons = results.map((item) => item?.reason).filter(Boolean);
  if (reasons.includes("data rows not found")) {
    return "배송목록 표는 찾았지만 주문 행을 찾지 못했습니다. 조회일 또는 배송목록 결과를 확인해주세요.";
  }
  if (reasons.includes("header not found")) {
    return "배송조회 화면은 열었지만 배송목록 표 머리글을 찾지 못했습니다. 표가 로딩된 뒤 다시 시도해주세요.";
  }
  if (reasons.includes("not delivery inquiry frame")) {
    return "배송조회 화면은 열었지만 수집 가능한 배송조회 프레임을 찾지 못했습니다.";
  }
  return "";
}

async function findOrCreateIcecreamMallTab() {
  const tabs = await chrome.tabs.query({ url: ICECREAM_MALL_TAB_MATCHES });
  const active = tabs.find((tab) => tab.active) || tabs[0];
  if (active) return active;

  return chrome.tabs.create({ url: ICECREAM_MALL_URL, active: true });
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function waitForTabReady(tabId) {
  return new Promise((resolve) => {
    const done = () => resolve();
    const timeout = setTimeout(done, 10000);

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || tab?.status === "complete") {
        clearTimeout(timeout);
        done();
        return;
      }

      const listener = (updatedTabId, info) => {
        if (updatedTabId !== tabId || info.status !== "complete") return;
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeout);
        done();
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

async function ensureIcecreamMallLogin(tabId, credentials) {
  if (!credentials) return { success: true, submitted: false };

  // 로그인 페이지는 main.do → loginForm.do 리다이렉트 + JS 렌더라 늦게 뜬다.
  // 첫 스캔에서 폼이 덜 그려졌다고 바로 실패 처리하지 말고, 창 안에서 계속 재시도한다.
  const loginDetectExpiresAt = Date.now() + 15000;
  let sawLoginForm = false;
  let lastIncompleteReason = null;

  while (Date.now() < loginDetectExpiresAt) {
    const injected = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: autoSubmitIcecreamMallLogin,
      args: [credentials],
    });
    const results = injected.map((item) => item.result).filter(Boolean);

    if (results.some((item) => item.state === "submitted")) {
      return waitForIcecreamMallLoginComplete(tabId);
    }
    if (results.some((item) => item.state === "credentials-missing")) {
      return {
        success: false,
        submitted: false,
        pendingLogin: true,
        error: "아이스크림몰 계정 ID와 비밀번호가 저장되어 있지 않습니다.",
      };
    }
    const incomplete = results.find((item) => item.state === "incomplete");
    if (incomplete) {
      sawLoginForm = true;
      lastIncompleteReason = incomplete.reason || lastIncompleteReason;
    }

    await delay(500);
  }

  if (sawLoginForm) {
    return {
      success: false,
      submitted: false,
      pendingLogin: true,
      error: `아이스크림몰 로그인 폼은 찾았지만 자동 로그인을 완료하지 못했습니다 (${lastIncompleteReason || "unknown"}). 로그인 화면 구조가 바뀌었을 수 있습니다.`,
    };
  }

  // 창 내내 로그인 폼(비밀번호 입력칸)을 한 번도 못 봤으면 이미 로그인된 상태로 본다.
  return { success: true, submitted: false };
}

async function waitForIcecreamMallLoginComplete(tabId) {
  const expiresAt = Date.now() + 25000;
  while (Date.now() < expiresAt) {
    await delay(500);
    await waitForTabReady(tabId);
    const state = await detectIcecreamMallLoginInFrames(tabId);
    if (!state.loginPage) {
      return { success: true, submitted: true };
    }
  }

  return {
    success: false,
    submitted: true,
    pendingLogin: true,
    error: "아이스크림몰 로그인 자동 입력은 완료했지만 로그인 후 화면으로 넘어가지 않았습니다. 계정 정보를 확인해주세요.",
  };
}

async function detectIcecreamMallLoginInFrames(tabId) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: detectIcecreamMallLoginState,
  });
  const frames = injected.map((item) => item.result).filter(Boolean);
  return {
    loginPage: frames.some((item) => item.loginPage),
    frames,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectIcecreamMallLoginState() {
  const passwordInput = findPasswordInput();
  return {
    loginPage: Boolean(passwordInput),
    href: location.href,
  };

  function findPasswordInput() {
    return Array.from(document.querySelectorAll("input")).find((input) => {
      const type = String(input.type || "").toLowerCase();
      const descriptor = inputDescriptor(input);
      return isVisibleInput(input) && (type === "password" || descriptor.includes("비밀번호") || descriptor.includes("password") || descriptor.includes("passwd") || descriptor.includes("pwd"));
    });
  }

  function inputDescriptor(input) {
    return [
      input.name,
      input.id,
      input.placeholder,
      input.title,
      input.getAttribute("aria-label"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function isVisibleInput(input) {
    const rect = input.getBoundingClientRect();
    const style = window.getComputedStyle(input);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      !input.disabled
    );
  }
}

function autoSubmitIcecreamMallLogin(credentials) {
  const passwordInput = pickPasswordInput();
  if (!passwordInput) {
    // 비밀번호 입력칸이 아직 없음 → 로그인 폼 미표시(이미 로그인했거나 렌더 전). 호출부에서 재시도.
    return { state: "no-login-form" };
  }

  if (!credentials || !credentials.loginId || !credentials.password) {
    return { state: "credentials-missing" };
  }

  const loginInput = pickLoginIdInput(passwordInput);
  if (!loginInput) {
    // 비번칸은 떴는데 ID칸이 아직 안 보임 → 다음 스캔에서 재시도.
    return { state: "incomplete", reason: "id-input-not-found" };
  }

  setInputValue(loginInput, credentials.loginId);
  setInputValue(passwordInput, credentials.password);

  if (triggerLogin(passwordInput)) {
    return { state: "submitted" };
  }
  return { state: "incomplete", reason: "submit-not-found" };

  // 아이스크림몰 정확 셀렉터(#password) 우선, 못 찾으면 일반 휴리스틱.
  function pickPasswordInput() {
    const exact = document.querySelector("input#password, input[name='password']");
    if (exact && isVisibleInput(exact)) return exact;
    return (
      Array.from(document.querySelectorAll("input")).find((input) => {
        const type = String(input.type || "").toLowerCase();
        const descriptor = inputDescriptor(input);
        return (
          isVisibleInput(input) &&
          (type === "password" ||
            descriptor.includes("비밀번호") ||
            descriptor.includes("password") ||
            descriptor.includes("passwd") ||
            descriptor.includes("pwd"))
        );
      }) || null
    );
  }

  // 아이스크림몰 정확 셀렉터(#loginId) 우선, 못 찾으면 폼/문서에서 랭킹.
  function pickLoginIdInput(anchor) {
    const exact = document.querySelector("input#loginId, input[name='loginId']");
    if (exact && isVisibleInput(exact)) return exact;
    const form = anchor.closest("form") || document;
    let inputs = textInputs(form);
    if (inputs.length === 0 && form !== document) inputs = textInputs(document);
    return rankLoginInputs(inputs, anchor)[0] || null;
  }

  function textInputs(root) {
    return Array.from(root.querySelectorAll("input")).filter((input) => {
      const type = String(input.type || "text").toLowerCase();
      return ["", "text", "email", "tel", "search", "number"].includes(type) && isVisibleInput(input);
    });
  }

  // 1) onclick 에 doLogin 이 든 컨트롤 → 2) 텍스트가 "로그인" → 3) form submit 순으로 시도.
  function triggerLogin(anchor) {
    const byHandler = Array.from(
      document.querySelectorAll("a,button,input[type='button'],[role='button'],[onclick]"),
    )
      .filter(isVisibleControl)
      .find((el) => /dologin/i.test(el.getAttribute("onclick") || ""));
    if (byHandler) {
      byHandler.click();
      return true;
    }

    const form = anchor.closest("form");
    const byText = findLoginControl(form || document) || (form ? findLoginControl(document) : null);
    if (byText) {
      byText.click();
      return true;
    }

    if (form) {
      const submitControl = Array.from(
        form.querySelectorAll("input[type='submit'],button[type='submit']"),
      ).filter(isVisibleControl)[0];
      if (submitControl) {
        submitControl.click();
        return true;
      }
      if (form.requestSubmit) {
        form.requestSubmit();
        return true;
      }
      if (form.submit) {
        form.submit();
        return true;
      }
    }
    return false;
  }

  function findLoginControl(root) {
    const controls = Array.from(
      root.querySelectorAll("a,button,input[type='button'],input[type='submit'],[role='button'],[onclick]"),
    ).filter(isVisibleControl);
    return (
      controls.find((control) => {
        const text = String(
          control.textContent ||
            control.value ||
            control.getAttribute("title") ||
            control.getAttribute("aria-label") ||
            "",
        )
          .replace(/\s+/g, " ")
          .trim();
        return text === "로그인" || text.toLowerCase() === "login";
      }) || null
    );
  }

  function rankLoginInputs(inputs, anchor) {
    return inputs
      .map((input) => ({ input, score: loginInputScore(input, anchor) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.input);
  }

  function loginInputScore(input, anchor) {
    const descriptor = [
      input.name,
      input.id,
      input.placeholder,
      input.title,
      input.getAttribute("aria-label"),
      associatedLabelText(input),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    let score = 1;
    if (descriptor.includes("아이디")) score += 6;
    if (descriptor.includes("loginid")) score += 6;
    if (descriptor.includes("id")) score += 4;
    if (descriptor.includes("login")) score += 4;
    if (descriptor.includes("user")) score += 3;
    if (descriptor.includes("email")) score += 2;
    if (anchor && input.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING) score += 3;
    return score;
  }

  function associatedLabelText(input) {
    const labels = [];
    if (input.labels) {
      labels.push(...Array.from(input.labels).map((label) => label.textContent || ""));
    }
    const parentLabel = input.closest("label");
    if (parentLabel) labels.push(parentLabel.textContent || "");
    return labels.join(" ");
  }

  function setInputValue(input, value) {
    const prototype = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function isVisibleInput(input) {
    return isVisibleControl(input) && !input.readOnly;
  }

  function inputDescriptor(input) {
    return [
      input.name,
      input.id,
      input.placeholder,
      input.title,
      input.getAttribute("aria-label"),
      associatedLabelText(input),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function isVisibleControl(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      !element.disabled
    );
  }
}

async function openIcecreamMallDeliveryInquiry(tabId) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    func: ensureIcecreamMallDeliveryInquiry,
  });

  return injected[0]?.result ?? {
    success: false,
    pendingLogin: true,
    error: "아이스크림몰 화면에 접근하지 못했습니다. 로그인 상태를 확인해주세요.",
  };
}

async function ensureIcecreamMallDeliveryInquiry() {
  function hasDeliveryInquiryText(text) {
    const compact = String(text || "").replace(/\s+/g, "");
    return (
      compact.includes("배송조회") ||
      (compact.includes("배송목록") && compact.includes("주문번호") && compact.includes("배송번호"))
    );
  }

  function hasDeliveryInquiryFrame() {
    const bodyText = document.body?.innerText || "";
    if (hasDeliveryInquiryText(bodyText)) {
      return true;
    }

    return Array.from(document.querySelectorAll("iframe,frame")).some((frame) => {
      const src = String(frame.getAttribute("src") || "");
      if (src.includes("deliveryInquiry.deliveryInquiryListView")) return true;

      try {
        const frameText = frame.contentDocument?.body?.innerText || "";
        return hasDeliveryInquiryText(frameText);
      } catch {
        return false;
      }
    });
  }

  function clickDeliveryInquiryMenu() {
    const candidates = menuCandidates();
    const exact = candidates.find((item) => item.text === "배송 조회" || item.text === "배송조회");
    if (exact) {
      exact.element.click();
      return true;
    }

    const deliverySection = candidates.find((item) => item.text === "배송");
    deliverySection?.element.click();

    const afterSectionClick = menuCandidates().find(
      (item) => item.text === "배송 조회" || item.text === "배송조회",
    );
    if (afterSectionClick) {
      afterSectionClick.element.click();
      return true;
    }

    return false;
  }

  function menuCandidates() {
    return Array.from(
      document.querySelectorAll("a,button,input[type='button'],[role='button'],[onclick]"),
    )
      .map((element) => ({
        element,
        text: String(
          element.textContent ||
            element.value ||
            element.getAttribute("title") ||
            element.getAttribute("aria-label") ||
            "",
        )
          .replace(/\s+/g, " ")
          .trim(),
      }))
      .filter((item) => item.text.includes("배송"));
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  if (hasDeliveryInquiryFrame()) {
    return { success: true, opened: false };
  }

  const clicked = clickDeliveryInquiryMenu();
  if (!clicked) {
    const bodyText = document.body?.innerText || "";
    return {
      success: false,
      pendingLogin: !bodyText.includes("배송"),
      error: "아이스크림몰 배송조회 메뉴를 찾지 못했습니다. 로그인 후 다시 시도해주세요.",
    };
  }

  const expiresAt = Date.now() + 12000;
  while (Date.now() < expiresAt) {
    if (hasDeliveryInquiryFrame()) {
      return { success: true, opened: true };
    }
    await delay(400);
  }

  return {
    success: false,
    pendingLogin: false,
    error: "배송조회 메뉴를 눌렀지만 배송목록 화면이 열리지 않았습니다.",
  };
}

async function scrapeIcecreamMallDeliveryGrid(date, expectedHeaders) {
  function hasDeliveryInquiryText(text) {
    const compact = String(text || "").replace(/\s+/g, "");
    return (
      compact.includes("배송조회") ||
      (compact.includes("배송목록") && compact.includes("주문번호") && compact.includes("배송번호"))
    );
  }

  function setDateRange(value) {
    const dateInputs = Array.from(document.querySelectorAll("input"))
      .filter((input) => /^\d{4}-\d{2}-\d{2}$/.test(String(input.value || "")));
    dateInputs.slice(0, 2).forEach((input) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    return dateInputs.length >= 2;
  }

  function clickSearchButton() {
    const controls = Array.from(document.querySelectorAll("a,button,input[type='button']"));
    const search = controls.find((control) => {
      const text = String(control.textContent || control.value || "").replace(/\s+/g, " ").trim();
      return text === "조회";
    });
    search?.click();
  }

  function findHeaderCells() {
    const candidates = collectCandidateRows()
      .map((row) => cellTexts(row))
      .filter((cells) => cells.length > 0);
    const header = candidates
      .map(normalizeHeaderCells)
      .filter((cells) => isDeliveryHeader(cells))
      .sort((a, b) => b.length - a.length)[0];

    const hasOrderRows = candidates.some((cells) =>
      cells.some((cell) => /^\d{8}M\d+/.test(cell || "")),
    );
    if (header && header.length >= 20) return header;
    return hasOrderRows ? expectedHeaders : header ?? [];
  }

  function findDataRows(headers) {
    const columnCount = headers.length;
    const rows = [];
    const seen = new Set();
    for (const row of collectCandidateRows()) {
      const cells = cellTexts(row);
      const orderIndex = cells.findIndex((cell) => /^\d{8}M\d+/.test(cell || ""));
      if (orderIndex < 0) continue;

      const hasNoColumn = headers[0] === "No";
      const start =
        hasNoColumn && orderIndex > 0 && /^\d+$/.test(cells[orderIndex - 1] || "")
          ? orderIndex - 1
          : orderIndex;
      if (cells.length - start < Math.min(columnCount, 12)) continue;

      const normalized = cells.slice(start, start + columnCount);
      while (normalized.length < columnCount) normalized.push("");

      const key = normalized.join("\u001f");
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(normalized);
    }
    return rows;
  }

  function collectCandidateRows() {
    const selectors = [
      "table tr",
      "[role='row']",
      ".slick-row",
      ".aui-grid-row",
      ".tui-grid-row",
      ".x-grid-row",
      ".ui-jqgrid-btable tr",
    ];
    return Array.from(document.querySelectorAll(selectors.join(",")));
  }

  function cellTexts(row) {
    const cells = Array.from(
      row.matches("tr")
        ? row.querySelectorAll("th,td")
        : row.querySelectorAll(
            [
              "[role='columnheader']",
              "[role='gridcell']",
              ".slick-cell",
              ".aui-grid-cell",
              ".tui-grid-cell",
              ".x-grid-cell",
              "th",
              "td",
            ].join(","),
          ),
    );
    return cells.map((cell) =>
      String(cell.textContent || "").replace(/\s+/g, " ").trim(),
    );
  }

  function normalizeHeaderCells(cells) {
    return cells.map((cell) => {
      if (cell === "거래명세서통봉여부") return "거래명세서동봉여부";
      return cell;
    });
  }

  function isDeliveryHeader(cells) {
    const compact = cells.join("\u001f");
    return (
      cells.includes("주문번호") &&
      cells.includes("배송번호") &&
      cells.includes("주문완료일시") &&
      (cells.includes("상품번호") || compact.includes("상품번호")) &&
      (cells.includes("상품명") || compact.includes("상품명"))
    );
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const bodyText = document.body?.innerText || "";
  if (!hasDeliveryInquiryText(bodyText)) {
    return { success: false, reason: "not delivery inquiry frame" };
  }

  if (date && setDateRange(date)) {
    clickSearchButton();
  }

  let headers = [];
  let rows = [];
  const expiresAt = Date.now() + 10000;
  while (Date.now() < expiresAt) {
    headers = findHeaderCells();
    rows = headers.length >= 20 ? findDataRows(headers) : [];
    if (headers.length >= 20 && rows.length > 0) break;
    await delay(400);
  }

  if (headers.length < 20 || !headers.includes("주문번호") || !headers.includes("배송번호")) {
    return { success: false, reason: "header not found", headerCount: headers.length };
  }
  if (rows.length === 0) return { success: false, reason: "data rows not found", headerCount: headers.length };

  const masked = rows.some((row) => row.some((cell) => /\*{2,}/.test(cell)));
  return {
    success: true,
    mall: "아이스크림몰",
    date: date || null,
    headers,
    rows,
    rowCount: rows.length,
    masked,
    source: "icecream-mall-delivery-grid",
  };
}
