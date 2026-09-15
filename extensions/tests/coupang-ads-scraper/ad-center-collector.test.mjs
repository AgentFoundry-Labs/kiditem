import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

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
  assert.equal(typeof collector.collectAccountDailyKpis, 'undefined');
  assert.equal(typeof collector.collectProfitabilitySlice, 'function');
});

const dashboardNotLoaded = {
  success: false,
  errorCode: 'AD_DASHBOARD_NOT_LOADED',
  error: '쿠팡 광고 대시보드 표를 불러오지 못했습니다. 페이지를 새로 고친 뒤 다시 시도해 주세요.',
};
const sweepControl = { attemptId: 'attempt', plan: { captureMode: 'campaign_sweep' } };

test('a campaign sweep reloads the tab once when the dashboard grid does not load, then fails with the dashboard reason', async () => {
  const api = load();
  const fake = harness([dashboardNotLoaded, dashboardNotLoaded], { producer: 'advertising.ad_sync' });
  const reloads = [];
  fake.resource.reloadTab = async (tabId) => { reloads.push(tabId); };
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });

  const result = await collector.collectCampaigns({ environmentId: 'local', attemptId: 'attempt', control: sweepControl });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'AD_DASHBOARD_NOT_LOADED');
  assert.equal(result.error, dashboardNotLoaded.error);
  assert.equal(result.attentionRequired, false, 'a dashboard that did not load is not a login problem');
  assert.deepEqual(reloads, [41], 'one reload and one more wait, then the sweep fails');
  assert.equal(fake.calls.messages.length, 2);
});

test('a campaign sweep continues when the dashboard grid loads after its reload, also after a resume handoff', async () => {
  const api = load();
  const complete = { success: true, campaignReceipt: { complete: true } };
  const resume = {
    success: false,
    resumeRequired: true,
    resumeUrl: 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
    progress: { current: 12, total: 31, completed: 0, failed: 0, label: '12일' },
  };
  for (const responses of [[dashboardNotLoaded, complete], [resume, dashboardNotLoaded, complete]]) {
    const fake = harness(responses.map((response) => structuredClone(response)), { producer: 'advertising.ad_sync' });
    const reloads = [];
    fake.resource.reloadTab = async (tabId) => { reloads.push(tabId); };
    const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });

    const result = await collector.collectCampaigns({ environmentId: 'local', attemptId: 'attempt', control: sweepControl });

    assert.equal(result.success, true, JSON.stringify(result));
    assert.deepEqual(reloads, [41]);
    assert.equal(fake.calls.messages.length, responses.length);
  }
});

test('a campaign sweep keeps Coupang dialogs from blocking its page and restores them when the sweep ends', async () => {
  const api = load();
  const events = [];
  const scripts = [];
  let sends = 0;
  const fake = harness([], {
    producer: 'advertising.ad_sync',
    sendMessageWhenReady: async ({ tabId }) => {
      sends += 1;
      events.push(`message:${tabId}`);
      return sends === 1
        ? {
          success: false,
          resumeRequired: true,
          resumeUrl: 'https://advertising.coupang.com/marketing/dashboard/sales',
          progress: { current: 1, total: 31, completed: 0, failed: 0, label: 'retry' },
        }
        : { success: true, campaignReceipt: { complete: true } };
    },
  });
  fake.chrome.scripting = {
    async executeScript(details) {
      scripts.push(details);
      events.push(`page:${details.func.name}:${details.world}:${details.target.tabId}`);
      return [{ result: true }];
    },
  };
  const collector = api.create({ window: fake.resource, chrome: fake.chrome, sessions: fake.sessions, statusKey: 'ad-status', cancelKey: 'ad-cancel', delay: async () => {} });

  const result = await collector.collectCampaigns({ environmentId: 'local', attemptId: 'attempt', control: sweepControl });
  // The capture never waits for the page to get its dialogs back.
  await eventually(() => events.at(-1) === 'page:removeAdsDialogRecorder:MAIN:41');

  assert.equal(result.success, true, JSON.stringify(result));
  assert.deepEqual(events, [
    'page:installAdsDialogRecorder:MAIN:41',
    'message:41',
    'page:installAdsDialogRecorder:MAIN:41',
    'message:41',
    'page:removeAdsDialogRecorder:MAIN:41',
  ], 'each sweep document gets the recorder before its message, and the page gets its dialogs back afterwards');

  // chrome.scripting serializes each function into the page, so run the same
  // source text in a page world.
  const dom = new JSDOM('', { url: 'https://advertising.coupang.com/marketing/dashboard/sales', runScripts: 'outside-only' });
  try {
    const page = dom.getInternalVMContext();
    const nativeAlert = dom.window.alert;
    const nativeConfirm = dom.window.confirm;
    const install = scripts[0].func;
    const remove = scripts.at(-1).func;
    vm.runInContext(`(${install})()`, page);
    vm.runInContext(`(${install})()`, page);
    assert.equal(vm.runInContext('window.alert("세션이 만료되었습니다.")', page), undefined);
    assert.equal(vm.runInContext('window.confirm("이 페이지를 떠나시겠습니까?")', page), false);
    assert.deepEqual(JSON.parse(dom.window.sessionStorage.getItem('kiditem_ads_dialog_log_v1')), [
      { seq: 1, kind: 'alert', message: '세션이 만료되었습니다.' },
      { seq: 2, kind: 'confirm', message: '이 페이지를 떠나시겠습니까?' },
    ]);
    vm.runInContext(`(${remove})()`, page);
    assert.equal(dom.window.alert, nativeAlert);
    assert.equal(dom.window.confirm, nativeConfirm);
  } finally {
    dom.window.close();
  }
});

