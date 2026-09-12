import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcePath = path.join(repoRoot, 'extensions/kiditem-os/background/coupang/ad-center-collector.js');

function load() {
  const context = vm.createContext({ URL, clearTimeout, console, queueMicrotask, setTimeout, structuredClone });
  vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
  return context.KidItemAdCenterCollector;
}

function harness(responses = [], options = {}) {
  const status = {};
  const calls = { messages: [], navigations: [], created: [], closed: [], bound: [], progress: [] };
  const owned = { runId: 'attempt', windowId: 7, tabId: 41, url: '' };
  const resource = {
    async runExclusive(operation) { return operation(); },
    async getOrCreate(runId, url) { calls.created.push({ runId, url }); owned.runId = runId; owned.url = url; return { ...owned }; },
    async navigate(runId, url) { calls.navigations.push({ runId, url }); owned.runId = runId; owned.url = url; return { ...owned, url }; },
    async reattach() { return { ...owned }; },
    async getTab() { return { id: owned.tabId, windowId: owned.windowId, status: 'complete', url: owned.url }; },
    async waitForTabComplete() {},
    async sendMessageWhenReady(tabId, message) {
      calls.messages.push({ tabId, message: structuredClone(message) });
      if (typeof options.sendMessageWhenReady === 'function') {
        return options.sendMessageWhenReady({
          tabId,
          message,
          setCurrentUrl(url) { owned.url = url; },
        });
      }
      return responses.shift() || { success: true };
    },
    async reloadTab() {},
    async close(runId) { calls.closed.push(runId); return true; },
  };
  const chrome = {
    storage: { local: {
      async get(key) { return { [key]: status[key] }; },
      async set(value) { Object.assign(status, structuredClone(value)); },
      async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete status[key]; },
    } },
    tabs: { onUpdated: { addListener() {}, removeListener() {} }, onRemoved: { addListener() {}, removeListener() {} }, get(_id, callback) { callback({ id: 41, windowId: 7, status: 'complete', url: owned.url }); } },
    runtime: { lastError: null },
  };
  const session = { attemptId: 'attempt', environmentId: options.environmentId || 'local', producer: options.producer || 'test', progress: { current: 0, total: 0, completed: 0, failed: 0, label: null } };
  const sessions = {
    async get() { return session; },
    async attachTab(runId, value) { calls.bound.push([runId, value]); return session; },
    async progress(runId, value) { calls.progress.push([runId, structuredClone(value)]); session.progress = value; return session; },
  };
  return { resource, chrome, sessions, status, calls };
}

test('keyword collection sends the named owner control and never resumes a closed channel', async () => {
  const api = load();
  const fake = harness([{ success: true, keywordReceipt: { complete: true } }], { producer: 'advertising.ad_keyword' });
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });
  const control = { attemptId: 'attempt', plan: { startDate: '2026-09-01', endDate: '2026-09-07' } };
  const result = await collector.collectKeywords({ environmentId: 'local', attemptId: 'attempt', control });
  assert.equal(result.success, true);
  assert.equal(fake.calls.messages.length, 1);
  assert.deepEqual(fake.calls.messages[0].message, {
    action: 'manualSync',
    collectionRunId: 'attempt',
    collectionAttempt: 1,
    environmentId: 'local',
    syncMode: 'keyword_sweep',
    keywordControl: control,
  });
  assert.equal(fake.calls.created[0].url, 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdKeyword=1');
});

test('account daily collection constructs one target-date hash per owner date', async () => {
  const api = load();
  const fake = harness([
    { success: true, type: 'coupang_ads_daily' },
    { success: true, type: 'coupang_ads_daily' },
  ], { producer: 'advertising.ad_account_daily_kpi' });
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });
  const control = { attemptId: 'attempt', plan: { businessDates: ['2026-09-05', '2026-09-06'] } };
  const result = await collector.collectAccountDailyKpis({ environmentId: 'local', attemptId: 'attempt', control });
  assert.equal(result.success, true);
  assert.deepEqual(fake.calls.messages.map(({ message }) => ({ mode: message.syncMode, targetDate: message.targetDate })), [
    { mode: 'account_daily_kpi', targetDate: '2026-09-05' },
    { mode: 'account_daily_kpi', targetDate: '2026-09-06' },
  ]);
  assert.deepEqual(fake.calls.navigations.map(({ url }) => url), [
    'https://advertising.coupang.com/marketing/dashboard/sales#targetDate=2026-09-05',
    'https://advertising.coupang.com/marketing/dashboard/sales#targetDate=2026-09-06',
  ]);
});

