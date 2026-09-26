// 온채널(onch3.co.kr) 공급사 주문 읽기(ISOLATED world, KID-380 — 옛 worker.js `scrapeOnchannelOrders` 이식).
// 사이트 `extensions/src/sites/onch`가 공급사 주문 목록(supplier/orders.php?state=all) 탭에 `page-call/bridge.js`와 함께
// 주입하고 `onch.orders`를 부른다. 목록에서 주문코드+주문일자를 모아 그날 주문만 고르고(최대 100건), 주문마다 상세
// 모달(order_access.php?ubr=order_detail_supplier, 4개씩)을 읽는다. 읽기만 한다 — 상세 모달은 POST지만 조회다.
(function installOnchOrders() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});

  calls["onch.orders"] = async function onchOrders(args) {
    const dateFilter = typeof args?.dateFilter === "string" ? args.dateFilter : "";
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const num = (s) => Number(String(s || "").replace(/[^0-9.-]/g, "")) || 0;
    try {
      // 1) 리스트: 주문코드 + 주문일자 (supplierOrderDetailModal arg + 행 첫 날짜)
      const listRes = await fetch("/supplier/orders.php?state=all", { credentials: "include" });
      const listHtml = await listRes.text();
      const ldoc = new DOMParser().parseFromString(listHtml, "text/html");
      const rows = [];
      const seen = new Set();
      for (const tr of ldoc.querySelectorAll("tr")) {
        const m = tr.innerHTML.match(/supplierOrderDetailModal\('([^']+)'\)/);
        if (!m) continue;
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        const dm = norm(tr.innerText).match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/); // 첫 날짜 = 주문일자
        rows.push({ orderCode: m[1], date: dm ? dm[0] : "" });
      }
      if (!rows.length) {
        // 로그아웃이면 목록 요청이 /login/login_web.php 로 넘어간다(mall-session.js onch 줄, 2026-09-12 실측) —
        // 로그인 문턱이 이 답으로 자동 로그인한다. 그 밖의 빈 목록은 옛 수집기처럼 실패다(전체 목록은 비지 않는다).
        if (/\/login\//i.test(String(listRes.url || "")) || ldoc.querySelector('input[type="password"]')) {
          return { status: "login_required" };
        }
        return { status: "failed", error: "온채널 주문 목록을 찾지 못했습니다. onch3.co.kr 로그인을 확인하세요." };
      }
      // 그날 날짜 필터 (일자가 "YYYY-MM-DD ..." 이므로 startsWith). dateFilter 없으면 전체.
      const dayRows = dateFilter ? rows.filter((r) => r.date.startsWith(dateFilter)) : rows;
      if (!dayRows.length) {
        return { status: "ok", orders: [] }; // 그날 신규 주문 없음 (정상)
      }
      const targets = dayRows.slice(0, 100); // 상한 (오늘만이라 보통 적음)

      // 검증된 상세모달 파서
      const parseModal = (html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        let productPrice = 0;
        let shippingFee = 0;
        for (const t of doc.querySelectorAll("table")) {
          const trs = [...t.rows];
          const hdr = trs[0] ? [...trs[0].cells].map((c) => norm(c.innerText)) : [];
          const pi = hdr.findIndex((h) => /상품금액/.test(h));
          const si = hdr.findIndex((h) => /배송비/.test(h));
          if (pi >= 0 && si >= 0 && trs[1]) {
            const v = [...trs[1].cells].map((c) => num(c.innerText));
            productPrice = v[pi];
            shippingFee = v[si];
            break;
          }
        }
        let option = "";
        let qty = 1;
        for (const t of doc.querySelectorAll("table")) {
          const trs = [...t.rows];
          const hdr = trs[0] ? [...trs[0].cells].map((c) => norm(c.innerText)) : [];
          const oi = hdr.findIndex((h) => /^옵션/.test(h));
          const qi = hdr.findIndex((h) => /^수량/.test(h));
          if (oi >= 0 && qi >= 0 && trs[1]) {
            const v = [...trs[1].cells];
            option = norm(v[oi] ? v[oi].innerText : "");
            qty = num(v[qi] ? v[qi].innerText : "") || 1;
            break;
          }
        }
        const field = (re) => {
          for (const t of doc.querySelectorAll("table")) {
            for (const tr of t.rows) {
              const c = [...tr.cells];
              for (let i = 0; i + 1 < c.length; i++) {
                if (re.test(norm(c[i].innerText))) return norm(c[i + 1].innerText);
              }
            }
          }
          return "";
        };
        const addrRaw = field(/^주소$/);
        const zipM = addrRaw.match(/\(?(\d{5})\)?/);
        const txt = norm(doc.body ? doc.body.innerText : "");
        const pm = txt.match(/\(([A-Za-z0-9_-]+)\)\s*(.+?)\s*옵션/);
        return {
          productCode: pm ? pm[1] : "",
          productName: pm ? pm[2].trim() : "",
          option,
          qty,
          productPrice,
          shippingFee,
          customer: field(/받는\s*사람/),
          phone: field(/전화번호/),
          emergency: field(/비상\s*연락처/),
          zip: zipM ? zipM[1] : "",
          address: addrRaw.replace(/^\(?\d{5}\)?\s*/, "").trim(),
          message: field(/배송\s*메시지/),
        };
      };

      // 2) 주문별 상세모달 fetch (4개씩 병렬)
      const orders = [];
      const CONCURRENCY = 4;
      for (let i = 0; i < targets.length; i += CONCURRENCY) {
        await Promise.all(
          targets.slice(i, i + CONCURRENCY).map(async (r) => {
            try {
              const res = await fetch("/access/order_access.php?ubr=order_detail_supplier", {
                method: "POST",
                credentials: "include",
                headers: { "content-type": "application/x-www-form-urlencoded" },
                body: "orderCode=" + encodeURIComponent(r.orderCode),
              });
              orders.push({ orderCode: r.orderCode, date: r.date, ...parseModal(await res.text()) });
            } catch {
              orders.push({ orderCode: r.orderCode, date: r.date }); // 모달 실패 시 최소 정보
            }
          }),
        );
      }
      return { status: "ok", orders };
    } catch (e) {
      return { status: "failed", error: String((e && e.message) || e) };
    }
  };
})();
