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

test("Domeggook generation supports iframe#gLayerFrame and clicks its submit button", async () => {
  const calls = { download: 0, submit: 0 };
  const submit = {
    click() {
      calls.submit += 1;
    },
  };
  const frameDocument = {
    querySelector(selector) {
      return selector === "#lXlsReqNoticeBtnSubmit" ? submit : null;
    },
  };
  const frame = { contentDocument: frameDocument, contentWindow: {} };
  const download = {
    textContent: "엑셀 다운로드",
    value: "",
    click() {
      calls.download += 1;
    },
  };
  const document = {
    querySelectorAll() {
      return [download];
    },
    querySelector(selector) {
      if (selector === "iframe#gLayerFrame, #gLayerFrame iframe") return frame;
      return null;
    },
  };
  const runnableSource = extractFunction("triggerDomeggookExcelGen").replace(
    /^function /,
    "async function ",
  );
  const trigger = vm.runInNewContext(`(${runnableSource})`, {
    document,
    setTimeout: (callback) => callback(),
    Promise,
  });

  const result = await trigger();

  assert.equal(result.success, true);
  assert.equal(calls.download, 1);
  assert.equal(calls.submit, 1);
});

test("Domeggook modal automation runs in the main page world", () => {
  const collectorStart = source.indexOf("async function collectDomeggookOrders(");
  const triggerStart = source.indexOf("async function triggerDomeggookExcelGen(");
  const collector = source.slice(collectorStart, triggerStart);

  assert.match(collector, /world:\s*["']MAIN["']/);
  assert.match(collector, /func:\s*triggerDomeggookExcelGen/);
});

test("Icecream Mall collection excludes both in-transit and delivered statuses", () => {
  const match = source.match(
    /const ICECREAM_EXCLUDED_DELIVERY_STATUSES\s*=\s*(\[[\s\S]*?\]);/,
  );
  assert.ok(match, "excluded delivery status constant not found");
  const statuses = vm.runInNewContext(match[1]);
  assert.ok(statuses.includes("배송중"));
  assert.ok(statuses.includes("배송완료"));

  const injectedFunction = extractFunction("scrapeIcecreamMallDeliveryGrid");
  assert.match(
    source,
    /args:\s*\[date, ICECREAM_DELIVERY_HEADERS, ICECREAM_EXCLUDED_DELIVERY_STATUSES\]/,
  );
  assert.match(
    injectedFunction,
    /excludedStatuses\.some\(\(excluded\)\s*=>\s*status\.includes\(excluded\)\)/,
  );
});