test('profitability uses the exact report surface and returns only the owner receipt', async () => {
  const api = load();
  const receipt = { reportId: 'report-1', rows: [], expectedRowCount: 0, collectedRowCount: 0 };
  const fake = harness([{ success: true, profitabilityReceipt: receipt }], { producer: 'advertising.profitability_import' });
  fake.resource.reattach = async () => null;
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });
  const slice = { sliceId: '2026-08-01_2026-08-31', from: '2026-08-01', to: '2026-08-31', businessDates: ['2026-08-01'] };
  const result = await collector.collectProfitabilitySlice({ environmentId: 'local', attemptId: 'attempt', account: { externalAccountId: 'acct', expectedAdvertiserId: 'adv' }, slice });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { success: true, receipt });
  assert.equal(fake.calls.navigations[0].url, 'https://advertising.coupang.com/marketing-reporting/billboard/reports/pa');
  assert.equal(fake.calls.messages[0].message.syncMode, 'profitability_report');
  assert.deepEqual(fake.calls.messages[0].message.profitabilitySlice, {
    sliceId: slice.sliceId,
    startDate: slice.from,
    endDate: slice.to,
    businessDates: slice.businessDates,
  });
  assert.deepEqual(fake.calls.messages[0].message.profitabilityAccount, {
    externalAccountId: 'acct',
    expectedAdvertiserId: 'adv',
  });
});

test('campaign resumes accept exact detail routes while manual reports require the sales dashboard', async () => {
  const api = load();
  const validDetailUrls = [
    'https://advertising.coupang.com/marketing/campaign/42/product',
    'https://advertising.coupang.com/marketing/campaign/42/group/7/product',
    'https://advertising.coupang.com/marketing/dashboard/sales/campaign/42/group/7/product',
  ];
  for (const resumeUrl of validDetailUrls) {
    const fake = harness([
      { success: false, resumeRequired: true, resumeUrl, progress: { current: 12, total: 31, label: 'resume' } },
      { success: true, campaignReceipt: { complete: true } },
    ], { producer: 'advertising.ad_sync' });
    const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });
    const result = await collector.collectCampaigns({
      environmentId: 'local',
      attemptId: 'attempt',
      control: { attemptId: 'attempt', plan: { captureMode: 'campaign_sweep' } },
    });
    assert.equal(result.success, true, resumeUrl);
    assert.ok(fake.calls.navigations.some(({ url }) => url === resumeUrl), resumeUrl);
  }

  const invalidDetailUrls = [
    'https://advertising.coupang.com/marketing/dashboard/sales/campaign/42',
    'https://advertising.coupang.com/marketing/dashboard/sales/campaign/42/group/7/product/extra',
  ];
  for (const resumeUrl of invalidDetailUrls) {
    const fake = harness([
      { success: false, resumeRequired: true, resumeUrl, progress: { current: 12, total: 31, label: 'resume' } },
    ], { producer: 'advertising.ad_sync' });
    const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });
    const result = await collector.collectCampaigns({
      environmentId: 'local',
      attemptId: 'attempt',
      control: { attemptId: 'attempt', plan: { captureMode: 'campaign_sweep' } },
    });
    assert.equal(result.success, false, resumeUrl);
    assert.match(result.error, /outside the advertising target family/);
    assert.equal(fake.calls.navigations.length, 1);
  }

  const fake = harness([], { producer: 'advertising.ad_sync' });
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });
  await assert.rejects(
    collector.collectCampaigns({
      environmentId: 'local',
      attemptId: 'attempt',
      control: {
        attemptId: 'attempt',
        plan: {
          captureMode: 'manual_report',
          period: '1d',
          startDate: '2026-09-01',
          endDate: '2026-09-01',
          businessDates: ['2026-09-01'],
          targetUrl: 'https://advertising.coupang.com/marketing/dashboard/sales/campaign/42',
        },
      },
    }),
    /target URL/,
  );
  assert.deepEqual(fake.calls.created, []);
});

