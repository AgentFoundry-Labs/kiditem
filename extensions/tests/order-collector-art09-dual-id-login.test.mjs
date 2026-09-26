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
    new URL("../kiditem-os/background/orders/worker.js", import.meta.url),
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

/**
 * 자동 로그인이 끝나지 못하면(누렸는데 로그인 화면이 남았다) 그 화면은 사람이 봐야 한다 —
 * 탭을 남기되 앞으로 끌어오지는 않는다. 탭을 열고 수집 시도에 매달고 닫는 일은 몰 세션
 * 드라이버(worker.js)가 하고, 남길지 말지는 모듈이 정한다(KID-254) — 둘을 붙여 돌린다.
 */
function loadMallSessionWithWorkerDriver(overrides = {}) {
  const workerSource = readFileSync(
    new URL("../kiditem-os/background/orders/worker.js", import.meta.url),
    "utf8",
  );
  const calls = { attached: [], detached: [], removed: [], remembered: [], forgotten: [], active: 0 };
  const context = {
    URL, Date, Object, Array, JSON, Error, RegExp, Promise, Number, String, Boolean,
    setTimeout, clearTimeout, TextDecoder, AbortController,
    fetch: async () => {
      throw new Error("unexpected fetch");
    },
    chrome: {
      tabs: {
        create: async () => ({ id: 17, windowId: 5 }),
        remove: async (tabId) => calls.removed.push(tabId),
        get: async () => ({ id: 17, url: "https://example.invalid/art09" }),
      },
      permissions: { contains: async () => true },
      scripting: { executeScript: async () => [] },
    },
    delay: async () => undefined,
    waitForTabReady: async () => undefined,
    withTimeout: (promise) => promise,
    rememberOrderCollectionTab: (tabId) => calls.remembered.push(tabId),
    forgetOrderCollectionTab: (tabId) => calls.forgotten.push(tabId),
    assertOrderCollectionActive: async (collection) => {
      calls.active += 1;
      if (typeof collection?.assertActive !== "function") return true;
      const active = await collection.assertActive();
      if (active === false || active === null) {
        const error = new Error("Order collection is no longer active.");
        error.code = "COLLECTION_CANCELLED";
        throw error;
      }
      return true;
    },
    attachOrderCollectionTab: async (collection, tab, owned) => {
      if (!collection?.attachTab) return true;
      return collection.attachTab(tab, { owned });
    },
    closeFreshOrderCollectionTab: async (tab) => {
      if (Number.isInteger(tab?.id)) calls.removed.push(tab.id);
    },
    orderCollectionCancelledResult: (error) => ({
      success: false,
      errorCode: "COLLECTION_CANCELLED",
      error: String(error?.message || "Order collection is no longer active."),
    }),
    // 폼을 채우고 알림 창을 읽는 주입은 각본으로 대신한다 — 여기서 보는 것은 탭의 생애다.
    recordMallLoginDialogs: async () => undefined,
    takeMallLoginDialog: async () => null,
    loginFormRemainsAfterSubmit: async () => true,
    autoSubmitIcecreamMallLogin: () => undefined,
    inspectMallLoginScreen: () => undefined,
    ...overrides,
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["mall-session-probe.js", "mall-session.js"]) {
    vm.runInContext(
      readFileSync(new URL(`../kiditem-os/background/orders/${file}`, import.meta.url), "utf8"),
      context,
    );
  }
  vm.runInContext(extractFunction(workerSource, "createMallSessionDriver"), context);
  const session = vm.runInContext(
    "KidItemMallSession.create({ driver: createMallSessionDriver() })",
    context,
  );
  return { session, calls };
}

test("a login tab stays open without stealing focus when automatic login needs attention", async () => {
  const { session, calls } = loadMallSessionWithWorkerDriver({
    chrome: {
      tabs: {
        create: async (properties) => {
          assert.equal(properties.active, false, "앞으로 끌어오지 않는다");
          return { id: 17, windowId: 5 };
        },
        remove: async () => {
          throw new Error("closed a tab the operator still has to look at");
        },
        get: async () => ({ id: 17, url: "https://example.invalid/art09" }),
      },
      permissions: { contains: async () => true },
      // 누른 뒤에도 로그인 화면이 남았다 — 사람이 보야 무슨 일인지 안다.
      scripting: { executeScript: async () => [{ result: { state: "submitted", method: "exact-text" } }] },
    },
  });
  const collection = {
    async assertActive() {
      return true;
    },
    async attachTab(tab, attachment) {
      calls.attached.push([tab, attachment]);
    },
    async detachTab(tab, attachment) {
      calls.detached.push([tab, attachment]);
    },
  };

  const result = await session.ensureLoggedIn(
    "art09",
    { loginId: "fake-shop-id", supplierLoginId: "fake-supplier-id", password: "fake-password" },
    { collection },
  );

  assert.equal(result.verdict, "rejected");
  assert.equal(result.verified, false);
  assert.equal(calls.attached.length, 1);
  assert.equal(calls.attached[0][0].id, 17);
  assert.equal(calls.attached[0][0].windowId, 5);
  assert.equal(calls.attached[0][1].owned, true);
  // 탭을 열기 전과 스크립트를 넣기 직전, 두 번 소유권을 확인한다.
  assert.equal(calls.active, 2);
  assert.deepEqual(calls.detached, []);
  assert.deepEqual(calls.removed, []);
});

test("login preflight runs inside the matching order collection lifecycle", async () => {
  const source = readFileSync(
    new URL("../kiditem-os/background/orders/worker.js", import.meta.url),
    "utf8",
  );
  const calls = [];
  const ensureMallLoginWithLifecycle = vm.runInNewContext(
    `(${extractFunction(source, "ensureMallLoginWithLifecycle")})`,
    {
      KidItemOrderCollectionLifecycle: {
        createIdentity: (mallKey, date) => ({ mallKey, date }),
      },
      mallSession: () => ({
        ensureLoggedIn: async (mallKey, credentials, options) => {
          calls.push(["ensure", mallKey, credentials, options]);
          return { verdict: "unknown", success: false, pendingLogin: true };
        },
      }),
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
  // vm 안에서 만든 객체라 모양만 맞춰 본다.
  assert.deepEqual({ ...calls[1][3].collection }, { runId: message.runId });
});

test("a login sent without an owner attempt logs in only — the mall moved to the orders.mall_orders operation (KID-359 H3)", async () => {
  const source = readFileSync(
    new URL("../kiditem-os/background/orders/worker.js", import.meta.url),
    "utf8",
  );
  const calls = [];
  const ensureMallLoginWithLifecycle = vm.runInNewContext(
    `(${extractFunction(source, "ensureMallLoginWithLifecycle")})`,
    {
      ensureMallLoggedIn: async (mallKey, credentials, collection) => {
        calls.push(["login", mallKey, collection]);
        return { success: true };
      },
      runOwnedOrderCollection: () => {
        throw new Error("an operation mall has no owner attempt to wrap the login in");
      },
    },
  );

  const result = await ensureMallLoginWithLifecycle({
    mallKey: "kidkids",
    credentials: { loginId: "kid", password: "password" },
    date: null,
  });

  assert.equal(result.success, true);
  assert.deepEqual(calls, [["login", "kidkids", null]]);
});
