import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcePath = path.join(repoRoot, 'extensions/kiditem-os/background/coupang/wing-report-collector.js');

function load() {
  const context = vm.createContext({ URL, clearTimeout, console, queueMicrotask, setTimeout, structuredClone });
  vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
  return context.KidItemWingReportCollector;
}

function harness(responses = [], options = {}) {
  const status = {};
  const calls = { messages: [], navigations: [], created: [], closed: [] };
  const owned = { runId: 'attempt', windowId: 7, tabId: 41, url: '' };
  const resource = {
    async getOrCreate(runId, url) { owned.runId = runId; owned.url = url; calls.created.push({ runId, url }); return { ...owned }; },
    async navigate(runId, url) { owned.runId = runId; owned.url = url; calls.navigations.push({ runId, url }); return { ...owned, url }; },
    async reattach() { return { ...owned }; },
    async getTab() { return { id: 41, windowId: 7, status: 'complete', url: owned.url }; },
    async waitForTabComplete() {},
    async sendMessageWhenReady(tabId, message) { calls.messages.push({ tabId, message: structuredClone(message) }); return responses.shift() || { success: true }; },
    async reloadTab() {},
    async close(runId) { calls.closed.push(runId); return true; },
  };
  const chrome = { runtime: { lastError: null }, storage: { local: {
    async get(key) { return { [key]: status[key] }; },
    async set(value) { Object.assign(status, structuredClone(value)); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete status[key]; },
  } } };
  const sessions = {
    async get() { return { attemptId: 'attempt', environmentId: options.environmentId || 'local', producer: options.producer || 'test' }; },
    async attachTab() { return { attemptId: 'attempt' }; },
  };
  return { resource, chrome, sessions, status, calls };
}

test('traffic collection sends the same raw manualSync command for V1/V2 owner controls', async () => {
  const api = load();
  const fake = harness([{ success: true, trafficReceipt: { complete: true } }], { producer: 'dashboard.wing_sales' });
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'wing-status', cancelKey: 'wing-cancel', delay: async () => {} });
  const control = { attemptId: 'attempt', plan: { startDate: '2026-09-01', endDate: '2026-09-06', targetUrl: 'https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-01&end_date=2026-09-06', parserVersion: 'wing-traffic-v2' } };
  const result = await collector.collectTraffic({ environmentId: 'local', attemptId: 'attempt', control });
  assert.equal(result.success, true);
  assert.equal(fake.calls.messages.length, 1);
  assert.deepEqual(fake.calls.messages[0].message, {
    action: 'manualSync',
    collectionRunId: 'attempt',
    collectionAttempt: 1,
    environmentId: 'local',
    syncMode: 'wing_traffic',
    wingTrafficControl: control,
  });
  assert.equal(fake.calls.created[0].url, control.plan.targetUrl);
});

test('itemwinner capture stays a single target and never inherits Ads resume policy', async () => {
  const api = load();
  const fake = harness([{ success: true, itemwinnerReceipt: { complete: true } }], { producer: 'dashboard.wing_kpi', environmentId: 'office' });
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'wing-status', cancelKey: 'wing-cancel', delay: async () => {} });
  const control = { attemptId: 'attempt', plan: { targetUrl: 'https://wing.coupang.com/tenants/seller-price-management' } };
  const result = await collector.collectItemwinner({ environmentId: 'office', attemptId: 'attempt', control });
  assert.equal(result.success, true);
  assert.equal(fake.calls.messages[0].message.syncMode, 'wing_itemwinner');
  assert.deepEqual(JSON.parse(JSON.stringify(fake.calls.messages[0].message.wingItemwinnerControl)), control);
  assert.equal(typeof collector.collectCampaigns, 'undefined');
});

test('Wing cancellation records a source-local marker and leaves cleanup to the active collector', async () => {
  const api = load();
  const fake = harness();
  fake.status['wing-status'] = { runId: 'attempt', status: 'running' };
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'wing-status', cancelKey: 'wing-cancel', delay: async () => {} });
  const result = await collector.cancelRun({ attemptId: 'attempt' });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { success: true, cancelled: true, runId: 'attempt' });
  assert.deepEqual(fake.calls.closed, []);
  assert.equal(fake.status['wing-cancel'].cancelled, true);
  assert.equal(fake.status['wing-cancel'].runId, 'attempt');
});

test('Wing cancellation requires the explicit owner attempt object', async () => {
  const api = load();
  const fake = harness();
  fake.status['wing-status'] = { runId: 'attempt', status: 'running' };
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'wing-status', cancelKey: 'wing-cancel', delay: async () => {} });
  await assert.rejects(collector.cancelRun('attempt'), /Collection attempt ID is required/);
  await assert.rejects(collector.cancelRun({ runId: 'attempt' }), /Collection attempt ID is required/);
  await assert.rejects(collector.cancelRun({ attemptId: '  ' }), /Collection attempt ID is required/);
  assert.equal(fake.status['wing-cancel'], undefined);
});

test('a later Wing run clears the prior source-local cancellation marker', async () => {
  const api = load();
  const fake = harness([{ success: true, trafficReceipt: { complete: true } }], { producer: 'dashboard.wing_sales', environmentId: 'office' });
  fake.status['wing-cancel'] = { cancelled: true, runId: 'previous' };
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'wing-status', cancelKey: 'wing-cancel', delay: async () => {} });
  const control = { attemptId: 'attempt', plan: { startDate: '2026-09-01', endDate: '2026-09-02' } };
  const result = await collector.collectTraffic({ environmentId: 'office', attemptId: 'attempt', control });
  assert.equal(result.success, true);
  assert.equal(fake.status['wing-cancel'], undefined);
});