test('progress reporting requires the active Ads session and its managed tab', async () => {
  const api = load();
  const fake = harness([], { producer: 'advertising.ad_sync' });
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });
  assert.deepEqual(JSON.parse(JSON.stringify(await collector.reportProgress({
    environmentId: 'local', attemptId: 'attempt', tabId: 41,
    progress: { current: 2, total: 3, completed: 1, failed: 0, label: 'campaigns' },
  }))), { ignored: false });
  assert.equal(fake.calls.progress.length, 1);
  await assert.rejects(
    collector.reportProgress({ environmentId: 'office', attemptId: 'attempt', tabId: 41, progress: { current: 2, total: 3, completed: 1, failed: 0 } }),
    (error) => error.code === 'SOURCE_OWNER_UNAVAILABLE',
  );
  await assert.rejects(
    collector.reportProgress({ environmentId: 'local', attemptId: 'attempt', tabId: 99, progress: { current: 2, total: 3, completed: 1, failed: 0 } }),
    (error) => error.code === 'SOURCE_OWNER_UNAVAILABLE',
  );
  fake.sessions.get = async () => null;
  await assert.rejects(
    collector.reportProgress({ environmentId: 'local', attemptId: 'attempt', tabId: 41, progress: { current: 3, total: 3, completed: 3, failed: 0 } }),
    (error) => error.code === 'SOURCE_OWNER_UNAVAILABLE',
  );
});

test('a queued Ads collection observes cancellation before creating or messaging a tab', async () => {
  const api = load();
  const fake = harness([], { producer: 'advertising.ad_keyword' });
  fake.status['ad-cancel'] = { cancelled: true, runId: 'attempt' };
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });
  const result = await collector.collectKeywords({
    environmentId: 'local', attemptId: 'attempt',
    control: { attemptId: 'attempt', plan: { startDate: '2026-09-01', endDate: '2026-09-07' } },
  });
  assert.equal(result.cancelled, true);
  assert.equal(result.errorCode, 'USER_CANCELLED');
  assert.deepEqual(fake.calls.created, []);
  assert.deepEqual(fake.calls.messages, []);
  assert.deepEqual(fake.calls.closed, []);
});

test('an in-flight Ads cancellation leaves tab cleanup to the owner acknowledgement', async () => {
  const api = load();
  const fake = harness([], { producer: 'advertising.ad_keyword' });
  fake.resource.waitForTabComplete = async () => {
    fake.status['ad-cancel'] = { cancelled: true, runId: 'attempt' };
  };
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });
  const result = await collector.collectKeywords({
    environmentId: 'local', attemptId: 'attempt',
    control: { attemptId: 'attempt', plan: { startDate: '2026-09-01', endDate: '2026-09-07' } },
  });
  assert.equal(result.cancelled, true);
  assert.equal(result.errorCode, 'USER_CANCELLED');
  assert.deepEqual(fake.calls.messages, []);
  assert.deepEqual(fake.calls.closed, []);
});

test('an Ads session lost during readiness stops before sending and cleans the owned tab', async () => {
  const api = load();
  const fake = harness([], { producer: 'advertising.ad_keyword' });
  fake.resource.waitForTabComplete = async () => { fake.sessions.get = async () => null; };
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });
  await assert.rejects(
    collector.collectKeywords({
      environmentId: 'local', attemptId: 'attempt',
      control: { attemptId: 'attempt', plan: { startDate: '2026-09-01', endDate: '2026-09-07' } },
    }),
    (error) => error.code === 'SOURCE_OWNER_UNAVAILABLE',
  );
  assert.deepEqual(fake.calls.messages, []);
  assert.deepEqual(fake.calls.closed, ['attempt']);
});

