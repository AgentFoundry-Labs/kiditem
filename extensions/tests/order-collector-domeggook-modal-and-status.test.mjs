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
