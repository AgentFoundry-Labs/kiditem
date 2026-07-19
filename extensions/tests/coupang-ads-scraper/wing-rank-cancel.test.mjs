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
  assert.match(wingRank, /runWingSalesRankBatch\(targets, productTotal, runId, startedAt\)/);
  assert.match(wingCatalogSearch, /executeWingCatalogSearchWithRetry/);
  assert.match(wingCatalogSearch, /response\?\.status === 429/);
  assert.match(wingCatalogSearch, /response\?\.status >= 500/);
  assert.match(wingCatalogSearch, /collectionRuns\.requireAttention/);
  assert.match(wingCatalogSearch, /"marketplace_login"/);
  assert.match(wingCatalogSearch, /"rate_limited"/);
  assert.match(wingCatalogSearch, /break;/);
});

test("Wing catalog rate limiting uses paced searches and bounded asymmetric retries", () => {
  const wingPageDelay = source.match(
    /const WING_CATALOG_PAGE_DELAY_MS = (\d+);/,
  );
  const keywordSearchDelay = source.match(
    /const COUPANG_KEYWORD_SEARCH_DELAY_MS = (\d+);/,
  );
  const wingCatalogSearch = functionSource(
    'searchWingCatalogProducts',
    'searchCoupangKeywordSuggestions',
  );
  const keywordSearch = functionSource(
    'searchCoupangKeywordSuggestions',
    'getOrCreateCoupangSearchTab',
  );
  const retry = functionSource(
    'executeWingCatalogSearchWithRetry',
    'executeWingCatalogSearch',
  );

  assert.equal(wingPageDelay?.[1], '2200');
  assert.equal(keywordSearchDelay?.[1], '1500');
  assert.match(
    wingCatalogSearch,
    /response = await executeWingCatalogSearchWithRetry\(tabId, payload\);[\s\S]*?searchPage = body\.nextSearchPage;[\s\S]*?if \(index < maxPages - 1\) await sleep\(WING_CATALOG_PAGE_DELAY_MS\);/,
  );
  assert.match(
    keywordSearch,
    /await sleep\(COUPANG_KEYWORD_SEARCH_DELAY_MS\);[\s\S]*?response = await executeCoupangKeywordSuggestionSearch\(/,
  );
  assert.match(
    retry,
    /const retryable =\s*response\?\.status === 429 \|\| response\?\.status >= 500;/,
  );
  assert.match(
    retry,
    /const MAX_ATTEMPTS = 4;[\s\S]*?for \(let attempt = 1; attempt <= MAX_ATTEMPTS; attempt\+\+\) \{[\s\S]*?response = await executeWingCatalogSearch\(tabId, payload\);[\s\S]*?if \(!retryable \|\| attempt === MAX_ATTEMPTS\) return response;/,
  );
  assert.match(
    retry,
    /const baseMs = response\?\.status === 429 \? 4000 : 1000;[\s\S]*?await sleep\(baseMs \* 2 \*\* \(attempt - 1\)\);/,
  );
});
