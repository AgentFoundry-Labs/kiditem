// 온채널(onch3.co.kr) 송장 업로드(ISOLATED world, KID-366 wave8b — 옛 worker.js `scrapeOnchUpload` 이식). 몰에 쓴다.
// 사이트 `extensions/src/sites/onch`가 운영자 온채널 탭(공급사 주문 목록)에 `page-call/bridge.js`와 함께 주입하고
// `onch.uploadTracking` {rows:[{orderNo, trackingNumber, courierName}]}을 부른다. 목록 DOM에서 주문코드(상세 모달) →
// {memberOrderNum, isFirst}를 같은 행의 송장입력 버튼과 짝지어 읽고, 행마다 `/access/order_access.php?ubr=trans_ok`를
// POST한다(250ms 간격). `isFirst !== 'true'`는 이미 송장 등록됨(보내지 않음), 목록에 없는 주문은 보내지 않는다.
// 택배사 이름은 화면의 #deliveryObjs에서 확정한다(옛 규칙 — 없으면 "CJ 대한통운").
(function installOnchTrackingUpload() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  const squash = (value) => String(value == null ? "" : value).replace(/\s+/g, "");

  calls["onch.uploadTracking"] = async function onchTrackingUpload(args) {
    const rows = Array.isArray(args && args.rows) ? args.rows : [];
    if (/login/i.test(location.href) || document.querySelector('input[type="password"]')) return { status: "login_required" };

    // 택배사 정식명 — #deliveryObjs에서 확정, 없으면 기본값(옛 규칙은 대한통운 하나였다).
    let deliveryNames = [];
    try {
      const objs = JSON.parse((document.getElementById("deliveryObjs") || {}).value || "[]");
      deliveryNames = objs.map((o) => String((o && o.delivery_name) || "")).filter(Boolean);
    } catch { /* 기본값 사용 */ }
    function transName(courierName) {
      const want = squash(courierName || "CJ대한통운");
      const exact = deliveryNames.find((name) => squash(name).includes(want));
      if (exact) return exact;
      if (/대한통운/.test(want)) return deliveryNames.find((name) => /대한통운/.test(name)) || "CJ 대한통운";
      return null;
    }

    // 목록: 주문코드(상세모달) → { member(memberOrderNum), isFirst }. 송장입력 버튼과 같은 행의 주문코드를 페어링.
    const map = {};
    const sjBtns = [...document.querySelectorAll('[onclick*="supplierDeliveryNumberModal"]')];
    for (const b of sjBtns) {
      const oc = b.getAttribute("onclick") || "";
      const m = oc.match(/supplierDeliveryNumberModal\('([^']*)','([^']*)','([^']*)'/);
      if (!m) continue;
      let el = b;
      let code = null;
      for (let i = 0; i < 12 && el; i += 1) {
        el = el.parentElement;
        const d = el && el.querySelector('[onclick*="supplierOrderDetailModal"]');
        if (d) { code = ((d.getAttribute("onclick") || "").match(/'([^']+)'/) || [])[1]; break; }
      }
      if (code && !map[code]) map[code] = { member: m[1], isFirst: m[3] };
    }

    const results = [];
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const r of rows) {
      const orderNo = String((r && r.orderNo) || "").trim();
      const invNo = String((r && r.trackingNumber) || "").trim();
      const hit = map[orderNo];
      if (!hit) { results.push({ orderNo, status: "not_in_list", mallMessage: "온채널 목록에 없음(이미 발송 또는 기간 밖)" }); continue; }
      if (hit.isFirst !== "true") { results.push({ orderNo, status: "already_uploaded", mallMessage: "이미 송장 등록됨" }); continue; }
      if (!invNo) { results.push({ orderNo, status: "failed", mallMessage: "송장번호 없음" }); continue; }
      const transNm = transName(r.courierName);
      if (!transNm) { results.push({ orderNo, status: "failed", mallMessage: `온채널 택배사 목록에 '${r.courierName}' 없음` }); continue; }
      const body = new URLSearchParams({ trans_nm: transNm, trans_num: invNo, hidden_trans_num: hit.member });
      try {
        const res = await fetch("/access/order_access.php?ubr=trans_ok", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
          body: body.toString(),
        });
        const txt = await res.text();
        let code = null;
        try { code = JSON.parse(txt).code; } catch { /* not json */ }
        const ok = String(code) === "200";
        results.push({ orderNo, status: ok ? "uploaded" : "failed", mallMessage: ok ? null : "응답 " + (code ?? txt.slice(0, 40)) });
        await sleep(250); // 연속 POST 간격
      } catch (e) {
        results.push({ orderNo, status: "failed", mallMessage: String((e && e.message) || e).slice(0, 200) });
      }
    }
    return { status: "ok", listSize: Object.keys(map).length, rows: results };
  };
})();
