import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(
  new URL("../kiditem-os/background/orders/worker.js", import.meta.url),
  "utf8",
);

function extractFunction(name) {
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

const DELIVERY_URL =
  "https://po.i-screammall.co.kr/delivery/deliveryInquiry.deliveryInquiryListView.do";

/**
 * 아이스크림몰은 '배송 조회' 메뉴를 누르면 옆 메뉴에 그 글자가 먼저 보이고, 배송조회 화면은 잠시 뒤
 * 프레임에 열린다. 메뉴 글자를 보고 열렸다고 하면 그 순간 프레임은 아직 비어 있어 수집기가 메뉴
 * 화면을 긁고 '배송목록 표 머리글을 찾지 못했습니다'로 실패한다. 매번 새 탭을 여는 지금은 항상 그랬다.
 */
test("waits for the delivery frame itself, not the side menu label, before reporting the screen open", async () => {
  const state = { menuExpanded: false, frameLoaded: false, frameReads: 0 };
  const frame = {
    getAttribute(name) {
      return name === "src" && state.menuExpanded ? DELIVERY_URL : "/dashboard.do";
    },
    get contentWindow() {
      return { location: { href: state.frameLoaded ? DELIVERY_URL : "about:blank" } };
    },
    get contentDocument() {
      if (state.menuExpanded && !state.frameLoaded) {
        state.frameReads += 1;
        if (state.frameReads >= 3) state.frameLoaded = true;
      }
      return {
        body: { innerText: state.frameLoaded ? "배송 조회 조회기간 배송목록 주문번호 배송번호" : "" },
      };
    },
  };
  const menu = {
    textContent: "배송 조회",
    value: "",
    getAttribute: () => null,
    click() {
      state.menuExpanded = true;
    },
  };
  const document = {
    body: {
      get innerText() {
        return state.menuExpanded ? "상품 주문/결제 배송 배송 조회 정산" : "상품 주문/결제 배송 정산";
      },
    },
    querySelectorAll(selector) {
      return selector === "iframe,frame" ? [frame] : [menu];
    },
  };
  const ensureDeliveryInquiry = vm.runInNewContext(
    `(${extractFunction("ensureIcecreamMallDeliveryInquiry").replace(/^function /, "async function ")})`,
    {
      document,
      location: { href: "https://po.i-screammall.co.kr/main.do" },
      setTimeout: (callback) => setImmediate(callback),
    },
  );

  const result = await ensureDeliveryInquiry();

  assert.equal(result.success, true);
  assert.equal(result.opened, true);
  assert.equal(state.frameLoaded, true, "reported open before the delivery frame loaded");
});

test("still accepts a delivery page that is already open in the top document", async () => {
  const document = {
    body: { innerText: "배송 조회 조회기간 배송목록 주문번호 배송번호" },
    querySelectorAll: () => [],
  };
  const ensureDeliveryInquiry = vm.runInNewContext(
    `(${extractFunction("ensureIcecreamMallDeliveryInquiry").replace(/^function /, "async function ")})`,
    {
      document,
      location: { href: DELIVERY_URL },
      setTimeout: (callback) => setImmediate(callback),
    },
  );

  const result = await ensureDeliveryInquiry();

  assert.equal(result.success, true);
  assert.equal(result.opened, false);
});
