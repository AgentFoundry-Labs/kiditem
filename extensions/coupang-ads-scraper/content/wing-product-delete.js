// wing-product-delete.js
// 쿠팡 WING 상품목록에서 **우리가 등록한 상품 1건**을 삭제한다.
//
// ⚠️⚠️ 이 파일은 되돌릴 수 없는 동작을 수행한다. 설계 원칙:
//   1) 대상은 항상 **등록상품ID(vendorInventoryId) 정확일치 1건**. 0건이거나 2건 이상이면
//      아무것도 하지 않고 실패로 돌려준다. "아마 이거겠지"로 지우지 않는다.
//   2) 서버가 인가한 externalId 로만 움직인다. 화면에서 사용자가 고른 행을 믿지 않는다.
//   3) 드롭다운 항목과 확인 모달의 버튼은 **각자의 컨테이너 안에서만** 찾는다. 문서 전역
//      탐색은 '페이지 별점주기' 위젯의 버튼을 눌러 모달 지옥에 빠뜨린 이력이 있다.
//   4) 단계마다 실패하면 즉시 멈춘다. 부분 성공을 성공으로 보고하지 않는다.
//
// 호출: chrome.tabs.sendMessage(tabId, { action: 'deleteWingProduct', externalId, displayName })
// 응답: { ok, steps, error?, blockedReason? }

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

  const normText = (s) => (s || '').replace(/\s+/g, '');

  function isVisible(node) {
    return !!node && node.offsetParent !== null;
  }

  /**
   * ⚠️ 별점/설문 위젯 거부. wing-registration-fill.js 와 같은 이유다.
   * 문서 전역에서 '등록'/'확인'을 찾다가 `#report-rating-trigger` 를 눌러
   * "별점을 선택해주세요" 모달이 뜨고 이후 작업이 전부 막힌 이력이 있다.
   */
  const FORBIDDEN_PATTERN = /report-rating|rating|survey|feedback|nps/i;

  function isForbidden(node) {
    let cur = node;
    for (let i = 0; i < 6 && cur; i += 1) {
      const id = typeof cur.id === 'string' ? cur.id : '';
      const className = typeof cur.className === 'string' ? cur.className : '';
      if (FORBIDDEN_PATTERN.test(id) || FORBIDDEN_PATTERN.test(className)) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  /** `root` 하위에서 텍스트가 완전일치하고 보이는 버튼. 전역 탐색을 하지 않는다. */
  function btnByText(text, root) {
    const scope = root || document;
    return [...scope.querySelectorAll('button, a')].find(
      (b) => normText(b.textContent) === normText(text)
        && isVisible(b)
        && !isForbidden(b),
    ) || null;
  }

  /**
   * 등록상품ID 가 정확히 일치하는 행을 찾는다.
   *
   * 부분일치를 쓰지 않는다 — `16311428128` 로 검색했는데 `163114281280` 이 걸리면
   * 엉뚱한 상품을 지운다. 행 텍스트에서 8자리 이상 숫자를 모두 뽑아 정확 비교한다.
   *
   * 라이브 실측(2026-07): 행은 `tr.inventory-line` 이고 8자리 이상 숫자는
   * 등록상품ID 하나뿐이다.
   */
  function findRowsByExternalId(externalId) {
    const target = String(externalId).trim();
    const rows = [...document.querySelectorAll('tr, [role="row"], .product-row')];
    return rows.filter((row) => {
      if (!isVisible(row)) return false;
      const ids = (row.textContent || '').match(/\d{8,}/g) || [];
      return ids.includes(target);
    });
  }

  function rowCheckbox(row) {
    return row.querySelector('input[type="checkbox"]');
  }

  // ---------------------------------------------------------------------------
  // '선택한 상품 일괄적용' 드롭다운
  // ---------------------------------------------------------------------------
  //
  // 라이브 실측(2026-07, /tenants/seller-web/vendor-inventory/list):
  //   div.w-ui-vue-floating              … body 말단에 붙는 부유 레이어
  //     div.w-ui-vue-dropdown-menu       … overflow-y:auto, max-height:208px
  //                                        scrollHeight 396 > clientHeight 208
  //       div.w-ui-vue-dropdown-menu-item ×12
  //
  //   항목 순서와 offsetTop(항목 높이 33px):
  //     0 판매가 변경(0)  1 판매상태 변경(33)  2 배송정보 변경(66)
  //     3 출고소요일 변경(99)  4 판매 요청(132)  5 바코드 라벨 인쇄(165)
  //     6 삭제(198)  7 브랜드 설정/변경(231)  8 자동생성옵션(264)
  //     9 인당구매수량제한(297)  10 판매기간(330)  11 출고일 자동 조정 관리 예외등록(363)
  //
  // ⚠️ 멈추던 진짜 원인 두 가지:
  //   (a) 항목이 `div` 다. 예전 코드는 `li, a, button` 만 뒤져서 **절대** 못 찾았다.
  //   (b) '삭제'(offsetTop 198 + 높이 33 = 231)는 208px 뷰포트 밖이라 스크롤해야 한다.
  //       단 `offsetParent` 는 잘려 있어도 null 이 아니므로 가시성 검사로는 못 걸러진다.
  //
  // 스크롤은 `scrollIntoView({ block:'nearest' })` 로 충분하다(실측: scrollTop 0 → 23,
  // 항목 중앙 hit-test 가 항목 자신으로 잡힘). 그래도 잘려 있으면 컨테이너 `scrollTop`
  // 을 직접 조작하는 2차 시도를 둔다.
  const DROPDOWN_MENU_SELECTOR = '.w-ui-vue-dropdown-menu';
  const DROPDOWN_ITEM_SELECTOR = '.w-ui-vue-dropdown-menu-item';
  const DROPDOWN_ITEM_FALLBACK_SELECTOR = '[role="menuitem"], li, a, button';

  const DELETE_ITEM_TEXT = '삭제';

  /** 이 메뉴가 정말 '선택한 상품 일괄적용' 메뉴인지 확인하는 이웃 항목들. */
  const BULK_MENU_SIBLING_LABELS = [
    '판매가변경',
    '판매상태변경',
    '배송정보변경',
    '출고소요일변경',
    '바코드라벨인쇄',
  ];

  /**
   * ⚠️ 절대 '삭제'로 오인하면 안 되는 형제 항목들.
   * 매칭은 완전일치라 원래도 걸리지 않지만, 나중에 매칭이 느슨해져도 이 문구들은
   * 구조적으로 통과하지 못하게 막는다. '판매 요청'을 눌러 1,229개를 판매요청하거나
   * '판매상태 변경'을 눌러 판매중지시키는 사고는 되돌리기 어렵다.
   */
  const NEVER_CLICK_MENU_TEXTS = [
    '판매요청',
    '판매상태변경',
    '판매가변경',
    '배송정보변경',
    '출고소요일변경',
    '바코드라벨인쇄',
    '브랜드설정/변경',
    '자동생성옵션',
    '인당구매수량제한',
    '판매기간',
    '출고일자동조정관리예외등록',
  ];

  /** 드롭다운 컨테이너 하위의 항목들. 중첩 컨테이너는 제외한다. */
  function dropdownItems(menu) {
    let items = [...menu.querySelectorAll(DROPDOWN_ITEM_SELECTOR)];
    if (!items.length) items = [...menu.querySelectorAll(DROPDOWN_ITEM_FALLBACK_SELECTOR)];
    return items.filter((el) => !isForbidden(el));
  }

  /**
   * 열려 있는 '선택한 상품 일괄적용' 드롭다운.
   *
   * 보이는 `.w-ui-vue-dropdown-menu` 중에서 **일괄적용 메뉴의 형제 항목을 가진** 것만
   * 고른다. 페이지에는 '50개씩 보기' 같은 다른 드롭다운도 있어서, 이 확인을 빼면
   * 엉뚱한 메뉴에서 '삭제'를 찾게 된다.
   */
  function findBulkDropdownMenu() {
    const menus = [...document.querySelectorAll(DROPDOWN_MENU_SELECTOR)].filter(isVisible);
    return menus.find((menu) => {
      const labels = dropdownItems(menu).map((el) => normText(el.textContent));
      if (!BULK_MENU_SIBLING_LABELS.some((label) => labels.includes(label))) return false;
      return labels.includes(DELETE_ITEM_TEXT);
    }) || null;
  }

  /**
   * 드롭다운 안에서 '삭제' 항목을 찾는다.
   *
   * 완전일치만 인정하고, 후보가 정확히 1개가 아니면 null 을 돌려준다.
   * '판매 요청'/'판매상태 변경'은 완전일치에서도 거부목록에서도 걸러진다.
   */
  function findDeleteMenuItem(menu) {
    const matches = dropdownItems(menu).filter((el) => {
      const text = normText(el.textContent);
      if (text !== DELETE_ITEM_TEXT) return false;
      if (NEVER_CLICK_MENU_TEXTS.includes(text)) return false;
      return true;
    });
    return matches.length === 1 ? matches[0] : null;
  }

  /** 항목이 스크롤 컨테이너의 보이는 영역 밖으로 잘려 있는가. */
  function isItemClipped(menu, item) {
    const viewHeight = Number(menu.clientHeight) || 0;
    if (!viewHeight) return false;
    const viewTop = Number(menu.scrollTop) || 0;
    const top = Number(item.offsetTop) || 0;
    const height = Number(item.offsetHeight) || 0;
    return top < viewTop || top + height > viewTop + viewHeight;
  }

  /**
   * '삭제' 가 보일 때까지 드롭다운을 스크롤한다.
   *
   * 1차: `scrollIntoView({ block:'nearest' })` — 라이브에서 이것만으로 충분했다.
   * 2차: 그래도 잘려 있으면 컨테이너 `scrollTop` 을 직접 계산해 넣는다.
   * 반환값은 "이제 잘리지 않는가".
   */
  function revealDropdownItem(menu, item) {
    if (typeof item.scrollIntoView === 'function') {
      item.scrollIntoView({ block: 'nearest' });
    }
    if (!isItemClipped(menu, item)) return true;

    const viewHeight = Number(menu.clientHeight) || 0;
    const height = Number(item.offsetHeight) || 0;
    const top = Number(item.offsetTop) || 0;
    const maxScroll = Math.max(0, (Number(menu.scrollHeight) || 0) - viewHeight);
    const desired = Math.max(0, Math.min(maxScroll, top - Math.max(0, (viewHeight - height) / 2)));
    menu.scrollTop = desired;
    return !isItemClipped(menu, item);
  }

  // ---------------------------------------------------------------------------
  // 삭제 확인 모달
  // ---------------------------------------------------------------------------
  //
  // 번들 실측(app/listV3.js, `BulkDeleteModal`):
  //   Yp()({ title: '<span class="fa fa-exclamation-triangle"></span><div>'
  //            + $t('listV2.searchPanel.validation.bulkDeleteAlertTitle') + '</div>',
  //          useTitleHTML: true,
  //          text: $t('listV2.searchPanel.validation.bulkDeleteAlertText'),
  //          showCancelButton: true, closeOnConfirm: true,
  //          confirmButtonClass: 'alert-confirm',
  //          cancelButtonText: '취소', confirmButtonText: '확인' })
  //
  // `Yp` 는 plugin/sweetalert/sweet-alert.js (**SweetAlert 1.x**) 다.
  // wing-registration-fill.js 가 다루는 등록 확인 모달과 **같은 싱글턴**이고,
  // 이 목록 페이지에는 그 싱글턴이 **2개** 떠 있다(둘 다 숨김 + 자리표시 Title/Cancel/OK).
  // 그래서 반드시 "보이는 것"만 고르고 문구까지 대조해야 한다.
  //
  //   div.sweet-alert
  //     h2.alert-title  … '선택하신 상품은 요청 즉시 삭제되며, 복구가 불가능합니다. 삭제하시겠습니까?'
  //     p.alert-text    … '삭제시 주의사항\n1. 로켓그로스 …\n4. 일괄삭제의 경우 … (최대 3분)'
  //     div.alert-buttons
  //       button.cancel  … '취소'  ← ⚠️ 절대 누르지 않는다 (DOM 순서상 확인보다 **앞**)
  //       button.confirm … '확인'  ← 실제 삭제가 일어난다
  //
  // ⚠️ 같은 싱글턴이 **차단 안내**에도 재사용된다. 번들의 `Bm(msg)` 는
  // `showCancelButton` 없이 title 에 오류 문구만 넣어 띄운다. 예:
  //   '승인대기중/심사중인 상품은 삭제할 수 없습니다.<br>선택한 상품을 다시 확인해주세요.'
  // 이 안내는 확인 모달과 **DOM 구조가 같아서** 문구를 대조하지 않으면 구분되지 않는다.
  // 문구가 삭제 확인 서명과 다르면 아무것도 누르지 않고 차단 사유로 보고한다.
  const CONFIRM_MODAL_SELECTOR = '.sweet-alert';
  const CONFIRM_BUTTON_SELECTOR = 'button.confirm';
  const CANCEL_BUTTON_SELECTOR = 'button.cancel';

  /** 이 문구 중 하나라도 있어야 '삭제 확인 모달'로 인정한다. */
  const DELETE_CONFIRM_SIGNATURES = ['복구가불가능', '삭제하시겠습니까', '삭제시주의사항'];

  /** 확인 버튼으로 인정하는 라벨(완전일치). */
  const CONFIRM_BUTTON_LABELS = ['확인', '네,삭제합니다', '삭제합니다', '삭제'];

  /** ⚠️ 어떤 경우에도 누르지 않는다. */
  const NEVER_CLICK_TEXTS = ['취소', 'cancel', '닫기', '아니오', '아니요'];

  /** 차단 안내 문구 → 사람이 읽을 사유. */
  const BLOCKED_REASONS = [
    {
      pattern: /승인대기중|심사중/,
      reason: '승인대기중/심사중인 상품은 쿠팡이 삭제를 막습니다. 승인 완료 후 다시 시도하세요.',
    },
    { pattern: /로켓그로스/, reason: '로켓그로스 상품은 삭제할 수 없습니다.' },
    { pattern: /로켓직구/, reason: '로켓직구 상품은 삭제할 수 없습니다.' },
    { pattern: /상품을선택|선택해주세요/, reason: '쿠팡이 선택된 상품을 인식하지 못했습니다.' },
  ];

  function isNeverClickText(text) {
    const normalized = normText(text).toLowerCase();
    return NEVER_CLICK_TEXTS.some((t) => normText(t).toLowerCase() === normalized);
  }

  function findVisibleConfirmModal() {
    return [...document.querySelectorAll(CONFIRM_MODAL_SELECTOR)].find(
      (modal) => isVisible(modal) && !isForbidden(modal),
    ) || null;
  }

  function modalMessage(modal) {
    const title = modal.querySelector('.alert-title');
    const text = modal.querySelector('.alert-text');
    const parts = [title && title.textContent, text && text.textContent].filter(Boolean);
    return parts.length ? parts.join(' ') : (modal.textContent || '');
  }

  /**
   * 확인 모달에서 삭제를 확정한다.
   *
   * 반환: { ok, blocked?, message?, reason?, code? }
   *  - ok:true       → 확인을 눌렀다
   *  - blocked:true  → 쿠팡이 삭제를 막았다(승인대기중 등). 아무것도 누르지 않았다.
   *  - 그 외         → 모달/버튼을 못 찾았다. 아무것도 누르지 않았다.
   */
  async function confirmDeletionModal(log) {
    const modal = await waitFor(findVisibleConfirmModal, { timeout: 10000 });
    if (!modal) {
      log('delete:noConfirmModal');
      return { ok: false, code: 'no_modal' };
    }

    const message = modalMessage(modal);
    const normalized = normText(message);
    if (!DELETE_CONFIRM_SIGNATURES.some((sig) => normalized.includes(sig))) {
      // 삭제 확인 모달이 아니다 → 차단 안내다. 아무것도 누르지 않는다.
      const blocked = BLOCKED_REASONS.find((entry) => entry.pattern.test(normalized));
      log('delete:blockedAlert');
      return {
        ok: false,
        blocked: true,
        code: 'blocked',
        message: (message || '').replace(/\s+/g, ' ').trim(),
        reason: blocked ? blocked.reason : null,
      };
    }
    log('delete:confirmModalMatched');

    const confirmButton = modal.querySelector(CONFIRM_BUTTON_SELECTOR);
    const cancelButton = modal.querySelector(CANCEL_BUTTON_SELECTOR);
    if (!confirmButton || !isVisible(confirmButton) || isForbidden(confirmButton)) {
      log('delete:noConfirmButton');
      return { ok: false, code: 'no_confirm_button' };
    }
    if (cancelButton && confirmButton === cancelButton) {
      log('delete:confirmIsCancel');
      return { ok: false, code: 'confirm_is_cancel' };
    }
    const label = normText(confirmButton.textContent);
    if (isNeverClickText(label)) {
      log(`delete:refuseNeverClick:${label}`);
      return { ok: false, code: 'never_click_label' };
    }
    if (!CONFIRM_BUTTON_LABELS.map(normText).includes(label)) {
      log(`delete:unexpectedConfirmLabel:${label}`);
      return { ok: false, code: 'unexpected_confirm_label' };
    }

    log(`delete:confirm:${label}`);
    confirmButton.click();
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // 삭제 결과 확인
  // ---------------------------------------------------------------------------
  //
  // 확인 모달 문구가 "일괄삭제의 경우, 다소 시간이 걸릴수 있습니다. (최대 3분)" 이라
  // 목록에서 사라질 때까지 최대 3분 + 여유를 두고 기다린다.
  //
  // 번들 실측: 성공하면 `$searchTable/batchDelete` 커밋 후 REFRESH_DATA 로 목록을
  // 다시 그린다. 그 사이 잠깐 행이 비어 보일 수 있어서 **연속 2회** 사라져 있어야
  // 성공으로 인정한다.
  const DELETE_SETTLE_TIMEOUT_MS = 200000;
  const DELETE_POLL_INTERVAL_MS = 3000;
  const DELETE_ABSENT_STREAK = 2;

  const PARTIAL_FAIL_SELECTOR = '.partialFailContainer';

  function findVisiblePartialFailModal() {
    return [...document.querySelectorAll(PARTIAL_FAIL_SELECTOR)].find(isVisible) || null;
  }

  /** 확인 이후 뜬 차단/실패 안내. 삭제 확인 모달 자신은 제외한다. */
  function findPostConfirmFailureText() {
    const modal = findVisibleConfirmModal();
    if (modal) {
      const normalized = normText(modalMessage(modal));
      if (!DELETE_CONFIRM_SIGNATURES.some((sig) => normalized.includes(sig))
        && /삭제할수없습니다|실패|오류|승인대기중|심사중/.test(normalized)) {
        return (modalMessage(modal) || '').replace(/\s+/g, ' ').trim();
      }
    }
    const partial = findVisiblePartialFailModal();
    if (partial) return (partial.textContent || '').replace(/\s+/g, ' ').trim();
    return null;
  }

  async function waitUntilRowIsGone(target, log) {
    const start = Date.now();
    let absentStreak = 0;
    while (Date.now() - start < DELETE_SETTLE_TIMEOUT_MS) {
      await sleep(DELETE_POLL_INTERVAL_MS);

      const failure = findPostConfirmFailureText();
      if (failure) {
        log('delete:postConfirmFailure');
        return { ok: false, failureText: failure };
      }

      if (findRowsByExternalId(target).length === 0) {
        absentStreak += 1;
        if (absentStreak >= DELETE_ABSENT_STREAK) return { ok: true };
      } else {
        absentStreak = 0;
      }
    }
    log('delete:settleTimeout');
    return { ok: false, timedOut: true };
  }

  async function deleteWingProduct({ externalId, displayName }) {
    const steps = [];
    const log = (s) => steps.push(s);

    const target = String(externalId || '').trim();
    if (!/^\d{6,20}$/.test(target)) {
      return { ok: false, steps, error: '삭제 대상 등록상품ID가 올바르지 않습니다.' };
    }
    log(`delete:target:${target}`);

    // 1) 목록에서 대상 행을 찾는다. 정확히 1건이 아니면 중단한다.
    const rows = await waitFor(
      () => {
        const found = findRowsByExternalId(target);
        return found.length > 0 ? found : null;
      },
      { timeout: 20000 },
    );
    if (!rows) {
      log('delete:rowNotFound');
      return {
        ok: false,
        steps,
        error: `등록상품ID ${target} 을(를) 목록에서 찾지 못했습니다. WING 상품목록에서 해당 상품을 검색한 상태로 다시 시도하세요.`,
      };
    }
    if (rows.length !== 1) {
      log(`delete:ambiguousRows:${rows.length}`);
      return {
        ok: false,
        steps,
        error: `등록상품ID ${target} 에 해당하는 행이 ${rows.length}개입니다. 모호하면 삭제하지 않습니다.`,
      };
    }
    log('delete:rowFound');

    // 2) 그 행만 선택한다. 다른 체크박스는 전부 해제해 일괄삭제가 번지지 않게 한다.
    const allChecks = [...document.querySelectorAll('input[type="checkbox"]')];
    for (const check of allChecks) {
      if (check.checked && check !== rowCheckbox(rows[0])) {
        check.click();
        await sleep(50);
      }
    }
    const box = rowCheckbox(rows[0]);
    if (!box) {
      log('delete:noRowCheckbox');
      return { ok: false, steps, error: '삭제할 행의 선택 체크박스를 찾지 못했습니다.' };
    }
    if (!box.checked) box.click();
    await sleep(400);
    const selected = [...document.querySelectorAll('input[type="checkbox"]')].filter((c) => c.checked);
    if (selected.length !== 1) {
      log(`delete:selectionNotExact:${selected.length}`);
      return {
        ok: false,
        steps,
        error: `선택된 행이 ${selected.length}개입니다. 정확히 1개일 때만 삭제합니다.`,
      };
    }
    log('delete:selected:1');

    // 3) '선택한 상품 일괄적용' ▸ (스크롤) ▸ '삭제'.
    const bulkTrigger = btnByText('선택한 상품 일괄적용', document)
      || btnByText('일괄적용', document);
    if (!bulkTrigger) {
      log('delete:noBulkMenu');
      return { ok: false, steps, error: "'선택한 상품 일괄적용' 메뉴를 찾지 못했습니다." };
    }
    bulkTrigger.click();
    await sleep(800);

    const menu = await waitFor(findBulkDropdownMenu, { timeout: 8000 });
    if (!menu) {
      log('delete:noDropdownMenu');
      return {
        ok: false,
        steps,
        error: "'선택한 상품 일괄적용' 드롭다운이 열리지 않았습니다.",
      };
    }
    log('delete:bulkMenuOpened');

    const deleteItem = findDeleteMenuItem(menu);
    if (!deleteItem) {
      log('delete:noDeleteMenuItem');
      return { ok: false, steps, error: "일괄적용 메뉴에서 '삭제' 항목을 찾지 못했습니다." };
    }

    // ⚠️ '삭제'는 208px 뷰포트 밖(offsetTop 198 + 33)이라 스크롤해야 눌린다.
    const revealed = revealDropdownItem(menu, deleteItem);
    log(revealed ? 'delete:deleteItemRevealed' : 'delete:deleteItemStillClipped');
    if (!revealed) {
      return {
        ok: false,
        steps,
        error: "일괄적용 드롭다운에서 '삭제' 항목을 화면에 노출시키지 못했습니다.",
      };
    }
    await sleep(200);

    deleteItem.click();
    log('delete:menuDeleteClicked');
    await sleep(800);

    // 4) 확인 모달. 차단 안내면 성공으로 보고하지 않고 사유를 그대로 올린다.
    const confirmed = await confirmDeletionModal(log);
    if (!confirmed.ok) {
      if (confirmed.blocked) {
        const reason = confirmed.reason || '쿠팡이 이 상품의 삭제를 거부했습니다.';
        return {
          ok: false,
          steps,
          blocked: true,
          blockedReason: reason,
          coupangMessage: confirmed.message || null,
          error: `쿠팡이 삭제를 거부했습니다: ${reason}${confirmed.message ? ` (쿠팡 안내: ${confirmed.message})` : ''}`,
        };
      }
      return {
        ok: false,
        steps,
        error: '삭제 확인 모달을 처리하지 못했습니다. WING 탭에서 결과를 직접 확인하세요.',
      };
    }

    // 5) 목록에서 사라졌는지 확인한다. 확인되지 않으면 성공으로 보고하지 않는다.
    const settled = await waitUntilRowIsGone(target, log);
    if (!settled.ok) {
      if (settled.failureText) {
        return {
          ok: false,
          steps,
          blocked: true,
          blockedReason: settled.failureText,
          coupangMessage: settled.failureText,
          error: `쿠팡이 삭제를 완료하지 못했습니다: ${settled.failureText}`,
        };
      }
      return {
        ok: false,
        steps,
        error: `삭제를 실행했지만 ${target} 이(가) 아직 목록에 있습니다. 일괄삭제는 최대 3분 걸릴 수 있으니 WING 탭에서 직접 확인하세요.`,
      };
    }
    log('delete:ok');
    return { ok: true, steps, externalId: target, displayName: displayName || null };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.action === 'deleteWingProduct') {
      deleteWingProduct(msg)
        .then((r) => sendResponse(r))
        .catch((e) => sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }));
      return true;
    }
    return false;
  });
})();
