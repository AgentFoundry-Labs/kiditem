// KIDITEM OS — 쿠팡 광고센터 (advertising.coupang.com) 승인 광고 액션 실행
//
// 광고 데이터 수집은 새 런타임의 `advertising.ad_report` 실행 kind다(KID-371).
// 이 content script는 승인된 `create_campaign` 액션 실행만 남는다(KID-386이 옮긴다).

(function () {
  "use strict";

  // showBadge is loaded from utils/dom.js via manifest

  // The action tab is opened active (interactive-tabs), so a page timer is not
  // throttled here.
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  // Provider identities are positive, canonical decimal IDs.  This helper is
  // intentionally strict at the API boundary: String({}) and String(true)
  // must never become target IDs that can be joined to a different product.
  function normalizeProviderId(value) {
    if (typeof value === "number") {
      return Number.isSafeInteger(value) && value > 0 ? String(value) : "";
    }
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return "";
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && String(parsed) === value ? value : "";
  }

  function normalizeProviderCount(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? value
      : null;
  }

  function setNativeValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (!setter) {
      input.value = value;
      return;
    }
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const AD_CENTER_REQUEST_TIMEOUT_MS = 15000;

  async function adCenterJson(path, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      AD_CENTER_REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await fetch(path, {
        credentials: "same-origin",
        signal: controller.signal,
        ...init,
        headers: {
          accept: "application/json",
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...(init.headers || {}),
        },
      });
      if (!response.ok) {
        return { ok: false, status: response.status, data: null };
      }
      const text = await response.text();
      if (!text.trim()) return { ok: true, status: response.status, data: null };
      return { ok: true, status: response.status, data: JSON.parse(text) };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        data: null,
        error: error?.name === "AbortError" ? "timeout" : String(error?.message || error),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  const CAMPAIGN_ROSTER_PAGE_SIZE = 50;
  const CAMPAIGN_ROSTER_MAX_PAGES = 20;

  /** Every campaign with its ad groups, straight from the roster API. */
  async function fetchAdCampaignRoster() {
    const campaigns = [];
    const pages = [];
    for (let page = 0; page < CAMPAIGN_ROSTER_MAX_PAGES; page += 1) {
      const result = await adCenterJson("/marketing/tetris-api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          isDeleted: false,
          pagination: { page, size: CAMPAIGN_ROSTER_PAGE_SIZE },
          sortedBy: "IS_ACTIVE",
          isSortDesc: false,
          budgetTypes: [
            "LIFETIME",
            "DAILY",
            "DAILY_SOFT",
            "MONTHLY_FIXED",
            "MONTHLY_CUSTOM",
          ],
        }),
      });
      const campaignsArrayObserved = Array.isArray(result.data?.campaigns);
      const hasNextPage = typeof result.data?.pageInfo?.hasNextPage === "boolean"
        ? result.data.pageInfo.hasNextPage : null;
      pages.push({ page, campaignsArrayObserved, hasNextPage,
        campaignCount: campaignsArrayObserved ? result.data.campaigns.length : 0 });
      if (!result.ok || !campaignsArrayObserved || hasNextPage === null) {
        return { ok: false, campaigns, pages };
      }
      const pageCampaigns = result.data.campaigns;
      for (const campaign of pageCampaigns) {
        const campaignId = normalizeProviderId(campaign?.id);
        if (!campaignId) continue;
        const groups = Array.isArray(campaign.groupList) ? campaign.groupList : [];
        campaigns.push({
          campaignId,
          name: normalizeText(String(campaign.name || "")) || campaignId,
          isActive: campaign.isActive === true,
          totalAdCount: normalizeProviderCount(campaign.totalAdCount),
          groupsArrayObserved: Array.isArray(campaign.groupList),
          groups: groups
            .map((group) => ({
              adGroupId: normalizeProviderId(group?.id),
              adGroupName: normalizeText(String(group?.name || "")) || null,
            }))
            .filter((group) => group.adGroupId),
        });
        if (campaigns[campaigns.length - 1].groups.length !== groups.length) return { ok: false, campaigns, pages };
      }
      if (hasNextPage === false) return { ok: true, campaigns, pages };
    }
    return { ok: false, campaigns, pages };
  }

  function findDialog() {
    const dialogs = Array.from(document.querySelectorAll("[role='dialog'], .modal, .popup, .layer-popup"));
    return dialogs.find((dialog) => dialog.offsetParent !== null) || null;
  }

  async function kiditemApiRequest(path, init = {}) {
    const result = await chrome.runtime.sendMessage({
      action: "kiditemApiRequest",
      path,
      init,
    });
    if (!result?.success) throw new Error(result?.error || "KidItem API 요청 실패");
    return result;
  }

  async function reportAction(action, type, payload) {
    const result = await kiditemApiRequest("/api/ads/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Every report names the attempt the queue listed (KID-160), so it moves
      // only that attempt and never a retry queued after it.
      body: JSON.stringify({
        action: type,
        id: action.id,
        executionTaskId: action.executionTaskId,
        ...payload,
      }),
    });
    // The worker answers every HTTP status with success:true. The server refuses
    // a report with 409 when the attempt is not this executor's to report:
    // another executor started it, a newer attempt replaced it, its execution
    // deadline passed, it was cancelled or closed, or the operator applies the
    // action by hand. That must stop the action before it touches Coupang, and
    // this executor reports nothing more for it. The refusal code the server
    // put on the body travels with the error so the run can tell these apart.
    // Any other status is a failed request, not a refusal.
    if (!result.ok) {
      const refused = result.status === 409;
      const error = new Error(`실행 보고 ${refused ? "거절" : "실패"} (${type}): ${result.status}`);
      error.executionReportRefused = refused;
      error.executionReportCode = typeof result.body?.code === "string" ? result.body.code : null;
      throw error;
    }
  }

  async function reportActionFailure(action, payload) {
    try {
      await reportAction(action, "markFailed", payload);
    } catch (error) {
      console.warn("[KidItem] 실행 실패 보고를 남기지 못했습니다:", error instanceof Error ? error.message : error);
    }
  }

  // Called only after the change reached Coupang. A refused done report (409)
  // means the attempt is no longer this executor's (its deadline passed or a
  // newer attempt replaced it); any other failure leaves the server without the
  // outcome. Neither becomes a failure report, which would invite approving the
  // action again and changing Coupang twice. The executor warns about both; a
  // lost report leaves the attempt running until its execution deadline passes.
  async function reportActionDone(action, afterJson) {
    try {
      await reportAction(action, "markDone", { afterJson });
      return "recorded";
    } catch (error) {
      const reason = error instanceof Error ? error.message : error;
      if (error?.executionReportRefused) {
        console.warn("[KidItem] 실행 완료 보고가 거절되어 액션을 멈춥니다:", reason);
        return "refused";
      }
      console.warn("[KidItem] 광고센터에 반영했지만 실행 완료 보고를 남기지 못했습니다:", reason);
      return "unrecorded";
    }
  }

  async function fetchApprovedQueuedActions(limit = 20) {
    const res = await kiditemApiRequest(
      `/api/ads/actions?approvalStatus=approved&executeStatus=queued&limit=${limit}`,
    );
    if (!res.ok) throw new Error(`승인 액션 조회 실패: ${res.status}`);
    const json = res.body || {};
    return Array.isArray(json.items) ? json.items : [];
  }

  function findClickableByText(patterns, root = document) {
    const nodes = Array.from(root.querySelectorAll("button, a, [role='button'], [role='tab']"));
    return nodes.find((node) => {
      const text = normalizeText(node.innerText || node.textContent).toLowerCase();
      return patterns.some((pattern) => text.includes(pattern));
    }) || null;
  }

  function setRadioValue(value) {
    const input = document.querySelector(`input[type="radio"][value="${value}"]`);
    if (!input) return false;
    input.click();
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  async function waitForUrlIncludes(part, timeoutMs = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (window.location.href.includes(part)) return true;
      await sleep(250);
    }
    return false;
  }

  async function ensureCampaignRegistrationPage() {
    if (window.location.href.includes("/marketing/campaign/registration")) return;

    if (!window.location.href.includes("/marketing/campaign/type")) {
      showBadge("🟦 광고 만들기 버튼 찾는 중...", "#60a5fa");
      const addButton = findClickableByText(["캠페인 추가", "광고 만들기"]);
      if (!addButton) throw new Error("광고 만들기/캠페인 추가 버튼을 찾지 못했습니다.");
      addButton.click();
      await sleep(800);
      await waitForUrlIncludes("/marketing/campaign/type", 8000);
    }

    if (window.location.href.includes("/marketing/campaign/type")) {
      showBadge("🟦 광고 목표 선택 후 다음 단계 이동...", "#60a5fa");
      const nextButton = findClickableByText(["다음"]);
      if (!nextButton) throw new Error("광고 목표 선택 화면의 다음 버튼을 찾지 못했습니다.");
      nextButton.click();
      const ok = await waitForUrlIncludes("/marketing/campaign/registration", 10000);
      if (!ok) throw new Error("광고 등록 화면으로 이동하지 못했습니다.");
    }
  }

  function findCampaignInput(placeholder) {
    return Array.from(document.querySelectorAll("input")).find((input) =>
      normalizeText(input.getAttribute("placeholder")).includes(placeholder),
    ) || null;
  }

  async function searchAndSelectProduct(listing) {
    const label = normalizeText(listing.label || listing.productName || listing.externalId || listing.listingId);
    if (!label) return false;

    const searchInput = findCampaignInput("판매 상품을 검색");
    if (!searchInput) throw new Error("광고 상품 검색 입력창을 찾지 못했습니다.");

    setNativeValue(searchInput, label);
    searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));

    const searchButton = searchInput.closest("div")?.querySelector("button, [role='button']");
    if (searchButton) searchButton.click();

    await sleep(1500);

    const needle = label.toLowerCase();
    const rows = Array.from(document.querySelectorAll('li[data-bigfoot-component="vendor_item"]'));
    const row = rows.find((item) => normalizeText(item.innerText).toLowerCase().includes(needle)) || rows[0];
    if (!row) return false;

    const selectButton = findClickableByText(["상품 선택"], row);
    if (!selectButton) return false;
    selectButton.click();
    await sleep(700);
    return true;
  }

  async function executeCreateCampaign(action, claim) {
    const payload = action.payload || {};
    const listings = Array.isArray(payload.listings) ? payload.listings : [];
    if (listings.length === 0) {
      return { success: false, errorMessage: "등록할 광고 상품이 없습니다. 전략 탭에서 상품이 포함된 캠페인을 다시 생성해주세요." };
    }

    // A retried attempt may follow one that already created the campaign before
    // its report was lost and its attempt released (KID-160). The ad center's
    // campaign roster is read first, without leaving the page: a campaign with
    // this name ends the action as done, and a roster that cannot be read to
    // the end leaves it failed, since creating without knowing could make a
    // second campaign.
    const campaignName = normalizeText(payload.campaignName || action.targetLabel || "");
    if (!campaignName) {
      // A campaign without a name can be neither checked against the roster nor registered.
      return { success: false, errorMessage: CAMPAIGN_NAME_MISSING_MESSAGE };
    }
    const roster = await fetchAdCampaignRoster();
    if (!roster.ok) {
      return { success: false, errorMessage: CAMPAIGN_ROSTER_UNREAD_MESSAGE };
    }
    const existing = roster.campaigns.find((campaign) => campaign.name === campaignName);
    if (existing) {
      return {
        success: true,
        afterJson: {
          note: "campaign_already_exists",
          campaignName,
          campaignId: existing.campaignId,
        },
      };
    }

    await ensureCampaignRegistrationPage();

    const campaignNameInput = findCampaignInput("캠페인 이름");
    if (!campaignNameInput) throw new Error("캠페인 이름 입력창을 찾지 못했습니다.");
    setNativeValue(campaignNameInput, payload.campaignName || action.targetLabel || "");

    const adGroupInput = document.querySelector("#reg_ad_group_name") || findCampaignInput("그룹 이름");
    if (!adGroupInput) throw new Error("광고 그룹 이름 입력창을 찾지 못했습니다.");
    setNativeValue(adGroupInput, payload.adGroupName || `${payload.grade || "A"}등급_그룹`);

    let selectedCount = 0;
    for (const listing of listings.slice(0, 20)) {
      if (await searchAndSelectProduct(listing)) selectedCount++;
    }
    if (selectedCount === 0) throw new Error("쿠팡 광고 상품을 선택하지 못했습니다.");

    const operationMode = normalizeText(payload.operationMode);
    if (operationMode.includes("직접")) {
      setRadioValue("MANUAL");
    } else {
      setRadioValue("AUTO");
      setRadioValue(operationMode.includes("매출스타트") ? "PRODUCT_TARGET_BUDGET" : "PRODUCT_TARGET_ROAS");
    }
    await sleep(500);

    const budgetInput = document.querySelector('[data-testid="budget-input"]') || findCampaignInput("예)30,000");
    if (!budgetInput) throw new Error("일예산 입력창을 찾지 못했습니다.");
    setNativeValue(budgetInput, String(payload.dailyBudget || 30000));

    const targetRoasInput = document.querySelector('[data-bigfoot-component="target_roas"] input[data-bigfoot-component="entry"]');
    if (targetRoasInput && payload.targetRoas) setNativeValue(targetRoasInput, String(payload.targetRoas));

    await sleep(500);
    const completeButton = findClickableByText(["완료"]);
    if (!completeButton) throw new Error("완료 버튼을 찾지 못했습니다.");
    assertWithinWriteDeadline(claim);
    completeButton.click();
    await sleep(1500);

    const dialog = findDialog();
    if (dialog) {
      const confirmButton = findClickableByText(["등록", "확인", "완료"], dialog);
      if (confirmButton) {
        assertWithinWriteDeadline(claim, { confirmationStep: true });
        confirmButton.click();
        await sleep(1500);
      }
    }

    const bodyText = normalizeText(document.body.innerText);
    if (/필수|선택해주세요|입력해주세요|오류|실패/.test(bodyText)) {
      return {
        success: false,
        errorMessage: "쿠팡 광고 등록 폼 검증 메시지가 남아 있습니다.",
        afterJson: { url: window.location.href, selectedCount },
      };
    }

    return {
      success: true,
      afterJson: {
        status: "submitted",
        url: window.location.href,
        selectedCount,
        campaignName: payload.campaignName || action.targetLabel,
      },
    };
  }

  // The claim (markRunning) is an executor's first report for an action, for
  // every action type. The executor reads the page, touches Coupang or reports
  // an outcome only after the server accepts the claim, so a refused claim ends
  // the action before any of that and every outcome is for an attempt it claimed.
  function claimEvidence(action) {
    return action.actionType === "create_campaign"
      ? { url: window.location.href, payload: action.payload || {} }
      : { url: window.location.href };
  }

  // An approved action writes to Coupang only within this long after its claim.
  // The server treats a running attempt with no outcome for 30 minutes as
  // stopped and lets the operator queue it again
  // (EXECUTION_TASK_RUNNING_DEADLINE_MS in
  // apps/server/src/advertising/domain/execution-task-lifecycle.ts). An executor
  // that stalled after its claim (a sleeping PC, a throttled tab) must not write
  // that late, so this deadline stays well inside the server's while leaving
  // room for several slow ad-center page loads.
  const ACTION_WRITE_DEADLINE_MS = 10 * 60 * 1000;
  const ACTION_WRITE_DEADLINE_MESSAGE =
    `실행 기한(${ACTION_WRITE_DEADLINE_MS / 60000}분)이 지나 광고센터에 쓰지 않았습니다.`;
  // A stop at a confirmation click follows a click that may already have
  // written, so its failure does not claim that nothing changed.
  const ACTION_CONFIRM_DEADLINE_MESSAGE =
    `실행 기한(${ACTION_WRITE_DEADLINE_MS / 60000}분)이 지나 확인 단계에서 멈췄습니다. 광고센터에 반영됐을 수 있으니 다시 승인하기 전에 확인해 주세요.`;
  const CAMPAIGN_ROSTER_UNREAD_MESSAGE =
    "광고센터 캠페인 목록을 끝까지 읽지 못해 같은 이름의 캠페인이 있는지 확인하지 못했습니다. 캠페인을 만들지 않았습니다.";
  const CAMPAIGN_NAME_MISSING_MESSAGE =
    "캠페인 이름이 없습니다. 전략 탭에서 캠페인 이름을 넣어 다시 생성해주세요.";

  /**
   * Checked immediately before each click that can write to Coupang, with
   * nothing awaited in between; the thrown failure becomes the action's
   * reported outcome. A stop at a confirmation click follows a click that may
   * already have written, so its error carries `executionMayHaveApplied` and
   * the run warns about it.
   */
  function assertWithinWriteDeadline(claim, { confirmationStep = false } = {}) {
    if (Date.now() - claim.claimedAt <= ACTION_WRITE_DEADLINE_MS) return;
    const error = new Error(
      confirmationStep ? ACTION_CONFIRM_DEADLINE_MESSAGE : ACTION_WRITE_DEADLINE_MESSAGE,
    );
    error.executionMayHaveApplied = confirmationStep;
    throw error;
  }

  // Campaign registration is the only action this extension applies to
  // Coupang. The server decides which other types the operator applies by hand
  // (KID-138 decision A) and refuses their claim. One an older server still
  // lets through, like any other type without an executor here, is reported
  // failed without touching the page.
  async function executeClaimedAction(action, claim) {
    if (action.actionType === "create_campaign") {
      return executeCreateCampaign(action, claim);
    }
    return { success: false, errorMessage: `지원하지 않는 액션: ${action.actionType}` };
  }

  // The server refuses the claim of an action the operator applies by hand
  // (EXECUTION_REPORT_MANUAL_ACTION in
  // apps/server/src/advertising/domain/execution-task-lifecycle.ts, held equal
  // by a test) and closes its queued attempt. The extension keeps no list of
  // those types.
  const MANUAL_ACTION_REFUSAL_CODE = "EXECUTION_REPORT_MANUAL_ACTION";

  // Every listed action is claimed, whatever page the tab shows: the server
  // decides which actions an executor may run, and an action never claimed
  // would stay queued and hold a place in the 20-action queue.
  async function executeApprovedActions(actions) {
    let executed = 0;
    let skipped = 0;
    // Actions listed without their attempt id, which are never claimed.
    let missingAttemptId = 0;
    // Claims refused because the operator applies the action by hand.
    let manual = 0;
    // Reports that did not land. The operator sees each kind as a warning.
    let claimRefused = 0;
    let claimUnreported = 0;
    // Actions stopped at a confirmation click, after which Coupang may already have changed.
    let confirmationStopped = 0;
    let doneRefused = 0;
    let doneUnreported = 0;

    for (const action of actions) {
      // Every report names the attempt it is for. An action listed without one
      // (an older server, or an approved action with no attempt) cannot be
      // fenced to an attempt, so it is not claimed at all.
      if (typeof action.executionTaskId !== "string" || !action.executionTaskId.trim()) {
        skipped++;
        missingAttemptId++;
        continue;
      }
      // The write deadline runs from the moment the claim is sent.
      const claim = { claimedAt: Date.now() };
      try {
        showBadge(`⚙️ ${action.targetLabel} 실행 중...`, "#60a5fa");
        await reportAction(action, "markRunning", { beforeJson: claimEvidence(action) });
      } catch (error) {
        // No accepted claim: another executor may own the attempt, or the
        // operator applies the action by hand, so this one reports nothing for
        // the action and never touches Coupang for it.
        skipped++;
        if (!error?.executionReportRefused) claimUnreported++;
        else if (error.executionReportCode === MANUAL_ACTION_REFUSAL_CODE) manual++;
        else claimRefused++;
        console.warn(
          "[KidItem] 실행 선점이 받아들여지지 않아 액션을 건너뜁니다:",
          error instanceof Error ? error.message : error,
        );
        continue;
      }
      let result;
      try {
        result = await executeClaimedAction(action, claim);
      } catch (error) {
        // The action failed while it was being worked on Coupang.
        skipped++;
        if (error?.executionMayHaveApplied) confirmationStopped++;
        await reportActionFailure(action, {
          errorMessage: error instanceof Error ? error.message : "실행 실패",
        });
        continue;
      }
      if (!result.success) {
        skipped++;
        await reportActionFailure(action, {
          errorMessage: result.errorMessage || "실행 실패",
          afterJson: result.afterJson || {},
        });
        continue;
      }
      const done = await reportActionDone(action, result.afterJson || {});
      if (done === "recorded") executed++;
      else if (done === "refused") doneRefused++;
      else doneUnreported++;
    }

    // A refused or lost done report follows a change that reached Coupang; only
    // its record is missing.
    const executedUnrecorded = doneRefused + doneUnreported;
    // A skip the operator must act on, or a report that did not land, is a
    // warning, never only a count.
    const warnings = [];
    if (missingAttemptId > 0) {
      warnings.push(`실행 시도 id가 없는 승인 액션 ${missingAttemptId}개는 광고센터에 쓰지 않고 건너뛰었습니다. 확장과 서버 버전이 같은지 확인하고 다시 승인해 주세요.`);
    }
    if (manual > 0) {
      warnings.push(`자동 실행하지 않는 승인 액션 ${manual}개는 광고센터에 쓰지 않았습니다. 광고센터에서 직접 처리해 주세요.`);
    }
    if (claimRefused > 0) {
      warnings.push(`실행 보고가 거절된 승인 액션 ${claimRefused}개는 광고센터에 쓰지 않고 건너뛰었습니다. 다른 실행이 맡았거나 이미 닫힌 실행 시도입니다.`);
    }
    if (claimUnreported > 0) {
      warnings.push(`시작 보고 전달에 실패한 승인 액션 ${claimUnreported}개는 광고센터에 쓰지 않고 건너뛰었습니다. 서버에 실행 중으로 남았다면 실행 기한(30분)이 지나 실패로 바뀐 뒤 다시 승인할 수 있습니다.`);
    }
    if (confirmationStopped > 0) {
      warnings.push(`승인 액션 ${confirmationStopped}개는 확인 단계에서 실행 기한(${ACTION_WRITE_DEADLINE_MS / 60000}분)이 지나 멈췄습니다. 광고센터에 반영됐을 수 있으니 다시 승인하기 전에 광고센터에서 확인해 주세요.`);
    }
    if (doneRefused > 0) {
      warnings.push(`승인 액션 ${doneRefused}개는 광고센터에 반영됐을 수 있지만 완료 보고가 거절됐습니다. 실행 기한이 지났거나 새 실행 시도로 바뀌었으니 다시 승인하기 전에 광고센터에서 확인해 주세요.`);
    }
    if (doneUnreported > 0) {
      warnings.push(`승인 액션 ${doneUnreported}개는 광고센터에 이미 반영됐을 수 있지만 실행 기록을 남기지 못했습니다. 다시 승인하기 전에 광고센터에서 확인해 주세요.`);
    }
    if (warnings.length > 0) {
      const warning = warnings.join(" ");
      showBadge(`⚠️ ${warning}`, "#f59e0b");
      return {
        success: true,
        executed,
        ...(executedUnrecorded > 0 ? { executedUnrecorded } : {}),
        skipped,
        warning,
      };
    }
    showBadge(`✅ 승인 액션 ${executed}개 실행 완료`, "#22c55e");
    return { success: true, executed, skipped };
  }

  function isAdvertisingLoginPage() {
    try {
      const url = new URL(window.location.href);
      return (
        url.protocol === "https:" &&
        url.hostname.toLowerCase() === "advertising.coupang.com" &&
        /^\/user\/login\/?$/.test(url.pathname)
      );
    } catch {
      return false;
    }
  }

  // 로그인 화면 자동 통과 — 확장은 자격증명을 입력·저장·로깅·전송하지 않는다.
  // 브라우저 자동완성이 아이디·비밀번호를 "이미" 채운 경우에만 로그인 버튼을
  // 클릭한다(값 문자열은 다루지 않고 채워졌는지 길이만 확인). 자동완성이 없으면
  // 누르지 않고 기존 로그인 안내(pendingLogin) 흐름으로 넘어간다. 저장된 비번이
  // 틀린 경우의 재제출 루프는 sessionStorage 시도 횟수 제한으로 막는다.
  const AD_LOGIN_AUTOSUBMIT_ATTEMPTS_KEY =
    "kiditem_ad_login_autosubmit_attempts_v1";
  const AD_LOGIN_AUTOSUBMIT_MAX = 2;
  let advertisingLoginAutoSubmitted = false;
  function isSocialLoginLabel(label) {
    return /카카오|네이버|구글|애플|페이스북|간편|kakao|naver|google|apple|facebook|sns/i.test(
      label,
    );
  }
  function findAdvertisingLoginControls() {
    const password = document.querySelector('input[type="password"]');
    if (!password) {
      return { form: null, username: null, password: null, submit: null };
    }
    const form =
      password.form ||
      (typeof password.closest === "function" ? password.closest("form") : null) ||
      document;
    const username =
      form.querySelector(
        'input[type="text"], input[type="email"], input[name*="user" i], input[name*="id" i], input[name*="login" i]',
      ) || null;
    const labelOf = (el) => String(el.textContent || el.value || "").trim();
    // 실제 제출 컨트롤(type=submit)을 우선한다. 소셜 로그인/OAuth 링크는 라벨에
    // "로그인"이 들어가도 절대 누르지 않는다(a[role=button] 후보 제외).
    let submit = form.querySelector('button[type="submit"], input[type="submit"]');
    if (submit && isSocialLoginLabel(labelOf(submit))) submit = null;
    if (!submit) {
      const buttons = Array.from(
        form.querySelectorAll('button, input[type="button"]') || [],
      );
      submit =
        buttons.find((el) => {
          if (el.disabled) return false;
          const label = labelOf(el);
          return /로그인|login|sign\s*in/i.test(label) && !isSocialLoginLabel(label);
        }) || null;
    }
    return { form, username, password, submit };
  }
  function advertisingLoginFieldsPrefilled() {
    // 값 문자열은 저장·로깅·전송하지 않는다 — 채워졌는지 길이만 본다.
    const { username, password } = findAdvertisingLoginControls();
    const usernameFilled = !!(username && String(username.value || "").length > 0);
    const passwordFilled = !!(password && String(password.value || "").length > 0);
    return usernameFilled && passwordFilled;
  }
  function advertisingAccountCardText(el) {
    // 버튼이 속한 계정 카드의 텍스트(조상 몇 단계)를 얻어 wing 카드를 식별한다.
    let node = el.parentElement;
    for (let depth = 0; depth < 6 && node; depth += 1) {
      const text = String(node.textContent || "");
      if (text.length > 40) return text;
      node = node.parentElement;
    }
    return String(el.textContent || "");
  }
  function findAdvertisingAccountLoginButton() {
    // 계정 유형 선택 화면("쿠팡 광고센터 로그인")의 "로그인하기" 버튼들.
    // 맨 왼쪽 = 쿠팡 wing(마켓플레이스 & 로켓그로스 판매자) 카드. 자격증명을
    // 다루지 않고 다음 로그인 단계로 넘어가는 네비게이션 클릭이다.
    const buttons = Array.from(
      document.querySelectorAll('a, button, [role="button"]') || [],
    ).filter((el) => {
      if (el.disabled) return false;
      const label = String(el.textContent || el.value || "").trim();
      return /로그인하기/.test(label) && !isSocialLoginLabel(label);
    });
    if (buttons.length === 0) return null;
    const wing = buttons.find((el) =>
      /마켓플레이스|로켓그로스|wing/i.test(advertisingAccountCardText(el)),
    );
    // wing(맨 왼쪽) 카드 우선, 못 찾으면 DOM 순서상 첫 번째(=맨 왼쪽).
    return wing || buttons[0];
  }
  function advertisingLoginAutoSubmitCount() {
    try {
      const parsed = Number.parseInt(
        sessionStorage.getItem(AD_LOGIN_AUTOSUBMIT_ATTEMPTS_KEY) || "0",
        10,
      );
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }
  function commitAdvertisingLoginClick(el, badge) {
    advertisingLoginAutoSubmitted = true;
    try {
      sessionStorage.setItem(
        AD_LOGIN_AUTOSUBMIT_ATTEMPTS_KEY,
        String(advertisingLoginAutoSubmitCount() + 1),
      );
    } catch {}
    try {
      showBadge(badge, "#6366f1");
    } catch {}
    el.click();
    return true;
  }
  function attemptAdvertisingLoginAutoSubmit() {
    if (advertisingLoginAutoSubmitted) return false;
    if (!isAdvertisingLoginPage()) return false;
    // 저장된 비번이 틀리면 실패 → 페이지 재렌더 → 문서 플래그 초기화 → 재제출
    // 루프가 될 수 있다. sessionStorage 는 같은 탭·origin 리로드에도 남으므로,
    // 세션당 자동 로그인 시도 횟수를 제한해 캡차/계정잠금을 막는다.
    if (advertisingLoginAutoSubmitCount() >= AD_LOGIN_AUTOSUBMIT_MAX) return false;

    // 1) 계정 유형 선택 화면이면 맨 왼쪽(쿠팡 wing / 마켓플레이스 & 로켓그로스)
    //    "로그인하기"를 누른다 — 자격증명을 다루지 않는 네비게이션 클릭.
    const accountButton = findAdvertisingAccountLoginButton();
    if (accountButton && typeof accountButton.click === "function") {
      return commitAdvertisingLoginClick(accountButton, "🔓 쿠팡 wing 로그인 선택");
    }

    // 2) 아이디/비번 입력 폼이면, 브라우저 자동완성이 채운 경우에만 로그인 버튼을
    //    누른다(값은 다루지 않고 채워졌는지만 확인).
    if (!advertisingLoginFieldsPrefilled()) return false;
    const { submit } = findAdvertisingLoginControls();
    if (!submit || typeof submit.click !== "function") return false;
    return commitAdvertisingLoginClick(submit, "🔓 광고센터 자동 로그인");
  }

  // One approved-action execution per tab. A second Run for the same actions
  // joins the execution already in flight; a Run for other actions is refused
  // until it ends, so a list is never silently dropped. Another tab is refused
  // by the server at its running report.
  const ACTION_EXECUTION_BUSY_MESSAGE =
    "이미 다른 승인 액션 실행이 진행 중입니다. 끝난 뒤 다시 실행해 주세요.";
  let currentActionExecution = null;
  let currentActionExecutionKey = null;
  function runActionExecutionOnce(key, execute) {
    if (currentActionExecution) {
      return key === currentActionExecutionKey
        ? currentActionExecution
        : Promise.resolve({ success: false, error: ACTION_EXECUTION_BUSY_MESSAGE });
    }
    currentActionExecutionKey = key;
    currentActionExecution = Promise.resolve()
      .then(execute)
      .finally(() => {
        currentActionExecution = null;
        currentActionExecutionKey = null;
      });
    return currentActionExecution;
  }

  function runApprovedActionsOnce() {
    return runActionExecutionOnce("queued", () =>
      fetchApprovedQueuedActions(20).then((actions) => {
        if (actions.length === 0) {
          showBadge("ℹ️ 실행할 승인 액션이 없습니다.", "#94a3b8");
          return { success: true, executed: 0, skipped: 0 };
        }
        return executeApprovedActions(actions);
      }),
    );
  }

  // 승인된 광고 액션 실행만 명시적인 플래그에서 자동 시작한다.
  // - kiditemExecuteActions=1: 승인된 광고 액션 자동 실행
  const hrefForMode = `${window.location.search || ""}${window.location.hash || ""}`;
  const isActionMode = /kiditemExecuteActions=1/.test(hrefForMode) ||
    sessionStorage.getItem("kiditemExecuteActions") === "1";
  if (isActionMode) {
    sessionStorage.setItem("kiditemExecuteActions", "1");
  }

  // 실행 탭이 광고센터 로그인 화면에 떨어지면, 브라우저 자동완성이 자격증명을
  // 채울 시간을 잠깐 준 뒤 로그인 버튼을 눌러 자동 통과한다(최대 ~5초 폴링).
  // 채워지지 않으면 누르지 않는다 — 확장은 자격증명을 입력·저장하지 않는다.
  if (isAdvertisingLoginPage()) {
    let loginAutoSubmitAttempts = 0;
    const loginAutoSubmitTimer = setInterval(() => {
      loginAutoSubmitAttempts += 1;
      if (attemptAdvertisingLoginAutoSubmit() || loginAutoSubmitAttempts >= 12) {
        clearInterval(loginAutoSubmitTimer);
      }
    }, 400);
  }

  if (isActionMode) {
    setTimeout(() => {
      runApprovedActionsOnce().then(() => {
        sessionStorage.removeItem("kiditemExecuteActions");
      });
    }, 3000);
  }

  // Contract used by fixture tests. Content scripts run in an isolated world,
  // so this does not expose data to the marketplace page itself.
  globalThis.KidItemAdsReportContract = Object.freeze({
    fetchAdCampaignRoster,
    isAdvertisingLoginPage,
    advertisingLoginFieldsPrefilled,
    attemptAdvertisingLoginAutoSubmit,
    findAdvertisingLoginControls,
    findAdvertisingAccountLoginButton,

  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "executeApprovedAdActions") {
      const payload = msg.payload || {};
      const actions = payload.actions || [];
      const key = `actions:${Array.isArray(actions) ? actions.map((action) => action?.id).join(",") : ""}`;
      runActionExecutionOnce(key, () => executeApprovedActions(actions))
        .then(sendResponse)
        .catch((error) => sendResponse({ success: false, error: error.message || "실행 실패" }));
      return true;
    }

    if (msg.action === "runApprovedQueuedAdActions") {
      runApprovedActionsOnce()
        .then(sendResponse)
        .catch((error) => sendResponse({ success: false, error: error.message || "실행 실패" }));
      return true;
    }
  });
})();
