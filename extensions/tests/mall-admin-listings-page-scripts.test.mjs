import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";


// 1차 몰 넷(키드키즈 · 아이스크림몰 · 아트공구 · 도매꾹)의 몰 관리자 목록 읽기(KID-363 L2). 옛 `mall-admin-listings.js`
// 읽기기 본문을 `content/orders/<mall>-listings.js` 처리기 파일로 옮겼다 — 옛 스위트의 녹화 픽스처를 그대로 쓰되, 읽기기를
// 처리기 파일에서 꺼내 부른다(사이트 `sites/<mall>/listings.ts`가 페이지 호출로 부르는 그 호출 이름).

const attemptId = "11111111-1111-4111-8111-111111111111";
const token = "22222222-2222-4222-8222-222222222222";
const ACCOUNT = "33333333-3333-4333-8333-333333333333";
const KIDKIDS = "https://partner.kidkids.net";
const ICECREAM = "https://po.i-screammall.co.kr";
const { DOMParser } = new JSDOM("").window;

const kidkidsPlan = {
  sourceType: "mall_admin_listings",
  parserVersion: "mall-admin-listings-v1",
  mallKey: "kidkids",
  channelAccountId: ACCOUNT,
  sourceOrigin: KIDKIDS,
  pageSize: 20000,
};
const icecreamPlan = {
  ...kidkidsPlan,
  mallKey: "icecream-mall",
  sourceOrigin: ICECREAM,
  pageSize: 10000,
};

function pageFileReader(file, call, pageContext) {
  vm.runInContext(readFileSync(new URL(file, import.meta.url), "utf8"), pageContext);
  return (plan) => pageContext.__kiditemIsolatedPageCalls[call]({ plan });
}

// 키드키즈 상품리스트 다운로드 한 줄 — 엑셀(HTML 표)이라 품절여부 한 칸이 상태를 담는다.
function downloadRow({ code, name, invoice = "", price = "1,900", sold = "정상", seller = "" }) {
  return `<tr>
    <td>거영아이앤디</td><td>${code}</td><td>${seller}</td><td>${sold}</td><td>과세</td>
    <td>선물/행사</td><td>완구선물</td><td>액체괴물</td>
    <td>${name}</td><td>${invoice}</td><td></td><td></td>
    <td>1520</td><td>${price}</td><td>3000</td><td>59</td>
    <td></td><td></td><td></td><td></td><td></td><td></td>
  </tr>`;
}

function downloadTable(rows) {
  const heads = ["공급사명", "상품코드", "P 코드", "품절여부", "TAX", "대카테고리", "중카테고리",
    "소카테고리", "상품명", "송장용 상품명", "옵션", "천안로케이션", "공급가", "판매가", "소비자가",
    "조회수", "구입처", "바코드", "KC인증번호", "KC사용연령", "KC주의사항", "키워드"];
  return `<html><body><table>
    <tr>${heads.map((head) => `<th>${head}</th>`).join("")}</tr>
    ${rows.map(downloadRow).join("")}
  </table></body></html>`;
}

// 목록 화면 — 전체 건수와 상품리스트 다운로드 링크만 있으면 된다.
function listPage(total, { downloadHref = "glist_dn.htm?WHERE=+a.goods_code+is+not+null+AND+a.company_id%3D4817+&s_kind=" } = {}) {
  return `<html><body>
    <span style="font-size:13px;"> ( <strong class="font-semibold">1</strong>/87, 수량 : ${total.toLocaleString("en-US")}개 )</span>
    <a href="${downloadHref}">상품리스트 다운받기</a>
    <a href="glist_dn_wb.htm?WHERE=x">상품리스트(WB등록용) 다운받기</a>
    <a href="glist_dn_op.htm?WHERE=x">상품리스트(옵션포함) 다운받기</a>
  </body></html>`;
}

function htmlResponse(url, html) {
  return {
    url,
    ok: true,
    status: 200,
    async arrayBuffer() {
      return new TextEncoder().encode(html).buffer;
    },
    async text() {
      return html;
    },
  };
}

