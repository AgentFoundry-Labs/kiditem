import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL(
    "../../coupang-ads-scraper/background/service-worker.js",
    import.meta.url,
  ),
  "utf8",
);

test("Wing sales-rank collection supports cooperative cancellation", () => {
  assert.match(source, /wingCatalogSalesRankCancel:\s*true/);
  assert.match(source, /msg\.action === "cancelWingSalesRankCheck"/);
  assert.match(
    source,
    /const requestedRunId = typeof msg\.runId === "string" \? msg\.runId : null;/,
  );
  assert.match(source, /collectionRuns\.cancel\(requestedRunId\)/);
  assert.match(
    source,
    /collectionSessions\.cancel\(runId, \{ closeManagedTab: true \}\)/,
  );
  assert.match(
    source,
    /chrome\.storage\.local\.get\(\s*\[RANK_CHECK_STATUS_KEY, RANK_CHECK_CANCEL_KEY\]/,
  );
  assert.match(source, /isWingSalesRankCancelled\(runId\)/);
  assert.match(
    source,
    /existingIsActive[\s\S]*?isWingSalesRankCancelled\(existing\.runId\)/,
  );
  assert.match(source, /status:\s*cancelled[\s\S]*?"cancelled"/);
  assert.match(source, /chrome\.storage\.local\.remove\(RANK_CHECK_CANCEL_KEY\)/);
});

test("Wing rank pauses the whole session on login or bounded upstream exhaustion", () => {
  assert.match(source, /async function startWingSalesRankCheck\(options = \{\}\)/);
  assert.match(source, /options\.forceRestart/);
  assert.match(source, /producer:\s*"advertising\.wing_rank"/);
  assert.match(source, /executeWingCatalogSearchWithRetry/);
  assert.match(source, /response\?\.status === 429/);
  assert.match(source, /response\?\.status >= 500/);
  assert.match(source, /attentionRequired/);
  assert.match(source, /"marketplace_login"/);
  assert.match(source, /"rate_limited"/);
  assert.match(source, /break;/);
});

test("Wing catalog rate limiting uses paced searches and bounded asymmetric retries", () => {
  assert.match(source, /const WING_CATALOG_PAGE_DELAY_MS = 2200;/);
  assert.match(source, /const COUPANG_KEYWORD_SEARCH_DELAY_MS = 1500;/);
  assert.match(source, /const MAX_ATTEMPTS = 4;/);
  assert.match(source, /response\?\.status === 429 \? 4000 : 1000/);
  assert.match(source, /await sleep\(baseMs \* 2 \*\* \(attempt - 1\)\);/);
});
