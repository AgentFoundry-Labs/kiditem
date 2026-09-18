import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

/**
 * 아이스크림몰에 주문이 없는 날은 '신규 주문 없음'이다. 표의 나머지 행(화면 틀 · 검색 조건)만
 * 있고 주문번호 행이 0이거나, 주문이 전부 이미 출고됐다. 한 주 내내 그런 날이 unknown_failure 로
 * 남아 실패 몰로 셌다(2026-09-18).
 */
const workerSource = readFileSync(
  new URL("../kiditem-os/background/orders/worker.js", import.meta.url),
  "utf8",
);

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

const context = {};
vm.createContext(context);
vm.runInContext(extractFunction(workerSource, "icecreamHasNoPendingOrders"), context);
const noPending = (diag) => context.icecreamHasNoPendingOrders([{ reason: "data rows not found", ...diag }]);

test("a delivery list with no order-number rows is a day with no new orders", () => {
  assert.equal(noPending({ candidateRows: 12, orderRows: 0, doneExcluded: 0 }), true);
});

test("orders that are all already shipped are no new orders either", () => {
  assert.equal(noPending({ candidateRows: 20, orderRows: 3, doneExcluded: 3 }), true);
});

test("an order row that could not be read is a real failure", () => {
  assert.equal(noPending({ candidateRows: 20, orderRows: 3, doneExcluded: 1 }), false);
  assert.equal(context.icecreamHasNoPendingOrders([{ reason: "header not found" }]), false);
});