async function runKidkids({ serve, origin = KIDKIDS }) {
  const requests = [];
  const decoders = [];
  const pageContext = vm.createContext({
    AbortController,
    URL,
    URLSearchParams,
    DOMParser,
    // 키드키즈는 EUC-KR 이다 — 읽기기가 그 이름으로 풀어야 한다. 시험 응답은 UTF-8 바이트다.
    TextDecoder: class {
      constructor(label) {
        decoders.push(label);
      }
      decode(buffer) {
        return new TextDecoder("utf-8").decode(buffer);
      }
    },
    setTimeout: (callback) => setTimeout(callback, 0),
    clearTimeout,
    location: new URL(`${origin}/sales/goods_list_renewal.htm`),
    fetch: async (path, init) => {
      const url = new URL(path, KIDKIDS);
      requests.push({ path: `${url.pathname}${url.search}`, credentials: init.credentials });
      const kind = /glist_dn\.htm/.test(url.pathname) ? "download" : "list";
      const response = serve({ kind, url });
      return response && response.url ? response : htmlResponse(url.href, response);
    },
  });
  const reader = pageFileReader("../kiditem-os/content/orders/kidkids-listings.js", "kidkids.listings", pageContext);
  const result = await reader(structuredClone(kidkidsPlan), 1000, 0, 3);
  return { result: JSON.parse(JSON.stringify(result)), requests, decoders };
}

function downloadRows(count, offset = 1) {
  return Array.from({ length: count }, (_, index) => ({
    code: String(1000000 + offset + index),
    name: `[키드아이템] 상품 ${offset + index} 1p`,
    invoice: `${offset + index}000상품`,
  }));
}
test("키드키즈 — 상품리스트 다운로드로 전체를 한 번에 읽고, 품절여부를 상태로, 고른 칸만 넘긴다", async () => {
  const rows = [
    { code: "1098464", name: "[키드아이템] 왁스팝 말랑이 1p 왁뿌", invoice: "3000왁스팝 말랑이", price: "1,900", sold: "정상" },
    { code: "1078807", name: "[키드아이템] 푸푸 급식용 식판", invoice: "푸푸급식용식판", sold: "일시품절" },
    { code: "1038722", name: "5000방울(킬라)_16mm", invoice: "", sold: "보류" },
    { code: "889504", name: "옛 상품", invoice: "", sold: "영구품절" },
    // 등록할 때 셀피아 코드를 심어 둔 상품.
    { code: "1119098", name: "[키드아이템] 도넛츠 왁스팝 1p", invoice: "3500도넛츠왁스팝말랑이", seller: "10454-1" },
  ];
  const { result, requests, decoders } = await runKidkids({
    serve: ({ kind }) => (kind === "list" ? listPage(5) : downloadTable(rows)),
  });
  assert.equal(result.success, true, JSON.stringify(result));
  assert.deepEqual(result.snapshot.collection, {
    totalRecords: 5,
    recordsRead: 5,
    pagesRead: 1,
    totalPages: 1,
    detailsRead: 0,
    detailsMissing: 0,
  });
  assert.deepEqual(result.snapshot.proof, { mallKey: "kidkids", pageSize: 20000, validatedList: true });
  const byCode = new Map(result.snapshot.rows.map((row) => [row.mallProductCode, row]));
  assert.deepEqual(byCode.get("1098464"), {
    mallProductCode: "1098464",
    productName: "[키드아이템] 왁스팝 말랑이 1p 왁뿌",
    sellpiaName: "3000왁스팝 말랑이",
    sellerCode: null,
    salePrice: 1900,
    statusWords: ["정상"],
    registeredOn: null,
  });
  assert.deepEqual(byCode.get("1078807").statusWords, ["일시품절"]);
  assert.deepEqual(byCode.get("1038722").statusWords, ["보류"]);
  assert.equal(byCode.get("1038722").sellpiaName, null);
  assert.deepEqual(byCode.get("889504").statusWords, ["영구품절"]);
  // ⭐ 자체코드 칸에 심어 둔 셀피아 코드를 그대로 읽어 온다.
  assert.equal(byCode.get("1119098").sellerCode, "10454-1");
  assert.equal(byCode.get("1098464").sellerCode, null);
  // 공급가 · 소비자가 · 공급사는 넘기지 않는다.
  assert.equal(JSON.stringify(result).includes("거영아이앤디"), false);
  assert.equal(JSON.stringify(result).includes("1520"), false);

  assert.ok(decoders.every((label) => label === "euc-kr"));
  assert.ok(requests.every((request) => request.credentials === "include"));
  assert.deepEqual(requests.map((request) => request.path), [
    "/sales/goods_list_renewal.htm?pNum=1",
    // 몰이 만든 다운로드 링크를 그대로 다시 부른다(옵션포함 · WB 아님).
    "/sales/glist_dn.htm?WHERE=+a.goods_code+is+not+null+AND+a.company_id%3D4817+&s_kind=",
  ]);
});

