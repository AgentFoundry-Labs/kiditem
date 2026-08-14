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
const tiktokCollector = readFileSync(resolve(
  process.cwd(),
  'extensions/kiditem-os/background/sourcing/tiktok-cc-collector.js',
), 'utf8');
const liveCommerceCollector = readFileSync(resolve(
  process.cwd(),
  'extensions/kiditem-os/background/sourcing/live-commerce-collector.js',
), 'utf8');

test('sourcing collection runs are exact browser Operations, not external action bridges', () => {
  assert.match(
    worker,
    /"sourcing\.collect_1688_trends": runSourcing1688TrendOperation/,
  );
  assert.match(
    worker,
    /"sourcing\.collect_tiktok_cc_trends": runSourcingTiktokCcTrendOperation/,
  );
  assert.match(
    worker,
    /"sourcing\.collect_live_commerce_url": runSourcingLiveCommerceOperation/,
  );
  assert.match(worker, /operation\.signal\?\.throwIfAborted\?\.\(\)/);
  assert.match(
    worker,
    /waitForTrendCollector\(operation, trendCollector, "1688"\)/,
    'daily composite validates the browser child against its canonical 1688 source result',
  );
  assert.match(worker, /function bindOperationAbort\(/);
  assert.match(worker, /operation_runtime_fence_lost/);
  assert.doesNotMatch(
    worker,
    /resolve1688OperationKeywords|\/sourcing\/trend\/1688-targets/,
    'the browser must use the immutable OperationRun keyword snapshot, not current mutable seeds',
  );
  assert.match(worker, /trendCollector\.cancel\(operation\.runId, operation\.environmentId\)/);
  assert.match(worker, /tiktokCcCollector\.cancel\(operation\.runId, operation\.environmentId\)/);
  assert.match(worker, /liveCommerceCollector\.cancel\(operation\.runId, operation\.environmentId\)/);
  assert.doesNotMatch(worker, /start1688TrendCollection/);
  assert.doesNotMatch(worker, /get1688TrendCollectionStatus/);
  assert.doesNotMatch(worker, /cancel1688TrendCollection/);
  assert.doesNotMatch(worker, /startTiktokCcCollection/);
  assert.doesNotMatch(worker, /getTiktokCcCollectionStatus/);
  assert.doesNotMatch(worker, /cancelTiktokCcCollection/);
  assert.doesNotMatch(worker, /collectLiveCommerceUrl/);
  assert.doesNotMatch(worker, /restartSourcingCollectionSession/);
  assert.doesNotMatch(trendCollector, /requestedRunId\s*\|\|\s*createRunId/);
  assert.doesNotMatch(tiktokCollector, /requestedRunId\s*\|\|\s*createRunId/);
});

test('each exact browser collector posts only through its fenced owner-ingest route', () => {
  for (const [source, route] of [
    [trendCollector, '/sourcing/operations/1688-trends/'],
    [tiktokCollector, '/sourcing/operations/tiktok-cc-trends/'],
    [liveCommerceCollector, '/sourcing/operations/live-commerce/'],
  ]) {
    assert.match(source, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(source, /"x-operation-attempt-token"/);
    assert.match(source, /operation_runtime_fence_lost/);
  }
  assert.doesNotMatch(trendCollector, /\/trend\/1688-results/);
  assert.doesNotMatch(tiktokCollector, /\/trend\/tiktok-cc-results/);
  assert.doesNotMatch(liveCommerceCollector, /\/trend\/live-commerce-results/);
});
