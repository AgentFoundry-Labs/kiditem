// 해법몰(제니마켓 mallseller) 주문 읽기(ISOLATED world, KID-380 — 옛 worker.js `scrapeHaebeopOrders` 이식).
// 사이트 `extensions/src/sites/haebub-mall`이 주문건수목록(basket_list.php) 탭에 `page-call/bridge.js`와 함께 주입하고
// `haebub-mall.orders`를 부른다. ⭐엑셀 다운로드(basket_excel.php)는 암호 ZIP 이라 쓰지 않고, 결제완료(OY) 목록을 보이는
// 쪽까지 모두 읽은 뒤 주문마다 상세 팝업(pop_order_info.php, 4개씩)의 상품행을 셀피아 한 행씩으로 펼친다. 읽기만 한다 —
// 목록 검색은 POST지만 조회다. 검색 조건: search_ord_status=OY(결제완료), search_mall_name=협력사(우리 공급사명, 사이트 상수).
// ⚠️search_shop_name 은 "고객사"라 협력사명을 넣으면 0건이 된다.
(function installHaebubMallOrders() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});

  calls["haebub-mall.orders"] = async function haebubMallOrders(options) {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const num = (s) => Number(String(s || "").replace(/[^0-9.-]/g, "")) || 0;
    try {
      if (/login/i.test(location.href) || document.querySelector('input[type="password"]')) {
        return { status: "login_required" };
      }
      const vendor = options?.vendor || "";
      // 발주일 범위: fromDate~toDate, 없으면 date 하루, 그것도 없으면 오늘.
      const today = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();
      const from = options?.fromDate || options?.date || today;
      const to = options?.toDate || options?.date || today;

      // 1) 목록 검색 (결제완료 = OY). 페이지 링크가 있는 만큼 모두 읽어야 주문을 조용히 누락하지 않는다.
      const listRows = [];
      const queuedPages = [1];
      const fetchedPages = new Set();
      const MAX_LIST_PAGES = 100;
      while (queuedPages.length) {
        const page = queuedPages.shift();
        if (!page || fetchedPages.has(page)) continue;
        if (fetchedPages.size >= MAX_LIST_PAGES) {
          return { status: "failed", error: "해법몰 목록 페이지가 100페이지를 초과했습니다. 조회 조건을 좁혀 다시 시도하세요." };
        }
        fetchedPages.add(page);
        const body = new URLSearchParams();
        body.set("search_on", "ture");         // 사이트 원본 오타 그대로 보내야 검색이 걸린다
        body.set("page", String(page));
        body.set("s_status", "");
        body.set("search_ord_status", "OY");   // 결제완료
        body.set("str_date", from);
        body.set("end_date", to);
        body.set("search_shop_name", "");      // 고객사(비움)
        body.set("search_mall_name", vendor);  // 협력사
        body.set("searchopt", "prdcode");
        body.set("searchkey", "");
        body.set("s_member_grp", "");
        body.set("search_orderid", "");
        const listRes = await fetch("/mall/order/basket_list.php", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });
        if (!listRes.ok) return { status: "failed", error: "해법몰 목록 조회 실패 (페이지 " + page + ", HTTP " + listRes.status + ")" };
        const listHtml = new TextDecoder("utf-8").decode(await listRes.arrayBuffer());
        if (/login|로그인/i.test(String(listRes.url || ""))) return { status: "login_required" };
        const ldoc = new DOMParser().parseFromString(listHtml, "text/html");
        if (ldoc.querySelector('input[type="password"]')) return { status: "login_required" };

        // 목록 행: 선택 체크박스(select_checkbox)를 가진 tr.
        // ⚠️hidden orderid/idx 는 행 단위로 격리돼 있지 않다(중첩 테이블 하나에 전 행의 hidden 이 모여 있어
        // tr.querySelector 로는 잡히지 않는다). 그래서 주문번호는 목록 셀에서 읽는다.
        // 셀 구성: [선택][주문날짜][주문번호][주문자명][그룹][상품명][주문방법][은행/입금자][기능]
        for (const cb of ldoc.querySelectorAll('input[name="select_checkbox"]')) {
          let tr = cb;
          while (tr && tr.tagName !== "TR") tr = tr.parentElement;
          if (!tr) continue;
          const c = [...tr.cells].map((td) => norm(td.textContent));
          const orderid = (c[2] || "").replace(/[^0-9]/g, "");
          if (!orderid) continue;
          listRows.push({
            orderid,
            orderDate: c[1] || "",   // 2026-07-31 19:54:20
            ordName: c[3] || "",     // 주문자명
            group: c[4] || "",       // 그룹(일반 등)
            listProduct: c[5] || "",
            payMethod: c[6] || "",   // 주문방법 ("신 + 포") — 셀피아 양식의 결제방법 표기와 같다
          });
        }
        for (const link of ldoc.querySelectorAll('a[href]')) {
          const href = link.getAttribute('href') || '';
          const nextPage = Number(new URL(href, location.href).searchParams.get('page'));
          if (Number.isInteger(nextPage) && nextPage > 0 && !fetchedPages.has(nextPage)) {
            queuedPages.push(nextPage);
          }
        }
      }
      // 결제완료 신규 없음(정상). 그날을 다 봤다는 확인(기간)은 서버가 수집일로 적는다.
      if (!listRows.length) return { status: "ok", orders: [] };

      // 2) 주문 상세 파서 — 한 orderid 안에 여러 상품(basket)이 올 수 있다.
      const parseDetail = (html) => {
        const d = new DOMParser().parseFromString(html, "text/html");
        const val = (n) => { const e = d.querySelector(`[name="${n}"]`); return e ? norm(e.value) : ""; };
        // 상품행: select_basket_no 체크박스가 있는 tr = [_, 업체명, _, 상품명, 수량, 판매단가, 금액, 운송장, 상태, ...]
        const items = [];
        for (const cb of d.querySelectorAll('input[name="select_basket_no"]')) {
          let tr = cb;
          while (tr && tr.tagName !== "TR") tr = tr.parentElement;
          if (!tr) continue;
          const c = [...tr.cells].map((x) => norm(x.textContent));
          items.push({
            basket: norm(cb.value), vendor: c[1] || "", name: c[3] || "",
            qty: num(c[4]), unit: num(c[5]), sum: num(c[6]),
            invoice: c[7] === "-" ? "" : (c[7] || ""), status: c[8] || "",
          });
        }
        // 결제방법: 라벨 셀 다음 셀
        let payMethod = "";
        for (const tr of d.querySelectorAll("tr")) {
          const c = [...tr.cells];
          for (let i = 0; i + 1 < c.length; i += 1) {
            if (norm(c[i].textContent) === "결제방법" && !payMethod) payMethod = norm(c[i + 1].textContent);
          }
        }
        // 배송비 = 총결제금액 - 상품금액 합계 (상세에 배송비 단독 필드가 없다)
        const total = num(val("total_price"));
        const itemsSum = items.reduce((s, it) => s + it.sum, 0);
        const shipFee = Math.max(0, total - itemsSum);
        return {
          items, payMethod, total, shipFee,
          prdcode: val("prdcode"),
          sendId: val("send_id"), sendName: val("send_name"), sendEmail: val("send_email"),
          sendTel: val("send_tphone"), sendMobile: val("send_hphone"),
          sendPost: val("send_post"), sendAddr: val("send_address"),
          recvName: val("rece_name"), recvEmail: val("rece_email"),
          recvTel: val("rece_tphone"), recvMobile: val("rece_hphone"),
          recvPost: val("rece_post"), recvAddr: val("rece_address"),
          demand: val("demand"), memo: val("descript"),
        };
      };

      // 3) orderid 별로 한 번만 상세를 받는다(같은 주문의 여러 상품이 목록에 각각 행으로 나온다).
      const detailByOrder = new Map();
      const detailFailures = new Map();
      const orderIds = [...new Set(listRows.map((r) => r.orderid))];
      const CONCURRENCY = 4;
      for (let i = 0; i < orderIds.length; i += CONCURRENCY) {
        await Promise.all(orderIds.slice(i, i + CONCURRENCY).map(async (oid) => {
          try {
            const res = await fetch("/mall/order/pop_order_info.php?orderid=" + encodeURIComponent(oid), {
              credentials: "include",
            });
            if (!res.ok) {
              detailFailures.set(oid, "HTTP " + res.status);
              return;
            }
            const html = new TextDecoder("utf-8").decode(await res.arrayBuffer());
            detailByOrder.set(oid, parseDetail(html));
          } catch (error) {
            detailFailures.set(oid, String((error && error.message) || error || "네트워크 오류"));
          }
        }));
      }
      if (detailFailures.size) {
        const failures = orderIds
          .filter((oid) => detailFailures.has(oid))
          .map((oid) => oid + " (" + detailFailures.get(oid) + ")");
        return { status: "failed", error: "해법몰 주문 상세 조회 실패: " + failures.join(", ") };
      }

      // 4) 주문 단위로 펼친다. 목록은 "어떤 주문이 결제완료인가"만 알려주고, 상품·금액·주소는 상세에서 온다.
      //    상세 상품행(basket)이 곧 셀피아 한 행이며 등록번호가 된다. 한 주문에 여러 상품이면 여러 행.
      //    같은 주문이 목록에 여러 번 나와도 상세는 한 번만 펼친다.
      const orders = [];
      const expanded = new Set();
      for (const r of listRows) {
        if (expanded.has(r.orderid)) continue;
        expanded.add(r.orderid);
        const d = detailByOrder.get(r.orderid);
        if (!d) return { status: "failed", error: "해법몰 주문 상세 조회 실패: " + r.orderid };
        // 결제완료 상태의 상품행만(목록 검색 조건과 같은 의미). 상태를 못 읽으면 전부 포함한다.
        const paid = d.items.filter((it) => !it.status || it.status.includes("결제완료"));
        const targets = paid.length ? paid : d.items;
        targets.forEach((item, i) => {
          orders.push({
            orderNo: r.orderid,
            regNo: item.basket,                 // 등록번호 = 장바구니 번호
            vendor: item.vendor || vendor,
            productName: item.name,
            productCode: d.prdcode,
            option: "",
            qty: item.qty,
            sellPrice: item.unit,
            sellAmount: item.sum,
            shipFee: i === 0 ? d.shipFee : 0,   // 배송비는 주문당 1회(첫 상품행)
            payMethod: r.payMethod || d.payMethod,
            orderDate: r.orderDate,
            invoice: item.invoice,
            ordName: d.sendName || r.ordName,
            group: r.group,
            ordId: d.sendId,
            ordEmail: d.sendEmail,
            ordTel: d.sendTel,
            ordMobile: d.sendMobile,
            ordPost: d.sendPost,
            ordAddr: d.sendAddr,
            recvName: d.recvName,
            recvTel: d.recvTel,
            recvMobile: d.recvMobile,
            recvPost: d.recvPost,
            recvAddr: d.recvAddr,
            demand: d.demand,
            memo: d.memo,
            status: item.status || "결제완료",
          });
        });
      }
      return { status: "ok", orders };
    } catch (e) {
      return { status: "failed", error: String((e && e.message) || e) };
    }
  };
})();