test("키드키즈 — 빈 목록은 한 번 읽은 것이다", async () => {
  const { result } = await runKidkids({
    serve: ({ kind }) => (kind === "list" ? listPage(0) : downloadTable([])),
  });
  assert.equal(result.success, true);
  assert.deepEqual(result.snapshot.rows, []);
  assert.equal(result.snapshot.collection.totalRecords, 0);
});

test("키드키즈 — 다운로드가 목록 건수를 다 담지 못하면 저장하지 않는다", async () => {
  const short = await runKidkids({
    serve: ({ kind }) => (kind === "list" ? listPage(42) : downloadTable(downloadRows(40))),
  });
  assert.deepEqual(
    { errorCode: short.result.errorCode, stage: short.result.stage },
    { errorCode: "mall_contract_drift", stage: "row_count" },
  );

  const dup = await runKidkids({
    serve: ({ kind }) => (kind === "list" ? listPage(2) : downloadTable([
      { code: "1", name: "상품", invoice: "" },
      { code: "1", name: "상품", invoice: "" },
    ])),
  });
  assert.deepEqual(
    { errorCode: dup.result.errorCode, stage: dup.result.stage },
    { errorCode: "mall_contract_drift", stage: "duplicate" },
  );

  const noCounter = await runKidkids({ serve: () => "<html><body>점검 중</body></html>" });
  assert.deepEqual(
    { errorCode: noCounter.result.errorCode, stage: noCounter.result.stage },
    { errorCode: "mall_contract_drift", stage: "counter" },
  );

  const noLink = await runKidkids({
    serve: ({ kind }) => (kind === "list" ? '<html><body><span> ( <strong>1</strong>/1, 수량 : 1개 )</span></body></html>' : downloadTable([])),
  });
  assert.deepEqual(
    { errorCode: noLink.result.errorCode, stage: noLink.result.stage },
    { errorCode: "mall_contract_drift", stage: "download_link" },
  );
});

test("키드키즈 — 다른 서버를 가리키는 다운로드 링크는 따르지 않는다", async () => {
  const evil = await runKidkids({
    serve: ({ kind }) => (kind === "list"
      ? listPage(1, { downloadHref: "https://evil.example/glist_dn.htm?WHERE=x" })
      : downloadTable([{ code: "1", name: "상품", invoice: "" }])),
  });
  assert.deepEqual(
    { errorCode: evil.result.errorCode, stage: evil.result.stage },
    { errorCode: "mall_contract_drift", stage: "download_url" },
  );
});

test("키드키즈 — 로그인 화면으로 넘어가면 로그인이 필요하다고 답한다", async () => {
  const redirected = await runKidkids({
    serve: () => htmlResponse(`${KIDKIDS}/partnerLogin.htm`, "<html><body>로그인</body></html>"),
  });
  assert.equal(redirected.result.errorCode, "mall_login_required");
  const form = await runKidkids({
    serve: () => '<html><body><input type="password" name="pw"></body></html>',
  });
  assert.equal(form.result.errorCode, "mall_login_required");
  const foreign = await runKidkids({ serve: () => "", origin: "https://www.kidkids.net" });
  assert.equal(foreign.result.errorCode, "mall_login_required");
});

function icecreamItem(goodsNo, overrides = {}) {
  return {
    goodsNo,
    goodsNm: `상품 ${goodsNo} 1p`,
    saleStatCd: "10",
    saleStatNm: "판매중",
    dispYn: "Y",
    salePrc: 1950,
    supPcost: 1463,
    aprvDt: "2025-12-08",
    sysRegDtm: "2025-11-26 13:46:47",
    entrNm: "주식회사 거영I&D",
    sysRegId: "1482o1",
    ...overrides,
  };
}

function noticeHtml(name) {
  const notices = [
    { goodsNotiLisartCd: "023", goodsNotiItemCd: "028", notiItemCmt: "14세 이상" },
    ...(name === undefined ? [] : [{ goodsNotiLisartCd: "023", goodsNotiItemCd: "174", notiItemCmt: name }]),
  ];
  return `<html><body><div id="announcementInfo"></div><script>var goodsNotiList = ${JSON.stringify(notices)};</script></body></html>`;
}

