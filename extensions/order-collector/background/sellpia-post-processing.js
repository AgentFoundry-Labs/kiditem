(function initSellpiaPostProcessing(root) {
  "use strict";

  const TARGETS_KEY = "sellpiaPendingInvoiceTargetsV1";
  const TARGETS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const TARGETS_LIMIT = 10000;

  function normalizeTargetOrderNumbers(value) {
    if (!Array.isArray(value)) return [];
    const normalized = [];
    const seen = new Set();
    for (const entry of value) {
      const orderNumber = String(entry == null ? "" : entry).trim();
      if (!orderNumber || orderNumber.length > 160 || seen.has(orderNumber)) continue;
      seen.add(orderNumber);
      normalized.push(orderNumber);
      if (normalized.length >= TARGETS_LIMIT) break;
    }
    return normalized;
  }

  function createTargetStore({ chrome, storageKeyForEnvironment }) {
    function keyFor(environmentId) {
      return storageKeyForEnvironment(TARGETS_KEY, environmentId);
    }

    async function read(environmentId) {
      const key = keyFor(environmentId);
      const stored = (await chrome.storage.session.get(key))[key];
      const updatedAt = Number(stored?.updatedAt);
      if (
        !stored ||
        !Number.isFinite(updatedAt) ||
        Date.now() - updatedAt > TARGETS_MAX_AGE_MS
      ) {
        await chrome.storage.session.remove(key);
        return [];
      }
      return normalizeTargetOrderNumbers(stored.orderNumbers);
    }

    async function remember(environmentId, orderNumbers) {
      const next = normalizeTargetOrderNumbers(orderNumbers);
      if (next.length === 0) {
        throw new Error("셀피아 송장채번 대상 주문번호가 없습니다.");
      }
      const current = await read(environmentId);
      const merged = normalizeTargetOrderNumbers([...current, ...next]);
      const key = keyFor(environmentId);
      await chrome.storage.session.set({
        [key]: {
          orderNumbers: merged,
          updatedAt: Date.now(),
        },
      });
      return merged;
    }

    async function consume(environmentId, orderNumbers) {
      const consumed = new Set(normalizeTargetOrderNumbers(orderNumbers));
      if (consumed.size === 0) return read(environmentId);
      const remaining = (await read(environmentId))
        .filter((orderNumber) => !consumed.has(orderNumber));
      const key = keyFor(environmentId);
      if (remaining.length === 0) {
        await chrome.storage.session.remove(key);
      } else {
        await chrome.storage.session.set({
          [key]: {
            orderNumbers: remaining,
            updatedAt: Date.now(),
          },
        });
      }
      return remaining;
    }

    return Object.freeze({ read, remember, consume });
  }

  // Runs in the Sellpia page MAIN world. Keep this function self-contained.
  async function driveStep(step, targetOrderNumbers = []) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const jq = window.jQuery;
    if (!jq) {
      return { success: false, error: "셀피아 페이지(jQuery)를 찾지 못했습니다. 로그인/화면을 확인하세요." };
    }
    const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, "");
    const stripHtml = (h) => {
      const d = document.createElement("div");
      d.innerHTML = String(h == null ? "" : h);
      return (d.textContent || "").trim();
    };
    const promptButtons = () => Array.from(document.querySelectorAll(".jqibuttons button"));
    const promptOpen = () => promptButtons().length > 0;
    const promptMessage = () => {
      const els = Array.from(document.querySelectorAll(".jqimessage"));
      const el = els[els.length - 1];
      return el ? (el.textContent || "").trim() : "";
    };
    function answerPrompt(labels) {
      const btns = promptButtons();
      for (const label of labels) {
        const target = norm(label);
        const b = btns.find((x) => norm(x.textContent).includes(target));
        if (b) {
          b.click();
          return true;
        }
      }
      return false;
    }
    async function waitPrompt(matchRe, timeoutMs) {
      const until = Date.now() + timeoutMs;
      while (Date.now() < until) {
        if (promptOpen()) {
          const t = promptMessage();
          if (!matchRe || matchRe.test(t)) return t;
        }
        await sleep(150);
      }
      return null;
    }
    async function waitIdle(timeoutMs) {
      const until = Date.now() + timeoutMs;
      await sleep(400);
      while (Date.now() < until) {
        if ((jq.active || 0) === 0) {
          await sleep(300);
          if ((jq.active || 0) === 0) return true;
        }
        await sleep(200);
      }
      return false;
    }
    async function waitGrid(timeoutMs) {
      const until = Date.now() + timeoutMs;
      while (Date.now() < until) {
        if (window.dataView && typeof window.dataView.getLength === "function") return true;
        await sleep(200);
      }
      return false;
    }

    try {
      if (step === "register") {
        await waitGrid(12000);
        await waitIdle(15000);
        const btn = document.getElementById("save_b");
        if (!btn) {
          return {
            success: false,
            error: "등록 버튼(#save_b)을 찾지 못했습니다. 셀피아 주문서수집 화면인지/로그인 상태인지 확인하세요.",
          };
        }
        if (window.dataView && window.dataView.getLength() <= 0) {
          return {
            success: false,
            empty: true,
            error: "등록할 수집 주문이 없습니다. 먼저 셀피아 전송을 진행한 뒤 후처리를 실행하세요.",
          };
        }
        const pending = window.dataView ? window.dataView.getLength() : null;
        btn.click();
        const confirmTxt = await waitPrompt(/정리된 내용|등록/, 8000);
        if (!confirmTxt) return { success: false, error: "등록 확인창이 표시되지 않았습니다." };
        if (!answerPrompt(["기 등록된 내용 유지", "확인"])) {
          return { success: false, error: "등록 확인 버튼(기 등록된 내용 유지)을 찾지 못했습니다." };
        }
        await waitIdle(50000);
        const resultTxt = await waitPrompt(/등록되었습니다|등록에 실패|실패/, 4000);
        answerPrompt(["Ok", "확인", "닫기"]);
        await sleep(300);
        if (resultTxt && /실패/.test(resultTxt)) return { success: false, error: stripHtml(resultTxt) };
        return { success: true, registered: pending, message: resultTxt ? stripHtml(resultTxt) : "주문 등록 완료" };
      }

      if (step === "stockmatch") {
        if (!(await waitGrid(15000))) {
          return { success: false, error: "재고매칭 화면(그리드)을 찾지 못했습니다. 로그인/화면을 확인하세요." };
        }
        const searchBtn = document.getElementById("btn_search");
        if (!searchBtn) return { success: false, error: "조회 버튼(#btn_search)을 찾지 못했습니다." };
        searchBtn.click();
        const initP = await waitPrompt(/초기화|계속/, 1500);
        if (initP) answerPrompt(["예"]);
        await waitIdle(70000);
        await sleep(600);
        const listCount = window.dataView ? window.dataView.getLength() : 0;
        if (listCount <= 0) {
          return {
            success: true,
            listCount: 0,
            matched: 0,
            unmatched: [],
            unmatchedCount: 0,
            message: "재고매칭 화면에 조회된 주문이 없습니다.",
          };
        }

        const tieBtn = document.getElementById("btn_tie");
        if (tieBtn) {
          tieBtn.click();
          const tieP = await waitPrompt(/합포|일치/, 6000);
          if (tieP) {
            answerPrompt(["자동합포 리스트", "확인", "예"]);
            await waitIdle(70000);
            const tieDone = await waitPrompt(/합포|완료|없습니다/, 2500);
            if (tieDone) answerPrompt(["확인", "예", "Ok", "닫기"]);
            await sleep(400);
          }
        }

        const smatchBtn = document.getElementById("btn_smatch");
        if (!smatchBtn) return { success: false, error: "자동재고매칭 버튼(#btn_smatch)을 찾지 못했습니다." };
        smatchBtn.click();
        const smP = await waitPrompt(/재고매칭|계속/, 6000);
        if (!smP) return { success: false, error: "자동재고매칭 확인창이 표시되지 않았습니다." };
        answerPrompt(["예"]);
        await waitIdle(120000);
        const doneTxt = await waitPrompt(/재고매칭을 완료|없습니다/, 5000);
        let matchedFromPrompt = null;
        if (doneTxt) {
          const m = doneTxt.match(/완료\s*\(?\s*([0-9,]+)/);
          if (m) matchedFromPrompt = Number(m[1].replace(/,/g, ""));
          answerPrompt(["확인", "예", "Ok", "닫기"]);
          await sleep(400);
        }

        const items = window.dataView && window.dataView.getItems ? window.dataView.getItems() : [];
        const isFee = (nm) => /택배비|배송비/.test(String(nm || ""));
        const unmatched = [];
        let matched = 0;
        let productRows = 0;
        for (const it of items) {
          const name = it.c_prd_name || it.c_prd_name_sp || "";
          if (isFee(name)) continue;
          productRows += 1;
          const result = stripHtml(it.c_result);
          if (/재고매칭/.test(result)) {
            matched += 1;
            continue;
          }
          unmatched.push({
            groupNo: String(it.c_group_no || ""),
            receiver: stripHtml(it.c_receiver),
            provider: stripHtml(it.c_provider_name),
            product: stripHtml(name),
            option: stripHtml(it.c_opt_name),
            result: result || "미매칭",
          });
        }
        return {
          success: true,
          listCount,
          productRows,
          matched: matchedFromPrompt != null ? matchedFromPrompt : matched,
          unmatched,
          unmatchedCount: unmatched.length,
          message: `조회 ${listCount}건 · 재고매칭 ${matched}건 · 미매칭 ${unmatched.length}건`,
        };
      }

      if (step === "invoice") {
        if (!(await waitGrid(20000))) {
          return { success: false, error: "송장채번 화면(그리드)을 찾지 못했습니다. 로그인/자동송장연동 설정을 확인하세요." };
        }
        await waitIdle(25000);
        await sleep(500);
        const btn = document.getElementById("btn_get_auto_delinum");
        if (!btn) {
          return { success: false, error: "송장번호채번 버튼(#btn_get_auto_delinum)을 찾지 못했습니다." };
        }
        if (btn.disabled) {
          return { success: false, error: "송장번호 채번 불가 상태입니다(자동송장연동/발송지 설정을 확인하세요)." };
        }
        const waiting = window.dataView ? window.dataView.getLength() : 0;
        if (waiting <= 0) {
          return { success: true, invoiced: 0, message: "송장채번 대기 주문이 없습니다(이미 채번되었거나 재고매칭 대기)." };
        }
        const st = (v) => String(v == null ? "" : v).trim();
        const targets = Array.from(new Set(
          (Array.isArray(targetOrderNumbers) ? targetOrderNumbers : [])
            .map(st)
            .filter(Boolean),
        ));
        if (targets.length <= 0) {
          return {
            success: false,
            error:
              "이번 전송 주문번호가 없어 송장채번을 중단했습니다. 안전을 위해 대기 주문 전체 채번은 실행하지 않습니다.",
          };
        }
        const targetForRow = (it) => {
          const values = [
            it.group_no,
            it.c_group_no,
            it.ord_no,
            it.order_no,
            it.shop_order_no,
            it.provider_order_no,
            it.seller_order_no,
            it.om_order_no,
          ].map(st).filter(Boolean);
          for (const target of targets) {
            for (const value of values) {
              if (value === target) return target;
              if (!value.endsWith(target)) continue;
              const prefix = value.slice(0, -target.length);
              if (/[_:|\/\s-]$/.test(prefix)) return target;
            }
          }
          return null;
        };
        const beforeItems = window.dataView && window.dataView.getItems
          ? window.dataView.getItems()
          : [];
        const selectedRows = [];
        const selectedTargets = new Set();
        for (let index = 0; index < beforeItems.length; index += 1) {
          const target = targetForRow(beforeItems[index]);
          if (!target) continue;
          selectedRows.push(index);
          selectedTargets.add(target);
        }
        if (selectedRows.length <= 0) {
          return {
            success: false,
            requestedTargetCount: targets.length,
            selectedTargetCount: 0,
            missingTargetCount: targets.length,
            error:
              `이번 전송 주문 ${targets.length}건과 일치하는 송장 대기 행이 없습니다. 다른 대기 주문은 채번하지 않았습니다.`,
          };
        }
        if (!window.grid || typeof window.grid.setSelectedRows !== "function") {
          return {
            success: false,
            error:
              "송장채번 대상 행을 선택할 수 없어 중단했습니다. 다른 대기 주문은 채번하지 않았습니다.",
          };
        }
        try {
          window.grid.setSelectedRows(selectedRows);
        } catch (e) {
          return {
            success: false,
            error:
              "송장채번 대상 행 선택에 실패해 중단했습니다. 다른 대기 주문은 채번하지 않았습니다.",
          };
        }
        await sleep(300);
        btn.click();
        const confirmTxt = await waitPrompt(/채번|진행/, 6000);
        if (!confirmTxt) return { success: false, error: "송장채번 확인창이 표시되지 않았습니다." };
        answerPrompt(["예"]);
        await waitIdle(120000);
        const doneTxt = await waitPrompt(/완료|채번|실패|없습니다/, 6000);
        answerPrompt(["확인", "예", "Ok", "닫기"]);
        await sleep(700);
        if (doneTxt && /실패/.test(doneTxt)) return { success: false, error: stripHtml(doneTxt) };
        const gItems = window.dataView && window.dataView.getItems ? window.dataView.getItems() : [];
        const rows = gItems
          .filter((it) => targetForRow(it) && st(it.delinum))
          .map((it) => {
            const target = targetForRow(it);
            const gno = st(it.group_no);
            const addr = st(it.receiver_addr) || [st(it.receiver_addr1), st(it.receiver_addr2)].filter(Boolean).join(" ");
            return {
              ordNo: target || gno,
              itemNo: "",
              invNo: st(it.delinum),
              courier: "1136",
              provider: st(it.provider_name),
              receiver: st(it.receiver).replace(/\([^)]*\)\s*$/, "").trim(),
              post: st(it.receiver_post),
              addr,
              groupNo: gno,
            };
          });
        return {
          success: true,
          requestedTargetCount: targets.length,
          selectedTargetCount: selectedTargets.size,
          missingTargetCount: Math.max(0, targets.length - selectedTargets.size),
          selectedTargetOrderNumbers: [...selectedTargets],
          invoiced: rows.length || selectedRows.length,
          rows,
          message: doneTxt
            ? stripHtml(doneTxt)
            : `이번 전송 주문 송장채번 완료(${rows.length || selectedRows.length}건)`,
        };
      }

      return { success: false, error: "알 수 없는 단계: " + step };
    } catch (e) {
      return { success: false, error: String((e && e.message) || e) };
    }
  }

  root.KidItemSellpiaPostProcessing = Object.freeze({
    createTargetStore,
    driveStep,
    normalizeTargetOrderNumbers,
  });
})(globalThis);
