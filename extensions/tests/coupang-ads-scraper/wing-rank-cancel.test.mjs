import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL(
    "../../kiditem-os/background/coupang/worker.js",
    import.meta.url,
  ),
  "utf8",
);
function functionSource(name, nextName) {
  const start = source.indexOf(`async function ${name}`);
  const end = source.indexOf(`async function ${nextName}`, start + 1);
  assert.ok(start >= 0, `${name} must exist`);
  assert.ok(end > start, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

test("Wing rank keeps caller-level whole-search retry around the Wing collector seam", () => {
  assert.match(source, /search = await wingSearchCollector\.collect\(/);
  assert.match(source, /for \(let attempt = 1; attempt <= 2; attempt\+\+\)/);
  assert.match(source, /if \(search\?\.attentionRequired \|\| search\?\.cancelled\) return search/);
  assert.match(source, /if \(!search\?\.success\) throw new Error/);
});