class FakeFormData {
  constructor(form) {
    this.entries = form.entries;
  }
  [Symbol.iterator]() {
    return this.entries[Symbol.iterator]();
  }
}

async function runIcecream({ list, views = {}, origin = ICECREAM, form = true }) {
  const requests = [];
  const searchForm = {
    entries: [
      ["csSignature", "signed-value"],
      ["goodsStartDtm", "2026-09-03"],
      ["entrNo", "1482"],
      ["goodsNoOption", "mt"],
    ],
  };
  const pageContext = vm.createContext({
    AbortController,
    URL,
    URLSearchParams,
    JSON,
    FormData: FakeFormData,
    setTimeout: (callback) => setTimeout(callback, 0),
    clearTimeout,
    location: new URL(`${origin}/goods/goodsMgmt.goodsMgmtView.do`),
    document: {
      getElementById: (id) => (form && id === "goodsInfoGridForm" ? searchForm : null),
      querySelector: () => null,
    },
    fetch: async (path, init) => {
      const url = new URL(path, ICECREAM);
      requests.push({ url, headers: init.headers, credentials: init.credentials });
      if (url.pathname === "/goods/goodsMgmt.getGoodsList.do") {
        const body = list(Number(url.searchParams.get("pageIdx")), url);
        return typeof body === "string"
          ? htmlResponse(url.href, body)
          : htmlResponse(url.href, JSON.stringify(body));
      }
      const view = views[url.searchParams.get("goodsNo")];
      if (view instanceof Error) throw view;
      if (view && typeof view === "object") return view;
      return htmlResponse(url.href, view ?? noticeHtml(undefined));
    },
  });
  const reader = pageFileReader("../kiditem-os/content/orders/icecream-listings.js", "icecream-mall.listings", pageContext);
  const result = await reader(structuredClone(icecreamPlan), 1000, 0, 3);
  return { result: JSON.parse(JSON.stringify(result)), requests };
}

test("아이스크림몰 — 검색 폼 그대로 기간 없이 목록을 읽고, 상세 고시에서 셀피아 이름을 읽는다", async () => {
  const { result, requests } = await runIcecream({
    list: () => ({
      totalCount: 3,
      payloads: [
        icecreamItem("11218365", { goodsNm: "피규어 슈팅 낙하산 1p 낙하산 놀이", entrGoodsNo: "10292-1" }),
        icecreamItem("889504", { saleStatCd: "40", saleStatNm: "판매종료", dispYn: "N", aprvDt: null }),
        icecreamItem("985846", { dispYn: "N" }),
      ],
    }),
    views: {
      11218365: noticeHtml("3000피규어슈팅낙하산"),
      889504: new Error("socket hang up"),
      985846: noticeHtml("[kiditem] 깜찍이동물조립지우개"),
    },
  });
  assert.equal(result.success, true, JSON.stringify(result));
  assert.deepEqual(result.snapshot.collection, {
    totalRecords: 3,
    recordsRead: 3,
    pagesRead: 1,
    totalPages: 1,
    detailsRead: 2,
    detailsMissing: 1,
  });
  assert.deepEqual(result.snapshot.rows, [
    {
      mallProductCode: "11218365",
      productName: "피규어 슈팅 낙하산 1p 낙하산 놀이",
      sellpiaName: "3000피규어슈팅낙하산",
      sellerCode: "10292-1",
      salePrice: 1950,
      statusWords: ["판매중", "전시"],
      registeredOn: "2025-12-08",
    },
    {
      mallProductCode: "889504",
      productName: "상품 889504 1p",
      sellpiaName: null,
      sellerCode: null,
      salePrice: 1950,
      statusWords: ["판매종료", "전시안함"],
      registeredOn: "2025-11-26",
    },
    {
      mallProductCode: "985846",
      productName: "상품 985846 1p",
      sellpiaName: "[kiditem] 깜찍이동물조립지우개",
      sellerCode: null,
      salePrice: 1950,
      statusWords: ["판매중", "전시안함"],
      registeredOn: "2025-12-08",
    },
  ]);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("signed-value"), false);
  assert.equal(serialized.includes("1482o1"), false);
  assert.equal(serialized.includes("거영"), false);

  const [listRequest, ...viewRequests] = requests;
  assert.equal(listRequest.url.pathname, "/goods/goodsMgmt.getGoodsList.do");
  assert.deepEqual([...listRequest.url.searchParams.keys()], [
    "goodsStartDtm",
    "goodsEndDtm",
    "goodsDtmIgnoreOption",
    "csSignature",
    "goodsStartDtm",
    "entrNo",
    "goodsNoOption",
    "rowsPerPage",
    "pageIdx",
  ]);
  assert.equal(listRequest.url.searchParams.get("goodsDtmIgnoreOption"), "check");
  assert.equal(listRequest.url.searchParams.get("rowsPerPage"), "10000");
  assert.equal(listRequest.headers.Accept, "application/json");
  assert.deepEqual(
    viewRequests.map((request) => `${request.url.pathname}?${request.url.searchParams}`).sort(),
    [
      "/goods/goodsCommon.goodsView.do?type=R&goodsNo=11218365",
      "/goods/goodsCommon.goodsView.do?type=R&goodsNo=889504",
      "/goods/goodsCommon.goodsView.do?type=R&goodsNo=985846",
    ],
  );
  assert.ok(requests.every((request) => request.credentials === "include"));
});

