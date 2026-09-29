// 키드키즈(partner.kidkids.net) 송장 등록·출고완료(ISOLATED world, KID-366 wave8b — 옛 worker.js
// `scrapeKidkidsTrackingUpload` 이식). ⚠️파괴적: 출고완료는 되돌리기 어렵다. 사이트 `extensions/src/sites/kidkids`가 운영자
// 키드키즈 탭(출고관리)에 `page-call/bridge.js`와 함께 주입하고 `kidkids.uploadTracking`
// {rows:[{orderNo, trackingNumber, courierName}]}을 부른다. 목록에서 주문번호 → 출고선택 CheckBox(od)를 찾아 송장 입력칸
// (deliveryTxt_{od})·택배사 select를 채우고 체크한 뒤, 하단 "출고 완료 등록"(go_reg)을 재현해 `/sales/sales_process.htm`
// (mode=aan, mul_id=|ods, delivery_no=|송장)을 한 번 POST한다. 키드키즈는 성공 코드 없이 목록 HTML을 돌려주므로 HTTP ok는
// "제출됨"일 뿐이다(`submitted`) — 반영은 운영자가 목록에서 확인한다.
(function installKidkidsTrackingUpload() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

  calls["kidkids.uploadTracking"] = async function uploadKidkidsTracking(args) {
    const rows = Array.isArray(args && args.rows) ? args.rows : [];
    if (/login|partnerlogin|partner_login/i.test(location.href) || document.querySelector('input[type="password"]')) {
      return { status: "login_required" };
    }
    // 출고선택(CheckBox)이 있는 목록 테이블 + 주문번호 컬럼 인덱스.
    const firstCb = document.querySelector('input[name="CheckBox"]');
    if (!firstCb) return { status: "unreadable", error: "출고관리 목록을 찾지 못했습니다. (로그인/화면 확인)" };
    let table = firstCb;
    while (table && table.tagName !== "TABLE") table = table.parentElement;
    if (!table) return { status: "unreadable", error: "출고관리 목록 테이블을 찾지 못했습니다." };
    const trs = [...table.rows];
    const hdr = trs.find((r) => [...r.cells].some((c) => /주문번호/.test(c.textContent)));
    const orderNoCol = hdr ? [...hdr.cells].findIndex((c) => norm(c.textContent).includes("주문번호")) : -1;

    // 주문번호 → { cb(출고선택), od } 매핑.
    const byOrderNo = {};
    for (const cb of table.querySelectorAll('input[name="CheckBox"]')) {
      let tr = cb;
      while (tr && tr.tagName !== "TR") tr = tr.parentElement;
      if (!tr) continue;
      const ono = orderNoCol >= 0 ? norm(tr.cells[orderNoCol] && tr.cells[orderNoCol].textContent) : "";
      if (ono && !byOrderNo[ono]) byOrderNo[ono] = { cb, od: cb.value, tr };
    }

    // 택배사 select 옵션값 확정 — 하드코딩 대신 옵션 텍스트에서 찾는다.
    const resolveCourierValue = (tr, courierText) => {
      const sel = tr && tr.querySelector('select[name="logis_company_id"]');
      if (!sel) return { sel: null, value: "" };
      const want = String(courierText || "CJ대한통운").replace(/\s+/g, "");
      const opt = [...sel.options].find((o) => norm(o.textContent).replace(/\s+/g, "").includes(want));
      return { sel, value: opt ? opt.value : "" };
    };

    const targets = [];
    const results = [];
    for (const r of rows) {
      const ono = String((r && r.orderNo) || "").trim();
      const inv = String((r && r.trackingNumber) || "").trim();
      const hit = byOrderNo[ono];
      if (!hit) { results.push({ orderNo: ono, status: "not_in_list", mallMessage: "목록에 없음(이미 발송/기간 밖)" }); continue; }
      if (!inv) { results.push({ orderNo: ono, status: "failed", mallMessage: "송장번호 없음" }); continue; }
      // CJ대한통운 아래 송장 입력칸(deliveryTxt_{od})에 주입.
      const input = document.querySelector(`[name="deliveryTxt_${hit.od}"], #deli_no_${hit.od}`);
      if (!input) { results.push({ orderNo: ono, status: "failed", mallMessage: "송장 입력칸 없음" }); continue; }
      input.value = inv;
      const { sel, value } = resolveCourierValue(hit.tr, r.courierName);
      if (sel && value) sel.value = value;
      hit.cb.checked = true;
      targets.push({ od: hit.od, inv, courierValue: value, result: results.length });
      results.push({ orderNo: ono, status: "uploaded", mallMessage: null });
    }
    const listSize = Object.keys(byOrderNo).length;
    if (!targets.length) return { status: "ok", submitted: false, httpStatus: null, listSize, rows: results };

    // go_reg 재현: 출고완료(발송처리) 확정 POST. 서버는 |파이프 조인 mul_id/delivery_no 를 읽는다.
    const body = new URLSearchParams();
    body.set("from_logis_index", "Y");
    body.set("mode", "aan");
    body.set("mul_id", "|" + targets.map((t) => t.od).join("|"));
    body.set("delivery_no", "|" + targets.map((t) => t.inv).join("|"));
    const courierValue = (targets.find((t) => t.courierValue) || {}).courierValue;
    if (courierValue) body.set("logis_company_id", String(courierValue));
    const res = await fetch("/sales/sales_process.htm", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      for (const target of targets) results[target.result] = { ...results[target.result], status: "failed", mallMessage: `출고완료 등록 실패(HTTP ${res.status})` };
    }
    return { status: "ok", submitted: res.ok, httpStatus: res.status, listSize, rows: results };
  };
})();
