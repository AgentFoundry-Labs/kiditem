// wing-product-delete.js
// 쿠팡 WING 상품목록에서 **우리가 등록한 상품 1건**을 삭제한다.
//
// ⚠️⚠️ 이 파일은 되돌릴 수 없는 동작을 수행한다. 설계 원칙:
//   1) 대상은 항상 **등록상품ID(vendorInventoryId) 정확일치 1건**. 0건이거나 2건 이상이면
//      아무것도 하지 않고 실패로 돌려준다. "아마 이거겠지"로 지우지 않는다.
//   2) 서버가 인가한 externalId 로만 움직인다. 화면에서 사용자가 고른 행을 믿지 않는다.
//   3) 확인 모달의 버튼은 **모달 컨테이너 안에서만** 찾는다. 문서 전역 탐색은
//      '페이지 별점주기' 위젯의 버튼을 눌러 모달 지옥에 빠뜨린 이력이 있다.
//   4) 단계마다 실패하면 즉시 멈춘다. 부분 성공을 성공으로 보고하지 않는다.
//
// 호출: chrome.tabs.sendMessage(tabId, { action: 'deleteWingProduct', externalId, displayName })
// 응답: { ok, steps, error? }

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
        && b.offsetParent !== null
        && !isForbidden(b),
    ) || null;
  }

  /**
   * 등록상품ID 가 정확히 일치하는 행을 찾는다.
   *
   * 부분일치를 쓰지 않는다 — `16311428128` 로 검색했는데 `163114281280` 이 걸리면
   * 엉뚱한 상품을 지운다. 행 텍스트에서 8자리 이상 숫자를 모두 뽑아 정확 비교한다.
   */
  function findRowsByExternalId(externalId) {
    const target = String(externalId).trim();
    const rows = [...document.querySelectorAll('tr, [role="row"], .product-row')];
    return rows.filter((row) => {
      if (row.offsetParent === null) return false;
      const ids = (row.textContent || '').match(/\d{8,}/g) || [];
      return ids.includes(target);
    });
  }

  function rowCheckbox(row) {
    return row.querySelector('input[type="checkbox"]');
  }

  /**
   * 확인 모달에서 삭제를 확정한다.
   *
   * 모달 컨테이너를 먼저 특정한 뒤 그 **안에서만** 버튼을 찾는다.
   * 컨테이너를 못 찾으면 아무것도 누르지 않는다.
   */
  const CONFIRM_TEXTS = ['네, 삭제합니다', '삭제합니다', '삭제', '확인'];

  async function confirmDeletionModal(log) {
    const modal = await waitFor(
      () =>
        document.querySelector(
          '[role="dialog"], .modal.in, .modal[style*="block"], .layer-popup, .ui-dialog',
        ),
      { timeout: 8000 },
    );
    if (!modal || isForbidden(modal)) {
      log('delete:noConfirmModal');
      return false;
    }
    for (const text of CONFIRM_TEXTS) {
      const button = btnByText(text, modal);
      if (button) {
        log(`delete:confirm:${text}`);
        button.click();
        await sleep(1500);
        return true;
      }
    }
    log('delete:noConfirmButton');
    return false;
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
    for (const box of allChecks) {
      if (box.checked && box !== rowCheckbox(rows[0])) {
        box.click();
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

    // 3) '선택한 상품 일괄적용' ▸ '삭제'.
    const bulkTrigger = btnByText('선택한 상품 일괄적용', document)
      || btnByText('일괄적용', document);
    if (!bulkTrigger) {
      log('delete:noBulkMenu');
      return { ok: false, steps, error: "'선택한 상품 일괄적용' 메뉴를 찾지 못했습니다." };
    }
    bulkTrigger.click();
    await sleep(800);
    log('delete:bulkMenuOpened');

    const deleteItem = await waitFor(
      () =>
        [...document.querySelectorAll('li, a, button')].find(
          (el) => normText(el.textContent) === '삭제'
            && el.offsetParent !== null
            && !isForbidden(el),
        ),
      { timeout: 5000 },
    );
    if (!deleteItem) {
      log('delete:noDeleteMenuItem');
      return { ok: false, steps, error: "일괄적용 메뉴에서 '삭제' 항목을 찾지 못했습니다." };
    }
    deleteItem.click();
    log('delete:menuDeleteClicked');
    await sleep(800);

    // 4) 확인 모달.
    const confirmed = await confirmDeletionModal(log);
    if (!confirmed) {
      return {
        ok: false,
        steps,
        error: '삭제 확인 모달을 처리하지 못했습니다. WING 탭에서 결과를 직접 확인하세요.',
      };
    }

    // 5) 목록에서 사라졌는지 확인한다. 확인되지 않으면 성공으로 보고하지 않는다.
    await sleep(2000);
    const remaining = findRowsByExternalId(target);
    if (remaining.length > 0) {
      log('delete:stillPresent');
      return {
        ok: false,
        steps,
        error: `삭제를 실행했지만 ${target} 이(가) 아직 목록에 있습니다. WING 탭에서 직접 확인하세요.`,
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