test("아이스크림몰 — 쪽이 여럿이면 끝까지 읽고, 읽는 사이 전체 수가 바뀌면 멈춘다", async () => {
  const items = Array.from({ length: 10001 }, (_, index) => icecreamItem(String(20000000 + index)));
  const paged = await runIcecream({
    list: (pageIdx) => ({ totalCount: 10001, payloads: pageIdx === 1 ? items.slice(0, 10000) : items.slice(10000) }),
  });
  assert.equal(paged.result.success, true);
  assert.deepEqual(
    [paged.result.snapshot.collection.pagesRead, paged.result.snapshot.collection.detailsRead],
    [2, 10001],
  );

  const moved = await runIcecream({
    list: (pageIdx) => ({ totalCount: pageIdx === 1 ? 10001 : 10002, payloads: pageIdx === 1 ? items.slice(0, 10000) : items.slice(10000) }),
  });
  assert.equal(moved.result.errorCode, "mall_total_changed");
});

test("아이스크림몰 — 로그인이 풀렸거나 목록 형식이 바뀌면 멈춘다", async () => {
  const noForm = await runIcecream({ list: () => ({ totalCount: 0, payloads: [] }), form: false });
  assert.deepEqual(
    { errorCode: noForm.result.errorCode, stage: noForm.result.stage },
    { errorCode: "mall_contract_drift", stage: "search_form" },
  );
  const loginPage = await runIcecream({ list: () => '<html><input type="password" name="pwd"></html>' });
  assert.equal(loginPage.result.errorCode, "mall_login_required");
  const detailLogin = await runIcecream({
    list: () => ({ totalCount: 1, payloads: [icecreamItem("1")] }),
    views: { 1: htmlResponse(`${ICECREAM}/login/loginView.do`, "<html></html>") },
  });
  assert.equal(detailLogin.result.errorCode, "mall_login_required");
  const refused = await runIcecream({ list: () => ({ succeeded: false, message: "권한이 없습니다." }) });
  assert.deepEqual(
    { errorCode: refused.result.errorCode, stage: refused.result.stage },
    { errorCode: "mall_contract_drift", stage: "succeeded" },
  );
  const unknownDisplay = await runIcecream({
    list: () => ({ totalCount: 1, payloads: [icecreamItem("1", { dispYn: "X" })] }),
  });
  assert.deepEqual(
    { errorCode: unknownDisplay.result.errorCode, stage: unknownDisplay.result.stage },
    { errorCode: "mall_contract_drift", stage: "display" },
  );
  const foreign = await runIcecream({ list: () => ({}), origin: "https://www.i-screammall.co.kr" });
  assert.equal(foreign.result.errorCode, "mall_login_required");
});
// 아트공구(카페24 공급사 관리자) — 상품목록(ProductManage)을 100개씩 1쪽부터 끝까지 읽는다(라이브 2026-09-19: 550개 = 6쪽).
const ART09 = "https://zzogzzog1.cafe24.com";
const art09Plan = { ...kidkidsPlan, mallKey: "art09", sourceOrigin: ART09, pageSize: 100 };

function cafe24Product(index, overrides = {}) {
  return { no: String(123000 + index), name: `[펜시네${index}] 상품 ${index} 1p`, price: "9,490", display: "T", selling: "T", ...overrides };
}

