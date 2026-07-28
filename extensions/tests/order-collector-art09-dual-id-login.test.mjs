import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} closing brace not found`);
}

class FakeInput {
  constructor({ id, name, type = "text", label = "" }) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.labels = label ? [{ textContent: label }] : [];
    this.disabled = false;
    this.readOnly = false;
    this.events = [];
    this._value = "";
  }

  get value() {
    return this._value;
  }

  set value(next) {
    this._value = next;
  }

  getAttribute(name) {
    return this[name] ?? null;
  }

  getBoundingClientRect() {
    return { width: 200, height: 40 };
  }

  closest(selector) {
    if (selector === "form") return this.form;
    return null;
  }

  compareDocumentPosition(other) {
    return other === this.form.password ? 4 : 0;
  }

  dispatchEvent(event) {
    this.events.push(event.type);
  }
}

test("art09 automatic login fills the Cafe24 shop ID and supplier ID separately", () => {
  const source = readFileSync(
    new URL("../order-collector/background/service-worker.js", import.meta.url),
    "utf8",
  );
  const shopId = new FakeInput({ id: "mallId", name: "mallId", label: "아이디" });
  const supplierId = new FakeInput({
    id: "supplierId",
    name: "supplierId",
    label: "공급사 아이디(로그인 아이디)",
  });
  const password = new FakeInput({ id: "password", name: "password", type: "password", label: "비밀번호" });
  const loginButton = {
    disabled: false,
    textContent: "로그인",
    value: "",
    clicked: false,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 200, height: 40 }),
    click() {
      this.clicked = true;
    },
  };
  const inputs = [shopId, supplierId, password];
  const form = {
    password,
    querySelectorAll(selector) {
      return selector === "input" ? inputs : [loginButton];
    },
  };
  for (const input of inputs) input.form = form;

  const document = {
    querySelector(selector) {
      if (selector.includes("#password")) return password;
      return null;
    },
    querySelectorAll(selector) {
      return selector === "input" ? inputs : [loginButton];
    },
  };
  const window = {
    getComputedStyle: () => ({ visibility: "visible", display: "block" }),
  };
  const runnable = vm.runInNewContext(`(${extractFunction(source, "autoSubmitIcecreamMallLogin")})`, {
    document,
    window,
    Event: class Event {
      constructor(type) {
        this.type = type;
      }
    },
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
  });
  const result = runnable({
    loginId: "fake-shop-id",
    supplierLoginId: "fake-supplier-id",
    password: "fake-password",
  });

  assert.equal(result.state, "submitted");
  assert.equal(shopId.value, "fake-shop-id");
  assert.equal(supplierId.value, "fake-supplier-id");
  assert.equal(password.value, "fake-password");
  assert.equal(loginButton.clicked, true);
});

test("a login tab stays open without stealing focus when automatic login needs attention", async () => {
  const source = readFileSync(
    new URL("../order-collector/background/service-worker.js", import.meta.url),
    "utf8",
  );
  const calls = { attached: [], detached: [], removed: [] };
  const ensureMallLoggedInSource = extractFunction(source, "ensureMallLoggedIn").replace(
    /^function /,
    "async function ",
  );
  const ensureMallLoggedIn = vm.runInNewContext(
    `(${ensureMallLoggedInSource})`,
    {
      ART09_ORDER_URL: "https://example.invalid/art09",
      BORIBORI_ORDER_URL: "https://example.invalid/boribori",
      DOMEGGOOK_LIST_URL: "https://example.invalid/domeggook",
      GSSHOP_ORDER_URL: "https://example.invalid/gs-shop",
      ICECREAM_MALL_URL: "https://example.invalid/icecream",
      KIDKIDS_ORDER_URL: "https://example.invalid/kidkids",
      KIDSNOTE_ORDER_URL: "https://example.invalid/kidsnote",
      KKOMANGSE_ORDER_URL: "https://example.invalid/kkomangse",
      ONCHANNEL_ORDER_URL: "https://example.invalid/onch",
      TEACHERVILLE_ORDER_URL: "https://example.invalid/teacher-mall",
      chrome: {
        tabs: {
          create: async () => ({ id: 17, windowId: 5 }),
          remove: async (...args) => calls.removed.push(args),
        },
      },
      delay: async () => undefined,
      ensureMallLogin: async () => ({
        success: false,
        submitted: false,
        pendingLogin: true,
        error: "manual verification required",
      }),
      getMallLoginUrl: () => "https://example.invalid/login",
      waitForTabReady: async () => undefined,
      withTimeout: (promise) => promise,
      Error,
    },
  );

  const collection = {
    async attachTab(tab, attachment) {
      calls.attached.push([tab, attachment]);
    },
    async detachTab(tab, attachment) {
      calls.detached.push([tab, attachment]);
    },
  };
  const result = await ensureMallLoggedIn(
    "art09",
    {
      loginId: "fake-shop-id",
      supplierLoginId: "fake-supplier-id",
      password: "fake-password",
    },
    collection,
  );

  assert.equal(result.pendingLogin, true);
  assert.equal(calls.attached.length, 1);
  assert.equal(calls.attached[0][0].id, 17);
  assert.equal(calls.attached[0][0].windowId, 5);
  assert.equal(calls.attached[0][1].owned, true);
  assert.deepEqual(calls.detached, []);
  assert.equal(calls.removed.length, 0);
});

test("login preflight runs inside the matching order collection lifecycle", async () => {
  const source = readFileSync(
    new URL("../order-collector/background/service-worker.js", import.meta.url),
    "utf8",
  );
  const calls = [];
  const ensureMallLoginWithLifecycle = vm.runInNewContext(
    `(${extractFunction(source, "ensureMallLoginWithLifecycle")})`,
    {
      KidItemOrderCollectionLifecycle: {
        createIdentity: (mallKey, date) => ({ mallKey, date }),
      },
      ensureMallLoggedIn: async (mallKey, credentials, collection) => {
        calls.push(["ensure", mallKey, credentials, collection]);
        return { success: false, pendingLogin: true };
      },
      orderCollectionLifecycle: {
        async run(message, identity, operation) {
          calls.push(["run", message, identity]);
          return operation({ runId: message.runId });
        },
      },
    },
  );
  const message = {
    mallKey: "art09",
    credentials: { loginId: "shop-id", password: "password" },
    date: "2026-07-28",
    runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };

  const result = await ensureMallLoginWithLifecycle(message);

  assert.equal(result.pendingLogin, true);
  assert.deepEqual(calls[0], [
    "run",
    message,
    { mallKey: "art09", date: "2026-07-28" },
  ]);
  assert.equal(calls[1][0], "ensure");
  assert.equal(calls[1][1], "art09");
  assert.deepEqual(calls[1][3], { runId: message.runId });
});

test("art09 collection ignores visible orders outside the 배송준비전 state", async () => {
  const source = readFileSync(
    new URL("../order-collector/background/service-worker.js", import.meta.url),
    "utf8",
  );
  const cells = (values) => values.map((value) => ({ innerText: value, textContent: value }));
  const header = {
    cells: cells(["선택", "주문번호", "상품명", "처리상태"]),
    innerText: "선택 주문번호 상품명 처리상태",
    querySelector: () => null,
    getBoundingClientRect: () => ({ width: 500, height: 30 }),
  };
  const shipped = {
    cells: cells(["", "20260727-0000001", "이미 발송된 상품", "배송완료"]),
    innerText: "20260727-0000001 이미 발송된 상품 배송완료",
    querySelector: () => null,
    getBoundingClientRect: () => ({ width: 500, height: 30 }),
  };
  const table = {
    querySelectorAll(selector) {
      return selector === "tr" ? [header, shipped] : [];
    },
  };
  header.closest = shipped.closest = () => table;
  let detailFetchCount = 0;
  const document = {
    body: { innerText: "주문목록 검색 결과" },
    querySelector: () => null,
    querySelectorAll(selector) {
      return selector === "tr" ? [header, shipped] : [];
    },
  };
  const scrapeSource = extractFunction(source, "scrapeArt09Orders").replace(
    /^function /,
    "async function ",
  );
  const scrape = vm.runInNewContext(`(${scrapeSource})`, {
    document,
    window: { getComputedStyle: () => ({ display: "table-row", visibility: "visible" }) },
    fetch: async () => {
      detailFetchCount += 1;
      throw new Error("non-target order detail must not be fetched");
    },
    DOMParser: class DOMParser {},
    TextDecoder,
    Set,
    Error,
  });

  const result = await scrape();

  assert.equal(result.success, true);
  assert.equal(result.count, 0);
  assert.equal(Array.isArray(result.rows), true);
  assert.equal(result.rows.length, 0);
  assert.equal(detailFetchCount, 0);
});

test("art09 collection requires an actual order row from the requested date", async () => {
  const source = readFileSync(
    new URL("../order-collector/background/service-worker.js", import.meta.url),
    "utf8",
  );
  const cells = (values) => values.map((value) => ({ innerText: value, textContent: value }));
  const header = {
    cells: cells(["선택", "주문번호", "주문일시", "상품명", "처리상태"]),
    innerText: "선택 주문번호 주문일시 상품명 처리상태",
    querySelector: () => null,
    getBoundingClientRect: () => ({ width: 500, height: 30 }),
  };
  const guide = {
    cells: cells(["", "20260727-0000001", "2026-07-27 09:00:00", "주문번호 입력 안내", "배송준비전"]),
    innerText: "20260727-0000001 2026-07-27 09:00:00 주문번호 입력 안내 배송준비전",
    querySelector: () => null,
    getBoundingClientRect: () => ({ width: 500, height: 30 }),
  };
  const staleCheckbox = { checked: false };
  const stale = {
    cells: cells(["", "20260726-0000002", "2026-07-26 09:00:00", "어제 주문", "배송준비전"]),
    innerText: "20260726-0000002 2026-07-26 09:00:00 어제 주문 배송준비전",
    querySelector: (selector) => selector === 'input[type="checkbox"]' ? staleCheckbox : null,
    getBoundingClientRect: () => ({ width: 500, height: 30 }),
  };
  const orderCheckbox = { checked: false };
  const order = {
    cells: cells(["", "20260727-0000003", "2026-07-27 10:00:00", "오늘 정상 상품", "배송준비전"]),
    innerText: "20260727-0000003 2026-07-27 10:00:00 오늘 정상 상품 배송준비전",
    querySelector: (selector) => selector === 'input[type="checkbox"]' ? orderCheckbox : null,
    getBoundingClientRect: () => ({ width: 500, height: 30 }),
  };
  const table = {
    querySelectorAll(selector) {
      return selector === "tr" ? [header, guide, stale, order] : [];
    },
  };
  header.closest = guide.closest = stale.closest = order.closest = () => table;
  const document = {
    body: { innerText: "주문목록 검색 결과" },
    querySelector: () => null,
    querySelectorAll(selector) {
      return selector === "tr" ? [header, guide, stale, order] : [];
    },
  };
  const fetchedOrderIds = [];
  const scrapeSource = extractFunction(source, "scrapeArt09Orders").replace(
    /^function /,
    "async function ",
  );
  const scrape = vm.runInNewContext(`(${scrapeSource})`, {
    document,
    window: { getComputedStyle: () => ({ display: "table-row", visibility: "visible" }) },
    fetch: async (url) => {
      fetchedOrderIds.push(new URL(url, "https://zzogzzog1.cafe24.com").searchParams.get("order_id"));
      return {
        ok: true,
        headers: { get: () => "text/html;charset=utf-8" },
        arrayBuffer: async () => new TextEncoder().encode("<html><body>상품 배송</body></html>").buffer,
      };
    },
    DOMParser: class DOMParser {
      parseFromString() {
        return { body: { innerText: "상품 배송" }, querySelectorAll: () => [] };
      }
    },
    TextDecoder,
    TextEncoder,
    URL,
    Set,
    Error,
  });

  const result = await scrape("2026-07-27");

  assert.equal(result.success, true);
  assert.deepEqual(fetchedOrderIds, ["20260727-0000003"]);
  assert.equal(result.orderCount, 1);
  assert.equal(result.rows[0]?.orderId, "20260727-0000003");
});