test('a queued Wing collection observes cancellation before creating or messaging a tab', async () => {
  const api = load();
  const fake = harness([], { producer: 'dashboard.wing_sales' });
  fake.status['wing-cancel'] = { cancelled: true, runId: 'attempt' };
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'wing-status', cancelKey: 'wing-cancel', delay: async () => {} });
  const result = await collector.collectTraffic({
    environmentId: 'local', attemptId: 'attempt',
    control: { attemptId: 'attempt', plan: { startDate: '2026-09-01', endDate: '2026-09-02' } },
  });
  assert.equal(result.cancelled, true);
  assert.equal(result.errorCode, 'USER_CANCELLED');
  assert.deepEqual(fake.calls.created, []);
  assert.deepEqual(fake.calls.messages, []);
  assert.deepEqual(fake.calls.closed, []);
});

test('an in-flight Wing cancellation leaves tab cleanup to the owner acknowledgement', async () => {
  const api = load();
  const fake = harness([], { producer: 'dashboard.wing_sales' });
  fake.resource.waitForTabComplete = async () => {
    fake.status['wing-cancel'] = { cancelled: true, runId: 'attempt' };
  };
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'wing-status', cancelKey: 'wing-cancel', delay: async () => {} });
  const result = await collector.collectTraffic({
    environmentId: 'local', attemptId: 'attempt',
    control: { attemptId: 'attempt', plan: { startDate: '2026-09-01', endDate: '2026-09-02' } },
  });
  assert.equal(result.cancelled, true);
  assert.equal(result.errorCode, 'USER_CANCELLED');
  assert.deepEqual(fake.calls.messages, []);
  assert.deepEqual(fake.calls.closed, []);
});

test('a Wing session lost during readiness stops before sending and cleans the owned tab', async () => {
  const api = load();
  const fake = harness([], { producer: 'dashboard.wing_sales' });
  fake.resource.waitForTabComplete = async () => { fake.sessions.get = async () => null; };
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'wing-status', cancelKey: 'wing-cancel', delay: async () => {} });
  await assert.rejects(
    collector.collectTraffic({
      environmentId: 'local', attemptId: 'attempt',
      control: { attemptId: 'attempt', plan: { startDate: '2026-09-01', endDate: '2026-09-02' } },
    }),
    (error) => error.code === 'SOURCE_OWNER_UNAVAILABLE',
  );
  assert.deepEqual(fake.calls.messages, []);
  assert.deepEqual(fake.calls.closed, ['attempt']);
});

test('Wing collectors enforce exact target surfaces, authorities, and date ranges', async () => {
  const api = load();
  const trafficControl = { attemptId: 'attempt', plan: { startDate: '2026-09-01', endDate: '2026-09-02' } };
  const trafficFake = harness([{ success: true, trafficReceipt: { complete: true } }], { producer: 'dashboard.wing_sales' });
  const trafficCollector = api.create({ window: trafficFake.resource, chrome: trafficFake.chrome, sessions: trafficFake.sessions, statusKey: 'wing-status', cancelKey: 'wing-cancel', delay: async () => {} });
  const trafficResult = await trafficCollector.collectTraffic({ environmentId: 'local', attemptId: 'attempt', control: trafficControl });
  assert.equal(trafficResult.success, true);
  assert.equal(trafficFake.calls.created[0].url, 'https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-01&end_date=2026-09-02');

  const invalidTrafficTargets = [
    ['https://wing.coupang.com/tenants/orders', /매출분석/],
    ['https://user@wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-01&end_date=2026-09-02', /매출분석/],
    ['https://wing.coupang.com:443/tenants/business-insight/sales-analysis?start_date=2026-09-01&end_date=2026-09-02', /매출분석/],
    ['https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-02&end_date=2026-09-02', /범위를/],
  ];
  for (const [targetUrl, expectedError] of invalidTrafficTargets) {
    const fake = harness([], { producer: 'dashboard.wing_sales' });
    const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'wing-status', cancelKey: 'wing-cancel', delay: async () => {} });
    await assert.rejects(
      collector.collectTraffic({ environmentId: 'local', attemptId: 'attempt', control: { attemptId: 'attempt', plan: { ...trafficControl.plan, targetUrl } } }),
      expectedError,
    );
    assert.deepEqual(fake.calls.created, []);
  }

  const invalidItemwinnerTargets = [
    'https://advertising.coupang.com/marketing/dashboard/sales',
    'https://user@wing.coupang.com/tenants/seller-price-management',
    'https://wing.coupang.com:443/tenants/seller-price-management',
  ];
  for (const targetUrl of invalidItemwinnerTargets) {
    const fake = harness([], { producer: 'dashboard.wing_kpi' });
    const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'wing-status', cancelKey: 'wing-cancel', delay: async () => {} });
    await assert.rejects(
      collector.collectItemwinner({ environmentId: 'local', attemptId: 'attempt', control: { attemptId: 'attempt', plan: { targetUrl } } }),
      /아이템위너/,
    );
    assert.deepEqual(fake.calls.created, []);
  }
});