function cafe24Page(total, products) {
  const row = (product) => `<tr>
    <td><input type="checkbox" class="rowChk _product_no" value="${product.no}" is_display="${product.display}" is_selling="${product.selling}" is_funding_product="F" is_set_product="F" data-option-type="T"></td>
    <td>1</td><td>기본상품</td><td>P000${product.no}</td>
    <td><div class="gGoods gMedium"><div class="mOpen"><span class="frame eOpenOver"><img src="//zzogzzog1.cafe24.com/web/product/tiny/202608/${product.no}.jpg"></span>
      <div class="open"><ul class="default"><li><a href="#none" class="eProductDetail" product_no="${product.no}">상품 상세보기</a></li></ul></div></div>
      <p><a href="/disp/admin/shop1/product/ProductRegister?product_no=${product.no}" class="txtLink eProductDetail ec-product-list-productname">${product.name}</a></p></div></td>
    <td></td><td>${product.price}</td><td>${product.price}</td><td>${product.price}</td><td>SMS발송 SNS공유 주소복사</td>
  </tr>`;
  return `<html><body><form id="eProductSearchForm"></form>
    <div class="mState"><p class="total">[총 <strong>${total}</strong>개]</p></div>
    <table><thead><tr><th></th><th>No</th><th>상품구분</th><th>상품코드</th><th>상품명</th><th>마켓연동</th><th>판매가</th><th>할인가</th><th>모바일할인가</th><th>바로구매 URL</th></tr></thead>
    <tbody>${products.map(row).join("")}</tbody></table></body></html>`;
}

async function runArt09Reader({ products, serve = null } = {}) {
  const requests = [];
  const pageContext = vm.createContext({
    Date, Map, Set, URL, URLSearchParams, JSON, Number, Array, String, Math,
    AbortController,
    DOMParser,
    setTimeout: (callback) => setTimeout(callback, 0),
    clearTimeout,
    location: new URL(`${ART09}/disp/admin/shop1/product/ProductManage`),
    fetch: async (path, init) => {
      const url = new URL(path, ART09);
      requests.push({ page: Number(url.searchParams.get("page")), limit: url.searchParams.get("limit"), orderby: url.searchParams.get("orderby"), credentials: init.credentials });
      const page = Number(url.searchParams.get("page"));
      const html = serve ? serve(page) : cafe24Page(products.length, products.slice((page - 1) * 100, page * 100));
      if (html && html.landed) return { url: html.landed, ok: true, status: 200, text: async () => "<html><body>로그인</body></html>" };
      return { url: url.href, ok: true, status: 200, text: async () => html };
    },
  });
  const reader = pageFileReader("../kiditem-os/content/orders/art09-listings.js", "art09.listings", pageContext);
  const result = await reader(structuredClone(art09Plan), 1000, 0, 1);
  return { result: JSON.parse(JSON.stringify(result)), requests };
}

test("⭐ 아트공구 — 상품목록을 100개씩 1쪽부터 끝까지 읽고, 판매 · 진열 상태를 그대로, 고른 칸만 넘긴다", async () => {
  const products = Array.from({ length: 150 }, (_, index) => cafe24Product(index, {
    selling: index === 0 ? "F" : "T",
    display: index === 1 ? "F" : "T",
  }));
  const { result, requests } = await runArt09Reader({ products });
  assert.equal(result.success, true);
  assert.deepEqual(requests, [
    { page: 1, limit: "100", orderby: "regist_d", credentials: "include" },
    { page: 2, limit: "100", orderby: "regist_d", credentials: "include" },
  ]);
  const { rows, collection } = result.snapshot;
  assert.equal(rows.length, 150);
  assert.deepEqual(collection, { totalRecords: 150, recordsRead: 150, pagesRead: 2, totalPages: 2, detailsRead: 0, detailsMissing: 0 });
  assert.deepEqual(rows.find((row) => row.mallProductCode === "123000"), {
    mallProductCode: "123000",
    productName: "[펜시네0] 상품 0 1p",
    sellpiaName: null,
    sellerCode: null,
    salePrice: 9490,
    statusWords: ["판매안함", "진열함"],
    registeredOn: null,
    imageUrl: "https://zzogzzog1.cafe24.com/web/product/tiny/202608/123000.jpg",
  });
  assert.deepEqual(rows.find((row) => row.mallProductCode === "123001").statusWords, ["판매함", "진열안함"]);
});

