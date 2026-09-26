// 키즈노트(shop.kidsnote.com, WISA) 주문 읽기(ISOLATED world, KID-380 — 옛 worker.js `scrapeKidsnoteOrders` 이식).
// 사이트 `extensions/src/sites/kidsnote`가 전체주문조회(_manage/?body=3010) 탭에 `page-call/bridge.js`와 함께 주입하고
// `kidsnote.orders`를 부른다. 목록을 쪽마다 읽어 주문번호 앞 날짜로 그날 주문만 고르고(목록은 최신순), 주문마다
// "주문서 인쇄"(수취인·주소·연락처, 마스킹 없음)와 주문보기(품목·금액·배송비·입금일시)를 붙인다. 읽기만 한다 — 주문서
// 인쇄는 POST지만 상태를 바꾸지 않는 인쇄 화면이다.
(function installKidsnoteOrders() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});

  calls["kidsnote.orders"] = async function kidsnoteOrders(args) {
    const from = typeof args?.from === "string" ? args.from : "";
    const to = typeof args?.to === "string" ? args.to : "";
    const status = typeof args?.status === "string" ? args.status : "";
    const withDetail = args?.withDetail === true;
    try {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const num = (s) => Number(String(s == null ? "" : s).replace(/[^0-9.-]/g, "")) || 0;
      // all_date=N 이어야 start_date~finish_date(주문일시)로 필터됨. Y 면 전체 기간(날짜 무시).
      const listUrl = (p) =>
        "/_manage/?body=3010&search_date_type=1&all_date=N" +
        "&start_date=" + (from || "") + "&finish_date=" + (to || "") +
        (status ? "&ord_stat=" + encodeURIComponent(status) : "") +
        "&page=" + p;

      const orders = [];
      const seen = new Set();
      for (let p = 1; p <= 30; p++) {
        const res = await fetch(listUrl(p), { credentials: "include" });
        const html = await res.text();
        if (!res.ok) {
          if (p === 1) return { status: "failed", error: "키즈노트 주문 조회 실패 (HTTP " + res.status + ")" };
          break;
        }
        const doc = new DOMParser().parseFromString(html, "text/html");
        const table = Array.from(doc.querySelectorAll("table")).find(
          (t) => /주문번호/.test((t.rows[0] && t.rows[0].innerText) || ""),
        );
        if (!table) {
          if (p === 1) {
            // 옛 수집기는 "관리자 로그인이 필요합니다"로 끝냈다 — 새 런타임은 로그인 문턱이 이 답으로 자동 로그인한다.
            if (/type=["']?password|로그인|login/i.test(html)) return { status: "login_required" };
            return { status: "ok", orders: [] };
          }
          break;
        }
        let pageCount = 0;
        let reachedOlder = false;
        for (const r of Array.from(table.rows).slice(1)) {
          const m = r.innerHTML.match(/viewOrder\(['"]([^'"]+)['"]\)/);
          const ono = m && m[1];
          if (!ono || seen.has(ono)) continue;
          const c = Array.from(r.cells);
          if (c.length < 10) continue;
          const ymd = /^(\d{4})(\d{2})(\d{2})/.exec(ono);
          const orderDate = ymd ? ymd[1] + "-" + ymd[2] + "-" + ymd[3] : "";
          // WISA GET 날짜파라미터가 안 먹혀(검색=폼/세션) → 주문일(ono)로 클라 필터. 목록은 최신순 desc.
          if (to && orderDate && orderDate > to) continue; // 범위보다 최신 — 건너뛰고 계속
          if (from && orderDate && orderDate < from) {
            reachedOlder = true; // 범위보다 과거 — 이후는 다 더 과거이므로 중단
            continue;
          }
          seen.add(ono);
          pageCount++;
          const timeM = norm(c[4].innerText).match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
          const pnoM =
            r.innerHTML.match(/check_pno\[\][^>]*value=["']([^"']+)["']/i) ||
            r.innerHTML.match(/value=["']([^"']+)["'][^>]*name=["']?check_pno/i);
          orders.push({
            ono: ono,
            pno: pnoM ? pnoM[1] : "",
            orderDate: orderDate,
            orderedAt: orderDate + (timeM ? " " + timeM[1] : ""),
            productName: norm(c[3].innerText),
            ordererName: norm(c[5].innerText),
            totalAmount: num(c[6].innerText),
            paidAmount: num(c[7].innerText),
            payMethod: norm(c[8].innerText),
            status: norm(c[9].innerText),
          });
        }
        if (reachedOlder) break;
        if (pageCount === 0 && orders.length > 0) break;
      }

      // 셀피아 변환용 상세 — "주문서 인쇄"(POST order@order_print.frm, check_pno) 가 마스킹 없이 깔끔.
      if (withDetail && orders.length) {
        const parseDetail = async (o) => {
          try {
            const body = "body=order@order_print.frm&check_pno[]=" + encodeURIComponent(o.pno || "");
            const dhtml = await (
              await fetch("/_manage/?", {
                method: "POST",
                credentials: "include",
                headers: { "content-type": "application/x-www-form-urlencoded" },
                body: body,
              })
            ).text();
            const ddoc = new DOMParser().parseFromString(dhtml, "text/html");
            // 인쇄페이지는 섹션헤더(○)가 td/th 아님 → innerText 라인 단위 파싱(라벨 다음 줄=값).
            const lines = (ddoc.body ? ddoc.body.innerText : "").split("\n").map((s) => s.trim()).filter(Boolean);
            let sec = "";
            let buyer = "", receiver = "", contact = "", addrRaw = "", request = "", pay = "";
            for (let i = 0; i < lines.length; i++) {
              const l = lines[i];
              const nv = lines[i + 1] || "";
              if (/^[○\s]*주문상품/.test(l)) sec = "product";
              else if (/^[○\s]*주문정보/.test(l)) sec = "info";
              else if (/^[○\s]*주문자/.test(l)) sec = "orderer";
              else if (/^[○\s]*배송지/.test(l)) sec = "ship";
              if (sec === "orderer" && l === "이름") buyer = nv.replace(/\s*\(.*\)\s*$/, "").trim();
              else if (sec === "ship" && l === "이름") receiver = nv;
              else if (sec === "ship" && /^연락처/.test(l)) contact = nv;
              else if (sec === "ship" && l === "주소") addrRaw = nv;
              else if (sec === "ship" && /메세지|메시지|요청/.test(l))
                request = /[<>{}=]|function|window\.|onload|confirm\(|\$\(/.test(nv) ? "" : nv;
              else if (sec === "info" && /결제방법|결제수단/.test(l)) pay = nv;
            }
            const zipM = addrRaw.match(/\[?\s*(\d{5})\s*\]?/);
            if (buyer) o.ordererName = buyer; // 마스킹 안 된 주문자명
            o.receiver = receiver;
            o.mobile = (contact.match(/01[0-9-]{7,}/) || contact.match(/[0-9][0-9-]{7,}/) || [""])[0];
            o.tel = "";
            o.zip = zipM ? zipM[1] : "";
            o.address = addrRaw.replace(/\[?\s*\d{5}\s*\]?\s*/, "").trim();
            o.request = request;
            if (pay) o.payMethod = pay;
            // 금액·배송비는 인쇄페이지가 부정확(상품합계/배송비 부풀려짐) → viewOrder 품목표가 정답.
            // viewOrder head: [_, 주문번호, 제품명, 상품가격, 수량, 할인적용, 금액, 배송비, 소계, 주문상태, 속성]
            o.items = [];
            try {
              const vhtml = await (
                await fetch("/_manage/?body=order@order_view.frm&ono=" + encodeURIComponent(o.ono), {
                  credentials: "include",
                })
              ).text();
              const vdoc = new DOMParser().parseFromString(vhtml, "text/html");
              // 입금일시 = 상태이력의 "결제완료" 처리일시(분 단위; 초는 화면에 없음). 주문시각보다 정확.
              const vtext = (vdoc.body ? vdoc.body.innerText : "").replace(/[ \t]+/g, " ");
              const payM = vtext.match(/결제완료\s+(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?)/);
              if (payM) o.paidAt = payM[1];
              const itemT = Array.from(vdoc.querySelectorAll("table")).find(
                (t) => /제품명|상품명/.test(norm(t.rows[0] && t.rows[0].innerText)) && /수량/.test(norm(t.innerText)),
              );
              if (itemT) {
                const head = Array.from(itemT.rows[0].cells).map((cc) => norm(cc.innerText));
                const ci = (n) => head.findIndex((h) => h.includes(n));
                const ni = ci("제품명") >= 0 ? ci("제품명") : ci("상품");
                const qi = ci("수량");
                const ai = ci("금액"); // 상품총액 = 수량 × 상품가격
                const fi = ci("배송비");
                for (const row of Array.from(itemT.rows).slice(1)) {
                  const cc = Array.from(row.cells);
                  if (cc.length < 9) continue; // 품목행은 11칸; 변경내역(colspan 1칸) 제외
                  // 제품명 = 가장 긴 링크(공급사/재고상세/송장 링크 제외) → 상품명만.
                  const nameCell = ni >= 0 ? cc[ni] : null;
                  const links = nameCell
                    ? Array.from(nameCell.querySelectorAll("a")).map((a) => norm(a.innerText)).filter(Boolean)
                    : [];
                  let nm = links.filter((t) => !/재고상세/.test(t)).sort((a, b) => b.length - a.length)[0] ||
                    norm(nameCell ? nameCell.innerText : "");
                  if (!nm || /합계|소계|배송비|총결제|제품명/.test(nm)) continue;
                  // 공급사/재고/택배 정보 컷 (주식회사… 현재고… [재고상세]… 택배사…)
                  nm = nm.split(/\s*(?:주식회사|\(주\)|㈜|현재고\s*[:：]|재고상세|CJ대한통운|우체국|한진택배|롯데택배|로젠택배)/)[0].trim();
                  o.items.push({
                    productName: nm,
                    qty: qi >= 0 ? num(cc[qi].innerText) : 0,
                    option: "",
                    amount: ai >= 0 ? num(cc[ai].innerText) : 0,
                    shipFee: fi >= 0 ? num(cc[fi].innerText) : 0,
                  });
                }
              }
            } catch (ve) {
              o.detailError = "viewOrder: " + String((ve && ve.message) || ve);
            }
            if (!o.items.length) o.items = [{ productName: o.productName, qty: 1, option: "", amount: 0, shipFee: 0 }];
          } catch (e) {
            o.detailError = String((e && e.message) || e);
          }
        };
        for (let i = 0; i < orders.length; i += 4) {
          await Promise.all(orders.slice(i, i + 4).map(parseDetail));
        }
      }

      return { status: "ok", orders };
    } catch (e) {
      return { status: "failed", error: String((e && e.message) || e) };
    }
  };
})();
