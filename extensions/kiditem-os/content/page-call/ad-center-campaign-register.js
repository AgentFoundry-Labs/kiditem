// 쿠팡 광고센터 캠페인 등록(ISOLATED world, KID-386 — 옛 `content/coupang/ads-report.js`의 캠페인 등록 실행 이식).
// 확장 런타임 사이트(`extensions/src/sites/ad-center/campaign.ts`)가 `page-call/bridge.js`와 함께 넣고 부른다:
//   `adCenter.campaignFill`   — 광고 목표 화면(`/marketing/campaign/type`)이면 [다음]으로 등록 화면(`/registration`)에 가서
//                               캠페인 이름·광고그룹·상품 검색/선택·운영 방식·일 예산·목표 ROAS를 채운다. [완료]는 누르지 않는다.
//   `adCenter.campaignSubmit` — [완료]를 누르고, 확인 대화상자가 뜨면 그 [등록]·[확인]·[완료]를 누른다.
//   `adCenter.campaignResult` — 누른 뒤 화면(주소의 캠페인 번호, 알림 문구, 남은 검증 문구)을 읽는다(읽기만).
// 셀렉터는 옛 파일이 마지막으로 확인한 것(2026-09)이다. 칸을 못 찾으면 `form_changed`와 그 칸 이름으로 답한다 — 사이트가
// 폼 변경 오류로 바꾼다. 대기는 페이지 타이머로 조건을 다시 보는 `waitFor`다. 자격증명은 다루지 않는다.
(function installAdCenterCampaignRegister() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});

  const TYPE_PATH = "/marketing/campaign/type";
  const REGISTRATION_PATH = "/marketing/campaign/registration";
  /** 옛 sleep 상수(검색 뒤 1.5초, 선택 뒤 0.7초, 운영 방식 뒤 0.5초, 완료·확인 뒤 1.5초)를 조건 대기의 상한·간격으로 옮겼다. */
  const WAIT = {
    page: 10000,
    form: 15000,
    search: 8000,
    select: 3000,
    settle: 500,
    dialog: 5000,
    result: 15000,
    poll: 250,
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function waitFor(check, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const value = check();
      if (value) return value;
      if (Date.now() >= deadline) return null;
      await sleep(WAIT.poll);
    }
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function setNativeValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findClickableByText(patterns, root = document) {
    const nodes = Array.from(root.querySelectorAll("button, a, [role='button'], [role='tab']"));
    return nodes.find((node) => {
      const text = normalizeText(node.innerText || node.textContent).toLowerCase();
      return patterns.some((pattern) => text.includes(pattern));
    }) || null;
  }

  function findCampaignInput(placeholder) {
    return Array.from(document.querySelectorAll("input")).find((input) =>
      normalizeText(input.getAttribute("placeholder")).includes(placeholder),
    ) || null;
  }

  function findDialog() {
    const dialogs = Array.from(document.querySelectorAll("[role='dialog'], .modal, .popup, .layer-popup"));
    return dialogs.find((dialog) => dialog.offsetParent !== null) || null;
  }

  function radio(value) {
    return document.querySelector(`input[type="radio"][value="${value}"]`);
  }

  function choose(input) {
    input.click();
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const at = (path) => window.location.pathname.startsWith(path);
  const changed = (missing) => ({ state: "form_changed", missing });

  /** 등록 화면까지 간다. 옛 ensureCampaignRegistrationPage — 광고 목표는 화면 기본값 그대로 두고 [다음]. */
  async function openRegistration() {
    if (at(REGISTRATION_PATH)) return null;
    if (!at(TYPE_PATH)) {
      const add = findClickableByText(["캠페인 추가", "광고 만들기"]);
      if (!add) return changed("광고 만들기 버튼");
      add.click();
      if (!(await waitFor(() => at(TYPE_PATH) || at(REGISTRATION_PATH), WAIT.page))) return changed("광고 목표 화면");
      if (at(REGISTRATION_PATH)) return null;
    }
    const next = await waitFor(() => findClickableByText(["다음"]), WAIT.page);
    if (!next) return changed("광고 목표 화면의 다음 버튼");
    next.click();
    if (!(await waitFor(() => at(REGISTRATION_PATH), WAIT.page))) return changed("광고 등록 화면");
    return null;
  }

  /**
   * 이 `vendor_item` 행이 그 옵션 id의 행인가. 계획의 id는 리스팅 옵션 id(Wing 옵션 id = 광고센터 `vendor_item` 행의 id)다 —
   * 행이나 그 안 요소의 속성 값이 그 id이거나, 행 글자에 그 id가 적혀 있으면 그 행이다(속성 이름은 실측 전이라 가리지 않는다).
   */
  function rowHasId(row, id) {
    for (const element of [row, ...row.querySelectorAll("*")]) {
      for (const attribute of Array.from(element.attributes || [])) {
        if (String(attribute.value).trim() === id) return true;
      }
    }
    return normalizeText(row.textContent).includes(id);
  }

  /**
   * 옵션 하나를 검색해 고른다. 검색 결과 중 그 옵션 id의 줄, 없으면 결과가 한 줄일 때만 그 줄 — 단 그 줄에 다른 계획 상품
   * (이미 고른 상품 포함)의 번호가 적혀 있으면 앞 상품의 남은 줄이므로 고르지 않는다.
   */
  async function selectProduct(productId, otherIds) {
    const searchInput = findCampaignInput("판매 상품을 검색");
    if (!searchInput) return { missing: "광고 상품 검색칸" };
    const before = new Set(document.querySelectorAll('li[data-bigfoot-component="vendor_item"]'));
    setNativeValue(searchInput, productId);
    searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
    const searchButton = searchInput.closest("div")?.querySelector("button, [role='button']");
    if (searchButton) searchButton.click();

    const rows = await waitFor(() => {
      const list = Array.from(document.querySelectorAll('li[data-bigfoot-component="vendor_item"]'));
      const fresh = list.some((item) => !before.has(item));
      return list.length > 0 && (fresh || list.some((item) => rowHasId(item, productId))) ? list : null;
    }, WAIT.search);
    if (!rows) return { selected: false };
    const exact = rows.find((item) => rowHasId(item, productId));
    const single = rows.length === 1 && !otherIds.some((id) => rowHasId(rows[0], id)) ? rows[0] : null;
    const row = exact || single;
    if (!row) return { selected: false };
    const selectButton = findClickableByText(["상품 선택"], row);
    if (!selectButton) return { missing: "상품 선택 버튼" };
    selectButton.click();
    await sleep(WAIT.select / 4);
    return { selected: true };
  }

  calls["adCenter.campaignFill"] = async function campaignFill(args) {
    const input = args && typeof args === "object" ? args : {};
    const productIds = Array.isArray(input.productIds) ? input.productIds.map(String) : [];
    if (!input.name || productIds.length === 0 || !input.dailyBudget) return { state: "invalid_args" };

    const moved = await openRegistration();
    if (moved) return moved;

    const nameInput = await waitFor(() => findCampaignInput("캠페인 이름"), WAIT.form);
    if (!nameInput) return changed("캠페인 이름 입력칸");
    setNativeValue(nameInput, String(input.name));

    const adGroupInput = document.querySelector("#reg_ad_group_name") || findCampaignInput("그룹 이름");
    if (!adGroupInput) return changed("광고 그룹 이름 입력칸");
    setNativeValue(adGroupInput, String(input.adGroupName || input.name));

    const selected = [];
    const notFound = [];
    for (const productId of productIds) {
      const outcome = await selectProduct(productId, productIds.filter((id) => id !== productId));
      if (outcome.missing) return changed(outcome.missing);
      (outcome.selected ? selected : notFound).push(productId);
    }
    if (notFound.length > 0) return { state: "product_not_found", productIds: notFound, selected };

    // 목표 ROAS가 있으면 자동 운영의 매출 최적화(목표 ROAS), 없으면 자동 운영의 매출 스타트(예산).
    const auto = radio("AUTO");
    const goal = radio(input.targetRoas ? "PRODUCT_TARGET_ROAS" : "PRODUCT_TARGET_BUDGET");
    if (!auto || !goal) return changed("운영 방식 선택");
    choose(auto);
    choose(goal);
    await sleep(WAIT.settle);

    const budgetInput = document.querySelector('[data-testid="budget-input"]') || findCampaignInput("예)30,000");
    if (!budgetInput) return changed("일 예산 입력칸");
    setNativeValue(budgetInput, String(input.dailyBudget));

    if (input.targetRoas) {
      const roasInput = await waitFor(
        () => document.querySelector('[data-bigfoot-component="target_roas"] input[data-bigfoot-component="entry"]'),
        WAIT.select,
      );
      if (!roasInput) return changed("목표 광고수익률 입력칸");
      setNativeValue(roasInput, String(input.targetRoas));
    }
    await sleep(WAIT.settle);
    if (!findClickableByText(["완료"])) return changed("완료 버튼");
    return { state: "filled", selected };
  };

  calls["adCenter.campaignSubmit"] = async function campaignSubmit() {
    if (!at(REGISTRATION_PATH)) return changed("광고 등록 화면");
    const complete = findClickableByText(["완료"]);
    if (!complete) return changed("완료 버튼");
    complete.click();
    const dialog = await waitFor(findDialog, WAIT.dialog);
    if (!dialog) return { state: "pressed", confirmed: false };
    const confirm = findClickableByText(["등록", "확인", "완료"], dialog);
    if (!confirm) return { state: "pressed", confirmed: false };
    confirm.click();
    return { state: "pressed", confirmed: true };
  };

  calls["adCenter.campaignResult"] = async function campaignResult() {
    const VALIDATION = /필수|선택해주세요|입력해주세요|오류|실패/;
    await waitFor(() => !at(REGISTRATION_PATH) || findDialog(), WAIT.result);
    const idMatch = /\/campaign\/(?:detail\/)?(\d+)(?:[/?#]|$)/.exec(window.location.pathname);
    const dialog = findDialog();
    const message = dialog ? normalizeText(dialog.textContent).slice(0, 300) : null;
    const stayed = at(REGISTRATION_PATH);
    const validation = stayed && VALIDATION.test(normalizeText(document.body.textContent))
      ? "등록 화면에 검증 문구가 남아 있습니다."
      : null;
    return { url: window.location.href, campaignId: idMatch ? idMatch[1] : null, message: message || null, stayed, validation };
  };
})();