test("아트공구 — 쪽이 겹치거나 읽는 사이 수가 바뀌면 저장하지 않는다", async () => {
  const products = Array.from({ length: 150 }, (_, index) => cafe24Product(index));
  // 정렬이 흔들려 2쪽이 1쪽 상품을 다시 주면 빠진 상품이 있다는 뜻이다.
  const overlap = await runArt09Reader({ serve: (page) => cafe24Page(150, products.slice(0, page === 1 ? 100 : 50)) });
  assert.deepEqual(overlap.result, { success: false, errorCode: "mall_contract_drift", stage: "page_overlap" });
  const shifted = await runArt09Reader({ serve: (page) => cafe24Page(page === 1 ? 150 : 151, products.slice((page - 1) * 100, page * 100)) });
  assert.deepEqual(shifted.result, { success: false, errorCode: "mall_total_changed" });
});

test("아트공구 — 로그인 화면으로 넘어가면 로그인이 필요하다고 답한다", async () => {
  const { result } = await runArt09Reader({ serve: () => ({ landed: "https://eclogin.cafe24.com/Shop/" }) });
  assert.deepEqual(result, { success: false, errorCode: "mall_login_required" });
});
// ── 사방넷으로만 가져오던 몰(2026-09-19) — 몰 상품코드가 사방넷 모양 그대로여야 이어진 레시피를 그대로 쓴다. ──

function pageContextFor(origin, extra = {}) {
  return vm.createContext({
    Date, Map, Set, URL, URLSearchParams, JSON, Number, Array, String, Math, Object, RegExp,
    AbortController,
    setTimeout: (callback) => setTimeout(callback, 0),
    clearTimeout,
    DOMParser,
    location: new URL(`${origin}/`),
    ...extra,
  });
}


const planFor = (mallKey, sourceOrigin, pageSize) => ({ ...kidkidsPlan, mallKey, sourceOrigin, pageSize });
const jsonAnswer = (url, payload, status = 200) => ({ ok: status >= 200 && status < 300, status, url, json: async () => payload, text: async () => JSON.stringify(payload) });
test("⭐ 도매꾹 — 목록 조회를 500개씩 전체 수만큼 읽고, 진행상태 · 진열을 몰 글자로, 상품번호를 몰 상품코드로 넘긴다", async () => {
  const DOME = "https://www.domeggook.com";
  const items = Array.from({ length: 3 }, (_, index) => ({
    no: String(19840000 + index),
    title: `[키드아이템] 상품 ${index}`,
    status: index === 1 ? "기간종료" : "진행중",
    disp: index === 2 ? "진열안함" : "진열함",
    amt_dome: "1,200",
    code: index === 0 ? "1234-1" : "",
    dateReg: "2026.08.10 15:12:20",
    img: '<a href="https://cdn1.domeggook.com/upload/item/a.jpg" target="_blank"><img src="https://cdn1.domeggook.com/upload/item/a.jpg"></a>',
  }));
  const requests = [];
  const context = pageContextFor(DOME, {
    fetch: async (url) => {
      const parsed = new URL(url, `${DOME}/`);
      requests.push([parsed.pathname, parsed.searchParams.get("pg"), parsed.searchParams.get("sz"), parsed.searchParams.get("nos")]);
      return jsonAnswer(parsed.href, { res: true, cnt: String(items.length), dat: items });
    },
  });
  const result = JSON.parse(JSON.stringify(await pageFileReader("../kiditem-os/content/orders/domeggook-listings.js", "domeggook.listings", context)(planFor("domeggook", DOME, 500))));
  assert.equal(result.success, true);
  assert.deepEqual(requests, [["/sc/item/lst", "1", "500", ""]]);
  const byCode = new Map(result.snapshot.rows.map((row) => [row.mallProductCode, row]));
  assert.deepEqual(byCode.get("19840000"), {
    mallProductCode: "19840000",
    productName: "[키드아이템] 상품 0",
    sellpiaName: null,
    sellerCode: "1234-1",
    salePrice: 1200,
    statusWords: ["진행중", "진열함"],
    registeredOn: "2026-08-10",
    imageUrl: "https://cdn1.domeggook.com/upload/item/a.jpg",
  });
  assert.deepEqual(byCode.get("19840002").statusWords, ["진행중", "진열안함"]);
  assert.deepEqual(result.snapshot.collection, { totalRecords: 3, recordsRead: 3, pagesRead: 1, totalPages: 1, detailsRead: 0, detailsMissing: 0 });
});