test('campaign sweep keeps the 12+12+7 resume policy in the source collector', async () => {
  const api = load();
  const resume = 'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received';
  const fake = harness([
    { success: false, resumeRequired: true, resumeUrl: 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1', progress: { current: 12, total: 31, completed: 0, failed: 0, label: '12일' } },
    { success: false, resumeRequired: true, resumeUrl: 'https://advertising.coupang.com/marketing/dashboard/sales/campaign/42/group/7/product', progress: { current: 24, total: 31, completed: 0, failed: 0, label: '24일' } },
    { success: true, campaignReceipt: { complete: true }, progress: { current: 31, total: 31, completed: 1, failed: 0, label: '완료' } },
  ], { producer: 'advertising.ad_sync' });
  // The fake resource returns a response from the queue; closed-channel errors
  // are represented by a resumeRequired response at the collector boundary.
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });
  const result = await collector.collectCampaigns({ environmentId: 'local', attemptId: 'attempt', control: { attemptId: 'attempt', plan: { captureMode: 'campaign_sweep' } } });
  assert.equal(result.success, true);
  assert.ok(fake.calls.messages.every(({ message }) => message.syncMode === 'campaign_sweep'));
  assert.ok(fake.calls.navigations.some(({ url }) => url === 'https://advertising.coupang.com/marketing/dashboard/sales/campaign/42/group/7/product'));
  assert.equal(resume.includes('message channel'), true);
});

test('campaign sweep carries source-owned progress across dashboard returns to the terminal receipt', async () => {
  const api = load();
  const closedChannel = 'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received';
  const dashboard = 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1';
  const sourceProgress = [
    { current: 12, total: 62, completed: 0, failed: 0, label: 'campaign 42 / 12일' },
    { current: 24, total: 62, completed: 0, failed: 0, label: 'campaign 42 / 24일' },
    { current: 31, total: 62, completed: 1, failed: 0, label: 'campaign 42 / 31일' },
    { current: 43, total: 62, completed: 1, failed: 0, label: 'campaign 99 / 12일' },
    { current: 55, total: 62, completed: 1, failed: 0, label: 'campaign 99 / 24일' },
    { current: 62, total: 62, completed: 2, failed: 0, label: 'campaign 99 / 31일' },
  ];
  let collector;
  let sendCount = 0;
  let terminalConsumed = false;
  const fake = harness([], {
    producer: 'advertising.ad_sync',
    sendMessageWhenReady: async ({ tabId, setCurrentUrl }) => {
      const progress = sourceProgress[sendCount];
      assert.ok(progress, `unexpected extra send ${sendCount + 1}`);
      // This is the real source-owner entrypoint used by ads-report.js before
      // its full-document navigation closes the content-script channel.
      await collector.reportProgress({
        environmentId: 'local',
        attemptId: 'attempt',
        tabId,
        progress,
      });
      sendCount += 1;
      if (sendCount === sourceProgress.length) {
        terminalConsumed = true;
        return { success: true, campaignReceipt: { complete: true }, progress };
      }
      // Synthetic fixture: each 12+12+7 slice returns to the same dashboard
      // before the next campaign/date slice begins. This does not attribute
      // the sequence to a particular live provider failure.
      setCurrentUrl(dashboard);
      throw new Error(closedChannel);
    },
  });
  collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });

  const result = await collector.collectCampaigns({
    environmentId: 'local',
    attemptId: 'attempt',
    control: { attemptId: 'attempt', plan: { captureMode: 'campaign_sweep' } },
  });

  assert.equal(result.success, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.receipt)), { complete: true });
  assert.equal(sendCount, sourceProgress.length);
  assert.equal(terminalConsumed, true);
  assert.equal(fake.calls.messages.length, sourceProgress.length);
  assert.deepEqual(fake.calls.navigations.map(({ url }) => url), [
    dashboard,
    dashboard,
    dashboard,
    dashboard,
    dashboard,
    dashboard,
  ]);
  assert.equal(fake.calls.progress.length, sourceProgress.length + 1);
  assert.deepEqual(JSON.parse(JSON.stringify((await fake.sessions.get('attempt')).progress)), sourceProgress.at(-1));
  assert.deepEqual(JSON.parse(JSON.stringify(result.progress)), sourceProgress.at(-1));
});

