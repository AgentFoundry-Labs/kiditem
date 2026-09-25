import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL(
    "../../kiditem-os/background/coupang/worker.js",
    import.meta.url,
  ),
  "utf8",
);
// 광고 Wing 순위는 Wing 검색 수집기 바깥에서 검색 전체를 두 번까지 다시 한다(소싱 추천 키워드 몫은 KID-360에서 새 런타임으로 옮겼다).
test("Wing rank keeps caller-level whole-search retry around the Wing collector seam", () => {
  assert.match(source, /search = await wingSearchCollector\.collect\(/);
  assert.match(source, /for \(let attempt = 1; attempt <= 2; attempt\+\+\)/);
  assert.match(source, /if \(search\?\.attentionRequired \|\| search\?\.cancelled\) return search/);
  assert.match(source, /if \(!search\?\.success\) throw new Error/);
});
