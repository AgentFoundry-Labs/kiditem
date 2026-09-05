import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const worker = readFileSync(resolve(
  process.cwd(),
  'extensions/kiditem-os/background/sourcing/worker.js',
), 'utf8');
const trendCollector = readFileSync(resolve(
  process.cwd(),
  'extensions/kiditem-os/background/sourcing/1688-trend-collector.js',
), 'utf8');
const liveCommerceCollector = readFileSync(resolve(
  process.cwd(),
  'extensions/kiditem-os/background/sourcing/live-commerce-collector.js',
), 'utf8');

test('retained browser collectors use direct source-owner actions with no Live Commerce Operation bridge', () => {
  assert.match(worker, /collectSourcing1688Trends:\s*\{/);
  assert.match(worker, /validate:\s*parseSourcing1688TrendStart/);
  assert.match(worker, /trendCollector\.run\(\{\s*environmentId,\s*idempotencyKey\s*\}\)/);
  assert.doesNotMatch(worker, /"sourcing\.collect_1688_trends": runSourcing1688TrendOperation/);
  assert.doesNotMatch(worker, /function runSourcing1688TrendOperation\(/);
  assert.doesNotMatch(
    worker,
    /sourcing\.search_1688_keyword_batch|runSourcing1688KeywordSearchOperation/,
    'Office CDP owns exact 1688 keyword batches; the extension must not register or dispatch them',
  );
  assert.match(worker, /collectSourcingTiktokCcTrends:\s*\{/);
  assert.match(worker, /validate:\s*parseSourcingTiktokCcTrendStart/);
  assert.match(
    worker,
    /tiktokCcCollector\.run\(\{\s*environmentId,\s*idempotencyKey,\s*maxItems,\s*region\s*\}\)/,
  );
  assert.doesNotMatch(worker, /"sourcing\.collect_tiktok_cc_trends": runSourcingTiktokCcTrendOperation/);
  assert.doesNotMatch(worker, /function runSourcingTiktokCcTrendOperation\(/);
  assert.match(worker, /collectSourcingLiveCommerce:\s*\{/);
  assert.match(worker, /validate:\s*parseSourcingLiveCommerceStart/);
  assert.match(worker, /liveCommerceCollector\.run\(\{\s*environmentId,\s*idempotencyKey,\s*url\s*\}\)/);
  assert.doesNotMatch(worker, /"sourcing\.collect_live_commerce_url": runSourcingLiveCommerceOperation/);
  assert.doesNotMatch(worker, /function runSourcingLiveCommerceOperation\(/);
  assert.doesNotMatch(worker, /function bindOperationAbort\(/);
  assert.doesNotMatch(worker, /operation_runtime_fence_lost/);
  assert.doesNotMatch(
    worker,
    /resolve1688OperationKeywords|\/sourcing\/trend\/1688-targets/,
    'the browser must use the immutable OperationRun keyword snapshot, not current mutable seeds',
  );
  assert.match(worker, /trendCollector\.cancel\(runId, environmentId\)/);
  assert.match(worker, /tiktokCcCollector\.cancel\(runId, environmentId\)/);
  assert.match(worker, /liveCommerceCollector\.cancel\(runId, environmentId\)/);
  assert.doesNotMatch(worker, /start1688TrendCollection/);
  assert.doesNotMatch(worker, /get1688TrendCollectionStatus/);
  assert.doesNotMatch(worker, /cancel1688TrendCollection/);
  assert.doesNotMatch(worker, /startTiktokCcCollection/);
  assert.doesNotMatch(worker, /getTiktokCcCollectionStatus/);
  assert.doesNotMatch(worker, /cancelTiktokCcCollection/);
  assert.doesNotMatch(worker, /collectLiveCommerceUrl/);
  assert.doesNotMatch(worker, /restartSourcingCollectionSession/);
  assert.doesNotMatch(trendCollector, /requestedRunId\s*\|\|\s*createRunId/);
});

test('retained browser collectors post through direct owner attempt routes', () => {
  assert.match(trendCollector, /const SOURCE_PATH = "\/sourcing\/1688-trends\/attempts"/);
  assert.match(trendCollector, /"Idempotency-Key"/);
  assert.match(trendCollector, /KidItemSourcingAttemptWire\.create/);
  assert.doesNotMatch(trendCollector, /\/sourcing\/operations\/1688-trends\//);
  assert.doesNotMatch(trendCollector, /"x-operation-attempt-token"/);

  const tiktokCollector = readFileSync(resolve(
    process.cwd(),
    'extensions/kiditem-os/background/sourcing/tiktok-cc-collector.js',
  ), 'utf8');
  assert.match(tiktokCollector, /const SOURCE_PATH = "\/sourcing\/tiktok-creative\/attempts"/);
  assert.match(tiktokCollector, /"Idempotency-Key"/);
  assert.match(tiktokCollector, /KidItemSourcingAttemptWire\.create/);
  assert.doesNotMatch(tiktokCollector, /\/sourcing\/operations\/tiktok-cc-trends\//);
  assert.doesNotMatch(tiktokCollector, /"x-operation-attempt-token"/);
  assert.doesNotMatch(tiktokCollector, /\/sourcing\/trend\/tiktok-cc-targets/);

  assert.match(liveCommerceCollector, /const SOURCE_PATH = "\/sourcing\/live-commerce\/browser\/attempts"/);
  assert.match(liveCommerceCollector, /"Idempotency-Key"/);
  assert.match(liveCommerceCollector, /KidItemSourcingAttemptWire\.create/);
  assert.doesNotMatch(liveCommerceCollector, /\/sourcing\/operations\/live-commerce\//);
  assert.doesNotMatch(liveCommerceCollector, /"x-operation-attempt-token"/);
  assert.doesNotMatch(trendCollector, /\/sourcing\/operations\/1688-search\//);
  assert.doesNotMatch(trendCollector, /\/trend\/1688-results/);
  assert.doesNotMatch(liveCommerceCollector, /\/trend\/live-commerce-results/);
});