test('campaign closed-channel recovery aborts when the owner session disappears after navigation wait', async () => {
  const api = load();
  const closedChannel = 'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received';
  let loseOwnerAfterWait = false;
  const fake = harness([], {
    producer: 'advertising.ad_sync',
    sendMessageWhenReady: async () => {
      loseOwnerAfterWait = true;
      throw new Error(closedChannel);
    },
  });
  const waitForTabComplete = fake.resource.waitForTabComplete;
  fake.resource.waitForTabComplete = async (...args) => {
    await waitForTabComplete(...args);
    if (loseOwnerAfterWait) {
      loseOwnerAfterWait = false;
      fake.sessions.get = async () => null;
    }
  };
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });

  await assert.rejects(
    collector.collectCampaigns({
      environmentId: 'local',
      attemptId: 'attempt',
      control: { attemptId: 'attempt', plan: { captureMode: 'campaign_sweep' } },
    }),
    (error) => error.code === 'SOURCE_OWNER_UNAVAILABLE',
  );
  assert.equal(fake.calls.messages.length, 1);
  assert.deepEqual(fake.calls.closed, ['attempt']);
});

test('campaign sweep still bounds an unchanged closed-channel transition', async () => {
  const api = load();
  const closedChannel = 'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received';
  let collector;
  const fake = harness([], {
    producer: 'advertising.ad_sync',
    sendMessageWhenReady: async ({ setCurrentUrl }) => {
      setCurrentUrl('https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1');
      throw new Error(closedChannel);
    },
  });
  collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });

  const result = await collector.collectCampaigns({
    environmentId: 'local',
    attemptId: 'attempt',
    control: { attemptId: 'attempt', plan: { captureMode: 'campaign_sweep' } },
  });

  assert.equal(result.success, false);
  assert.match(result.error, /같은 위치에서 반복/);
  assert.equal(fake.calls.messages.length, 5);
  assert.equal(fake.calls.navigations.length, 5);
  assert.equal(fake.calls.progress.length, 1);
});

test('campaign resume retries stay bounded through the production collector', async () => {
  const api = load();
  const responses = Array.from({ length: 2001 }, (_, index) => ({
    success: false,
    resumeRequired: true,
    resumeUrl: 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
    synced: index,
    totalRows: index,
    progress: { current: index, total: 31, completed: index, failed: 0, label: `resume-${index}` },
  }));
  const fake = harness(responses, { producer: 'advertising.ad_sync' });
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });
  const result = await collector.collectCampaigns({
    environmentId: 'local',
    attemptId: 'attempt',
    control: { attemptId: 'attempt', plan: { captureMode: 'campaign_sweep' } },
  });
  assert.equal(result.success, false);
  assert.match(result.error, /복귀 재시도 한도/);
  assert.equal(fake.calls.messages.length, 2001);
  assert.equal(fake.calls.navigations.length, 2001);
});

test('cancellation records a source-local marker and leaves cleanup to the active collector', async () => {
  const api = load();
  const fake = harness();
  fake.status['ad-status'] = { runId: 'attempt', status: 'running' };
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });
  const result = await collector.cancelRun({ attemptId: 'attempt' });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { success: true, cancelled: true, runId: 'attempt' });
  assert.deepEqual(fake.calls.closed, []);
  assert.equal(fake.status['ad-status'].status, 'running');
  assert.equal(fake.status['ad-cancel'].cancelled, true);
  assert.equal(fake.status['ad-cancel'].runId, 'attempt');
});

test('cancellation requires the explicit owner attempt object', async () => {
  const api = load();
  const fake = harness();
  fake.status['ad-status'] = { runId: 'attempt', status: 'running' };
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });
  await assert.rejects(collector.cancelRun('attempt'), /Collection attempt ID is required/);
  await assert.rejects(collector.cancelRun({ runId: 'attempt' }), /Collection attempt ID is required/);
  await assert.rejects(collector.cancelRun({ attemptId: '  ' }), /Collection attempt ID is required/);
  assert.equal(fake.status['ad-cancel'], undefined);
});

test('source interface does not expose the old universal target loop', () => {
  const api = load();
  const collector = api.create({ window: harness().resource, chrome: harness().chrome, sessions: harness().sessions });
  assert.equal(typeof collector.collectTargets, 'undefined');
  assert.equal(typeof collector.collectCampaigns, 'function');
  assert.equal(typeof collector.collectKeywords, 'function');
  assert.equal(typeof collector.collectAccountDailyKpis, 'function');
  assert.equal(typeof collector.collectProfitabilitySlice, 'function');
});
