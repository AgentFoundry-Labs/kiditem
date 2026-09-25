// 키드키즈(partner.kidkids.net) 주문 읽기(ISOLATED world, KID-359 H3 — 옛 worker.js `scrapeKidkidsOrders` 이식).
// 사이트 `extensions/src/sites/kidkids`가 출고관리 화면(management.htm) 탭에 `page-call/bridge.js`와 함께 주입하고
// `kidkids.orders`를 부른다. 출고관리 목록(logis_index)을 헤더 기준으로 읽고, 주문번호마다 대표 od 하나로
// 발주서02(logis_down4)를 80건씩 조회해 주소·우편번호·공급단가를 붙인다. 읽기만 한다 — 옛 수집기가 planDate로 하던
// 출고예정등록(mode=ain, 실주문 상태 변경)은 웹이 보내지 않던 길이라 옮기지 않았다. 목록·발주서는 EUC-KR이다.
// ⚠️앵커 href + delivery_plan_date 필터로 읽던 예전 방식은 "출고예정일 미지정" 신규 주문을 통째로 놓쳤다 — 그래서 목록을
// 헤더 기준으로 읽어 od(CheckBox2.value)를 앵커 없이 모은다. 발주서02 = logis_down4.htm(단일 평면표: 주문×품목 1행),
// 조인 키 = 발주서02 "키코드" 열 == CheckBox2.value(od).
(function installKidkidsOrders() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});

  calls["kidkids.orders"] = async function kidkidsOrders(args) {
    const dateFilter = typeof args?.dateFilter === "string" ? args.dateFilter : "";
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const num = (s) => Number(String(s || "").replace(/[^0-9.-]/g, "")) || 0;
    const isAuthenticationGateUrl = (value) => {
      const normalized = String(value || "").toLowerCase();
      return (
        /login|partnerlogin|partner_login/.test(normalized) ||
        /\/security\/verify_user\.htm(?:[?#]|$)/.test(normalized)
      );
    };
    // 헤더 행에서 라벨을 포함하는 열 인덱스를 찾는다(고정 인덱스 대신 헤더 기준 → 컬럼 이동에 견고).
    const colFinder = (headerRow) => (label) =>
      headerRow ? [...headerRow.cells].findIndex((c) => norm(c.textContent).includes(label)) : -1;
    try {
      // 키드키즈는 로그인 직후 별도 본인확인 화면으로 이동할 수 있다. 이 화면은
      // 주문 목록이 아니므로 0건 성공으로 처리하지 않고 운영자 확인을 요청한다.
      if (isAuthenticationGateUrl(window.location.href)) {
        return { status: "login_required" };
      }
      // 1) 출고관리 목록 (page_view_cnt 크게 = 전부). management 는 partner.kidkids.net 동일 origin.
      // 목록도 euc-kr → arrayBuffer 로 받아 명시 디코딩(아니면 주문자명 한글 깨짐).
      const listRes = await fetch("/logis/logis_index.htm?from_logis_index=Y&page_view_cnt=500", { credentials: "include" });
      const finalUrl = String(listRes.url || "").toLowerCase();
      const listHtml = new TextDecoder("euc-kr").decode(await listRes.arrayBuffer());
      const ldoc = new DOMParser().parseFromString(listHtml, "text/html");
      // 미로그인이면 logis_index 요청이 로그인 페이지(partnerLogin/partner_login)로 리다이렉트되어
      // CheckBox2 행이 하나도 없다. 이걸 "주문 0건"과 구분하지 못하면 프론트가 "출고예정일 미지정"으로
      // 잘못 안내한다. 로그인 리다이렉트/비밀번호 폼을 감지해 명시적으로 로그인 필요를 신호한다.
      const firstCb = ldoc.querySelector('input[name="CheckBox2"]');
      if (!firstCb) {
        const looksLikeLogin =
          isAuthenticationGateUrl(finalUrl) ||
          Boolean(ldoc.querySelector('input[type="password"]'));
        if (looksLikeLogin) return { status: "login_required" };
        return { status: "ok", orders: [] }; // 로그인 상태의 빈 목록 = 정상 0건
      }

      // CheckBox2 가 있는 목록 테이블 + 헤더 컬럼 매핑.
      let table = firstCb;
      while (table && table.tagName !== "TABLE") table = table.parentElement;
      if (!table) return { status: "ok", orders: [] };
      const rows = [...table.rows];
      const headerRow = rows.find((r) => [...r.cells].some((c) => /상품명/.test(c.textContent)));
      const lc = colFinder(headerRow);
      const li = {
        ordName: lc("주문자명"),
        product: lc("상품명"),
        qty: lc("수량"),
        tel: lc("전화"),
        mobile: lc("휴대폰"),
        orderDate: lc("주문일"),
        orderNo: lc("주문번호"),
        planDate: lc("출고예정일"),
      };

      // 목록 행 파싱(앵커 비의존). dateFilter 주면 주문일 기준 그날만.
      const listRows = [];
      for (const cb of table.querySelectorAll('input[name="CheckBox2"]')) {
        let tr = cb;
        while (tr && tr.tagName !== "TR") tr = tr.parentElement;
        if (!tr) continue;
        const cells = [...tr.cells];
        const cell = (i) => (i >= 0 && cells[i] ? norm(cells[i].textContent) : "");
        const orderDate = cell(li.orderDate); // "2026-07-31 15:56:29"
        if (dateFilter && orderDate && !orderDate.startsWith(dateFilter)) continue;
        listRows.push({
          od: cb.value,
          orderNo: cell(li.orderNo) || cb.value, // 다품목 그룹 키(=om proxy)
          ordName: cell(li.ordName), // 주문자명(유치원) — 발주서02 "이름"보다 풀네임
          orderDate,
          listProduct: cell(li.product),
          listQty: num(cell(li.qty)),
          tel: cell(li.tel),
          mobile: cell(li.mobile),
          dpd: cb.getAttribute("delivery_plan_date") || cell(li.planDate),
        });
      }
      if (!listRows.length) {
        return { status: "ok", orders: [] }; // 필터 결과 0건 (정상)
      }

      // 3) 주문번호(om proxy) 기준 대표 od 하나씩 → 발주서02 배치 조회(mul_id 파이프).
      const byOrderNo = new Map();
      for (const r of listRows) if (!byOrderNo.has(r.orderNo)) byOrderNo.set(r.orderNo, r);
      const reps = [...byOrderNo.values()];

      // 발주서02(logis_down4) 파서: 단일 평면표. 헤더행 + (주문×품목)당 데이터행.
      const parseDown4 = (html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const t = doc.querySelector("table");
        if (!t) return [];
        const trs = [...t.rows];
        const hdr = trs.find((r) => [...r.cells].some((c) => /상품명/.test(c.textContent)));
        if (!hdr) return [];
        const hc = colFinder(hdr);
        const ci = {
          name: hc("이름"), tel: hc("전화"), mobile: hc("휴대폰"), zip: hc("우편번호"), addr: hc("주소"),
          product: hc("상품명"), option: hc("옵션"), qty: hc("수량"), unit: hc("공급단가"), sum: hc("합계"),
          msg: hc("배송요청"), key: hc("키코드"),
        };
        const out = [];
        for (const r of trs) {
          if (r === hdr) continue;
          const cells = [...r.cells];
          const get = (i) => (i >= 0 && cells[i] ? norm(cells[i].textContent) : "");
          const key = get(ci.key);
          const product = get(ci.product);
          if (!key || !product) continue;
          out.push({
            key, product, option: get(ci.option), qty: num(get(ci.qty)),
            unit: num(get(ci.unit)), sum: num(get(ci.sum)),
            zip: get(ci.zip), addr: get(ci.addr), tel: get(ci.tel), mobile: get(ci.mobile), msg: get(ci.msg),
          });
        }
        return out;
      };

      // 발주서02 는 mul_id 파이프로 여러 주문을 한 번에 반환한다. URL 길이 방어 위해 80건씩 청크.
      const down4Rows = [];
      const CHUNK = 80;
      for (let i = 0; i < reps.length; i += CHUNK) {
        const ids = reps.slice(i, i + CHUNK).map((r) => r.od);
        try {
          const body = new URLSearchParams();
          body.set("from_logis_index", "Y");
          body.set("mul_id", "|" + ids.join("|"));
          body.set("mode", "xls_down");
          const res = await fetch("/logis/logis_down4.htm", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: body.toString(),
          });
          const html = new TextDecoder("euc-kr").decode(await res.arrayBuffer()); // 발주서 = euc-kr
          down4Rows.push(...parseDown4(html));
        } catch {
          /* 청크 실패 — 스킵 */
        }
      }

      // 4) 키코드(od) 기준으로 발주서02 행을 묶고, 목록과 조인.
      const itemsByKey = new Map();
      const seenByKey = new Map(); // 다품목 om 확장으로 인한 동일 품목 중복 방지
      const recvByKey = new Map();
      for (const row of down4Rows) {
        if (!itemsByKey.has(row.key)) {
          itemsByKey.set(row.key, []);
          seenByKey.set(row.key, new Set());
        }
        const dedupeKey = [row.product, row.option, row.qty, row.unit].join("|");
        const seen = seenByKey.get(row.key);
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          itemsByKey.get(row.key).push(row);
        }
        if (!recvByKey.has(row.key)) recvByKey.set(row.key, row);
      }

      const orders = [];
      for (const rep of reps) {
        const rows4 = itemsByKey.get(rep.od) || [];
        const recv = recvByKey.get(rep.od);
        // 발주서02 상품명은 끝에 "[수량]"을 붙인다(예: "...(1BOX/12개)[3]"). 셀피아 상품명·매칭에는
        // 이 꼬리표가 없어야 하므로, 그 품목의 수량과 정확히 일치하는 끝 대괄호만 떼어낸다
        // (정품명에 든 대괄호나 "[키드아이템]" 접두는 보존).
        const stripQtyTag = (nameStr, qty) =>
          String(nameStr || "").replace(new RegExp("\\[\\s*" + qty + "\\s*\\]\\s*$"), "").trim();
        // 발주서02 가 비면(예외) 목록 정보라도 채워 누락을 막는다(가격은 0).
        const items = rows4.length
          ? rows4.map((it) => {
              const base = stripQtyTag(it.product, it.qty);
              return {
                name: it.option ? `${base} ${it.option}`.trim() : base,
                qty: it.qty,
                unit: it.unit,
                sum: it.sum,
              };
            })
          : rep.listProduct
            ? [{ name: rep.listProduct, qty: rep.listQty, unit: 0, sum: 0 }]
            : [];
        if (!items.length) continue;
        const zip = recv ? recv.zip : "";
        const addr = recv ? recv.addr : "";
        orders.push({
          om: rep.orderNo,
          // 셀피아 양식의 "이름"은 발주서02 "이름"(짧은 기관명, 예: 풍산초)을 쓴다. 목록 주문자명
          // (풍산초 병설유치원)이 아니다. 발주서02 이름이 없을 때만 목록 주문자명으로 보완한다.
          ordName: (recv && recv.name) || rep.ordName,
          orderDate: rep.orderDate,
          recvName: (recv && recv.name) || rep.ordName,
          recvAddr: [zip, addr].filter(Boolean).join(" "), // 변환기가 "우편번호 주소" 접두로 zip 분리
          recvTel: (recv && recv.tel) || rep.tel,
          recvMobile: (recv && recv.mobile) || rep.mobile,
          recvMsg: recv ? recv.msg : "",
          items,
        });
      }
      return { status: "ok", orders };
    } catch (e) {
      return { status: "failed", error: String((e && e.message) || e) };
    }
  };
})();
