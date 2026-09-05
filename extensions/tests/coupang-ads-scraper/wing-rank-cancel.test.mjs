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

function functionSource(name, nextName) {
  const start = source.indexOf(`async function ${name}`);
  const end = source.indexOf(`async function ${nextName}`, start + 1);
  assert.ok(start >= 0, `${name} must exist`);
  assert.ok(end > start, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

test("Wing sales-rank collection supports cooperative cancellation", () => {
  assert.match(source, /wingCatalogSalesRankCancel:\s*true/);
  assert.match(source, /msg\.action === "cancelWingSalesRankCheck"/);
  assert.match(
    source,
    /const requestedRunId = typeof msg\.runId === "string" \? msg\.runId : null;/,
  );
  assert.match(source, /collectionRuns\.cancel\(requestedRunId, environmentId\)/);
  assert.match(
    source,
    /collectionSessions\.cancel\(runId, \{ closeManagedTab: true \}\)/,
  );
  assert.match(source, /\[statusKey, cancelKey\]/);
  assert.match(source, /isWingSalesRankCancelled\(runId\)/);
  assert.match(
    source,
    /existingIsActive[\s\S]*?isWingSalesRankCancelled\(existing\.runId, environmentId\)/,
  );
  assert.match(source, /status:\s*cancelled[\s\S]*?"cancelled"/);
  assert.match(source, /storage\.local\.remove\(rankCancelKey\)/);
});

test("Wing rank pauses the whole session on login or bounded upstream exhaustion", () => {
  const wingRank = functionSource(
    'startWingSalesRankCheck',
    'runWingSalesRankBatch',
  );
  const wingCatalogSearch = functionSource(
    'searchWingCatalogProducts',
    'searchCoupangKeywordSuggestions',
  );

  assert.match(wingRank, /options\.forceRestart/);
  assert.match(wingRank, /producer:\s*"advertising\.wing_rank"/);
  assert.match(wingRank, /runWingSalesRankBatch\(targets, productTotal, runId, startedAt, environmentId\)/);
  assert.match(wingCatalogSearch, /executeWingCatalogSearchWithRetry/);
  assert.match(wingCatalogSearch, /response\?\.status === 429/);
  assert.match(wingCatalogSearch, /response\?\.status >= 500/);
  assert.match(wingCatalogSearch, /collectionRuns\.requireAttention/);
  assert.match(wingCatalogSearch, /"marketplace_login"/);
  assert.match(wingCatalogSearch, /"rate_limited"/);
  assert.match(wingCatalogSearch, /break;/);
});

test("keyword suggestions retain the initial page-render delay", () => {
  const keywordSearchDelay = source.match(
    /const COUPANG_KEYWORD_SEARCH_DELAY_MS = (\d+);/,
  );
  const keywordSearch = functionSource(
    'searchCoupangKeywordSuggestions',
    'getOrCreateCoupangSearchTab',
  );
  assert.equal(keywordSearchDelay?.[1], '1500');
  assert.match(
    keywordSearch,
    /await sleep\(COUPANG_KEYWORD_SEARCH_DELAY_MS\);[\s\S]*?response = await executeCoupangKeywordSuggestionSearch\(/,
  );
});