async function eventually(predicate, turns = 200) {
  for (let turn = 0; turn < turns; turn += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('the expected page work did not happen');
}

function within(promise, milliseconds, message) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const dialogBlockedReason = '쿠팡 광고 화면이 알림 창에 멈춰 수집을 진행하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';

function sweepCollector(api, fake) {
  return api.create({
    window: fake.resource,
    chrome: fake.chrome,
    sessions: fake.sessions,
    statusKey: 'ad-status',
    cancelKey: 'ad-cancel',
    delay: async () => {},
    pageScriptTimeoutMs: 20,
  });
}

test('a sweep page held by a native dialog is reloaded once, then the capture fails instead of waiting forever', async () => {
  const api = load();
  const fake = harness([], { producer: 'advertising.ad_sync' });
  const reloads = [];
  fake.resource.reloadTab = async (tabId) => { reloads.push(tabId); };
  // A page held by a native dialog never answers a script.
  fake.chrome.scripting = { executeScript: () => new Promise(() => {}) };

  const result = await within(
    sweepCollector(api, fake).collectCampaigns({ environmentId: 'local', attemptId: 'attempt', control: sweepControl }),
    2000,
    'the capture waited on a page held by a dialog',
  );

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'AD_PAGE_DIALOG_BLOCKED');
  assert.equal(result.error, dialogBlockedReason);
  assert.equal(result.attentionRequired, false);
  assert.deepEqual(reloads, [41], 'one reload closes the dialog before the capture gives up');
  assert.equal(fake.calls.messages.length, 0);
});

test('a sweep page freed by its reload takes the recorder and the sweep continues', async () => {
  const api = load();
  const fake = harness([{ success: true, campaignReceipt: { complete: true } }], { producer: 'advertising.ad_sync' });
  const reloads = [];
  fake.resource.reloadTab = async (tabId) => { reloads.push(tabId); };
  let installs = 0;
  fake.chrome.scripting = {
    executeScript: (details) => {
      if (details.func.name !== 'installAdsDialogRecorder') return Promise.resolve([{ result: true }]);
      installs += 1;
      return installs === 1 ? new Promise(() => {}) : Promise.resolve([{ result: true }]);
    },
  };

  const result = await within(
    sweepCollector(api, fake).collectCampaigns({ environmentId: 'local', attemptId: 'attempt', control: sweepControl }),
    2000,
    'the capture waited on a page held by a dialog',
  );

  assert.equal(result.success, true, JSON.stringify(result));
  assert.deepEqual(reloads, [41]);
  assert.equal(installs, 2);
  assert.equal(fake.calls.messages.length, 1);
});

test('restoring the page dialogs never holds a finished capture open', async () => {
  const api = load();
  const fake = harness([{ success: true, campaignReceipt: { complete: true } }], { producer: 'advertising.ad_sync' });
  const removals = [];
  fake.chrome.scripting = {
    executeScript: (details) => {
      if (details.func.name !== 'removeAdsDialogRecorder') return Promise.resolve([{ result: true }]);
      removals.push(details.target.tabId);
      return new Promise(() => {});
    },
  };

  const result = await within(
    sweepCollector(api, fake).collectCampaigns({ environmentId: 'local', attemptId: 'attempt', control: sweepControl }),
    2000,
    'the capture waited for the page to get its dialogs back',
  );

  assert.equal(result.success, true, JSON.stringify(result));
  await eventually(() => removals.length === 1);
});

test('the dialog recorder goes only into the Coupang advertising page the collector opened', async () => {
  const api = load();
  const fake = harness([{ success: true, campaignReceipt: { complete: true } }], { producer: 'advertising.ad_sync' });
  fake.resource.getTab = async () => ({ id: 41, windowId: 7, status: 'complete', url: 'https://xauth.coupang.com/login' });
  const scripts = [];
  fake.chrome.scripting = {
    async executeScript(details) {
      scripts.push(details.func.name);
      return [{ result: true }];
    },
  };

  const result = await sweepCollector(api, fake).collectCampaigns({ environmentId: 'local', attemptId: 'attempt', control: sweepControl });
  for (let turn = 0; turn < 20; turn += 1) await new Promise((resolve) => setImmediate(resolve));

  assert.equal(result.success, true, JSON.stringify(result));
  assert.deepEqual(scripts, []);
});

test('a known collector failure is not read as a login problem even when the quoted Coupang text mentions login', async () => {
  const api = load();
  const quotedLogin = {
    success: false,
    errorCode: 'AD_DASHBOARD_NOT_LOADED',
    error: "쿠팡 광고 대시보드 표를 불러오지 못했습니다. 페이지를 새로 고친 뒤 다시 시도해 주세요. 쿠팡 알림: '로그인 세션이 만료되었습니다.'",
  };
  const fake = harness([quotedLogin, structuredClone(quotedLogin)], { producer: 'advertising.ad_sync' });

  const result = await sweepCollector(api, fake).collectCampaigns({ environmentId: 'local', attemptId: 'attempt', control: sweepControl });

  assert.equal(result.attentionRequired, false);
  assert.equal(result.reason, null);

  const uncoded = harness([{ success: false, error: '쿠팡 광고센터 로그인이 필요합니다.' }], { producer: 'advertising.ad_sync' });
  const uncodedResult = await sweepCollector(api, uncoded).collectCampaigns({ environmentId: 'local', attemptId: 'attempt', control: sweepControl });
  assert.equal(uncodedResult.attentionRequired, true, 'an uncoded login failure still asks the operator to log in');
});
