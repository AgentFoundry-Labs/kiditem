import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const source = fs.readFileSync(
  path.join(repoRoot, "extensions/kiditem-os/content/coupang/ads-report.js"),
  "utf8",
);

const CAMPAIGN_URL =
  "https://advertising.coupang.com/marketing/dashboard/sales/campaign/104640375/group/205034227/product";

function loadContract(options = {}) {
  const location = options.location || {
    href: CAMPAIGN_URL,
    pathname: "/marketing/dashboard/sales/campaign/104640375/group/205034227/product",
    search: "",
    hash: "",
  };
  const sent = [];
  const listeners = [];
  const context = vm.createContext({
    chrome: {
      runtime: {
        lastError: null,
        onMessage: { addListener(listener) { listeners.push(listener); } },
        sendMessage(message, callback) {
          sent.push(message);
          if (options.onMessage) return options.onMessage(message, callback);
          callback?.(options.syncResponse ?? { success: true });
        },
      },
      storage: { local: { set() {} } },
    },
    console: { log() {}, warn() {}, error() {} },
    document: {
      querySelector: () => null,
      querySelectorAll: (selector) => selector === 'dt' && options.advertiserId
        ? [{ textContent: '업체코드', nextElementSibling: { textContent: options.advertiserId } }] : [],
      title: "광고센터",
    },
    history: { back() {} },
    location,
    sessionStorage: {
      getItem: () => null,
      removeItem() {},
      setItem() {},
    },
    setTimeout: (fn) => {
      if (typeof fn === "function") fn();
      return 0;
    },
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    showBadge() {},
    fetch: options.fetch || (async () => ({ ok: false, status: 500, text: async () => "" })),
    AbortController: class {
      constructor() {
        this.signal = {};
      }
      abort() {}
    },
    URL,
    URLSearchParams,
    ...(options.Date ? { Date: options.Date } : {}),
  });
  context.window = context;
  context.window.location = location;
  vm.runInContext(source, context, { filename: "ads-report.js" });
  return { contract: context.KidItemAdsReportContract, sent,
    message: (value) => new Promise(resolve => { for (const listener of listeners) listener(value, {}, resolve); }) };
}

// Values built inside the vm realm carry that realm's prototypes, so strict
// deep equality fails on structurally identical objects. Compare plain clones.
const plain = (value) => JSON.parse(JSON.stringify(value));

function jsonResponse(data) {
  return { ok: true, status: 200, text: async () => JSON.stringify(data) };
}

function keywordHarness(options = {}) {
  const control = options.control || { attemptId: '11111111-1111-4111-8111-111111111111',
    state: 'RUNNING', expiresAt: '2030-01-02T00:00:00.000Z',
    plan: { expectedAdvertiserId: 'A0001', startDate: '2026-08-30', endDate: '2026-09-05', windowDays: 7 },
    roster: null, queue: [] };
  const h = loadContract({ advertiserId: 'A0001', ...options,
    onMessage(message, callback) {
      if (message.action !== 'advertisingKeywordSourceStep') return callback({ success: true });
      const { step, body, sequence } = message;
      if (step === 'checkpoint') return callback({ success: true });
      if (step === 'roster') {
        control.roster = plain(body);
        control.queue = structuredClone(options.rosterQueue || []);
      }
      if (step === 'group_plan') control.queue[sequence].plan = plain(body);
      if (step === 'group_result') control.queue[sequence].resultComplete = true;
      callback({ success: true, control: structuredClone(control) });
    } });
  return { ...h, control, run: () => h.message({ action: 'manualSync', collectionRunId: control.attemptId,
    collectionAttempt: 1, environmentId: 'local', syncMode: 'keyword_sweep', keywordControl: structuredClone(control) }) };
}

test('manual keyword continuation reuses frozen ads and dates and sends only fenced group evidence', async () => {
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const control = { attemptId, state: 'RUNNING', expiresAt: '2030-01-02T00:00:00.000Z',
    plan: { expectedAdvertiserId: 'A0001', startDate: '2026-08-30', endDate: '2026-09-05', windowDays: 7 },
    roster: { campaigns: [], pages: [] }, queue: [{ key: '104640375:205034227', campaignId: '104640375',
      campaignIdentity: 'campaign:104640375', campaignName: '동결 캠페인', adGroupId: '205034227', sequence: 0,
      plan: { adGroupName: '동결 그룹', ads: [{ adId: '801', vendorItemId: '901', itemName: '상품', isActive: true }] }, resultComplete: false }] };
  const fetches = [], receipts = [];
  const h = loadContract({ advertiserId: 'A0001',
    fetch: async (url, init) => {
      fetches.push({ url, body: init?.body && JSON.parse(init.body) });
      if (url === '/marketing/cmg-api/tableMetric') return jsonResponse({ 연필: { impressions: 10, deliveredAdCost: 20 } });
      if (url === '/marketing/tetris-api/ad/keywords/801') return jsonResponse([]);
      throw new Error('frozen roster or ads were fetched again: ' + url);
    },
    onMessage(message, callback) {
      if (message.action === 'advertisingKeywordSourceStep') {
        if (message.step === 'group_result') { receipts.push(message); control.queue[0].resultComplete = true; }
        callback({ success: true, control: structuredClone(control) });
      } else callback({ success: true });
    } });
  const result = await h.message({ action: 'manualSync', collectionRunId: attemptId, collectionAttempt: 1,
    environmentId: 'local', syncMode: 'keyword_sweep', keywordControl: structuredClone(control) });
  assert.equal(result.success, true, result.error);
  assert.equal(result.keywordReceipt.complete, true);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].attemptId, attemptId);
  assert.equal(receipts[0].body.advertiserId, 'A0001');
  assert.deepEqual(plain(receipts[0].body.ads), [{ adId: '801', metricsOk: true, registeredOk: true }]);
  assert.equal(receipts[0].body.rows[0].adGroup, '동결 그룹');
  assert.equal(receipts[0].body.rows[0].keyword, '연필');
  assert.equal(fetches.length, 2);
  assert.equal(fetches[0].body.start, Date.parse('2026-08-30T00:00:00+09:00'));
  assert.equal(fetches[0].body.end, Date.parse('2026-09-05T00:00:00+09:00'));
  assert.equal(h.sent.some(message => message.action === 'syncToServer'), false);
});

test('content exposes no duplicate server-owned keyword queue builder', () => {
  assert.equal(loadContract().contract.buildKeywordSweepQueue, undefined);
});

test('300-ad budget pauses between groups and a new tab resumes the same frozen remainder', async () => {
  const initial = keywordHarness().control;
  initial.roster = { campaigns: [], pages: [] };
  initial.queue = Array.from({ length: 6 }, (_, sequence) => ({ sequence, campaignId: '1', campaignName: 'camp',
    campaignIdentity: 'campaign:1', adGroupId: String(sequence), resultComplete: false,
    plan: { adGroupName: 'group', ads: Array.from({ length: 60 }, (_, i) => ({ adId: `${sequence}-${i}`, vendorItemId: `${sequence}-${i}`, isActive: true })) } }));
  const requested = [];
  const fetch = async (url) => { requested.push(url); return jsonResponse(url.includes('tableMetric') ? {} : []); };
  const first = keywordHarness({ control: initial, fetch });
  const paused = await first.run();
  assert.equal(paused.keywordReceipt.complete, false);
  assert.equal(paused.keywordReceipt.continuationRequired, true);
  assert.equal(paused.adCount, 300);
  assert.equal(paused.progress.completed, 5);
  assert.equal(requested.length, 600);
  const second = keywordHarness({ control: structuredClone(first.control), fetch });
  const completed = await second.run();
  assert.equal(completed.keywordReceipt.complete, true);
  assert.equal(completed.adCount, 60);
  assert.equal(requested.length, 720);
  assert.equal(requested.filter(url => url.endsWith('/ad/keywords/0-0')).length, 1);
  assert.equal(second.sent.some(m => m.step === 'roster' || m.step === 'group_plan' || m.action === 'syncToServer'), false);
});

test('10-minute budget is checked between groups and continuation keeps the frozen dates across midnight', async () => {
  let now = Date.parse('2026-09-06T14:59:00.000Z');
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const initial = keywordHarness().control;
  initial.roster = { campaigns: [], pages: [] };
  initial.queue = [0, 1].map(sequence => ({ sequence, campaignId: '1', campaignName: 'camp', campaignIdentity: 'campaign:1',
    adGroupId: String(sequence), resultComplete: false,
    plan: { adGroupName: 'group', ads: [{ adId: String(sequence), vendorItemId: String(sequence), isActive: true }] } }));
  const periods = [];
  const fetch = async (url, init) => {
    if (url.includes('tableMetric')) { periods.push(JSON.parse(init.body)); now += 600_000; return jsonResponse({}); }
    return jsonResponse([]);
  };
  const first = keywordHarness({ control: initial, fetch, Date: Clock });
  assert.equal((await first.run()).keywordReceipt.complete, false);
  assert.equal(first.control.queue[0].resultComplete, true);
  assert.equal(first.control.queue[1].resultComplete, false);
  const resumed = keywordHarness({ control: structuredClone(initial), fetch, Date: Clock });
  assert.equal((await resumed.run()).keywordReceipt.complete, true);
  assert.equal(periods.length, 2);
  assert.ok(periods.every(period => period.start === Date.parse('2026-08-30T00:00:00+09:00') && period.end === Date.parse('2026-09-05T00:00:00+09:00')));
});

test('confirmed empty roster and empty group send explicit coverage without keyword rows', async () => {
  for (const campaigns of [[], [{ id: 1, name: 'camp', groupList: [{ id: '2', name: 'group' }] }]]) {
    const h = keywordHarness({ rosterQueue: campaigns.length ? [{ sequence: 0, campaignId: '1', campaignName: 'camp',
      campaignIdentity: 'campaign:1', adGroupId: '2', plan: null, resultComplete: false }] : [],
      fetch: async url => jsonResponse(url.includes('/campaigns')
      ? { campaigns, pageInfo: { hasNextPage: false } } : { adGroup: { name: 'group', ads: [] } }) });
    const result = await h.run();
    assert.equal(result.keywordReceipt.complete, true);
    assert.equal(result.keywordCount, 0);
    const steps = h.sent.filter(m => m.action === 'advertisingKeywordSourceStep');
    assert.equal(steps.filter(m => m.step === 'roster').length, 1);
    const receipts = steps.filter(m => m.step === 'group_result');
    assert.equal(receipts.length, campaigns.length);
    if (receipts.length) assert.deepEqual(plain(receipts[0].body.ads), []);
  }
});

test('missing or mismatched visible advertiser identity fails before provider IO', async () => {
  for (const advertiserId of [null, 'OTHER']) {
    let providerCalls = 0;
    const h = keywordHarness({ advertiserId, fetch: async () => { providerCalls++; throw new Error('unexpected provider'); } });
    const result = await h.run();
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'ADVERTISER_IDENTITY_MISMATCH');
    assert.equal(providerCalls, 0);
    assert.equal(h.sent.some(m => m.action === 'advertisingKeywordSourceStep'), false);
  }
});

test("keyword-column button label never becomes a keyword value", () => {
  const { contract } = loadContract();
  // The `키워드` column in the ad product grid holds a modal-open button, so
  // reading it by header yielded the button label as the keyword on every row.
  assert.equal(contract.adKeywordControlLabel("키워드 보기"), "");
  assert.equal(contract.adKeywordControlLabel("키워드보기"), "");
  assert.equal(contract.adKeywordControlLabel("  키워드   보기 "), "");
  assert.equal(contract.adKeywordControlLabel("선택 상품"), "");
  assert.equal(contract.adKeywordControlLabel("버블문어"), "버블문어");
  assert.equal(contract.adKeywordControlLabel(""), "");
});

test("business-date epoch is KST midnight, and a single day is start === end", () => {
  const { contract } = loadContract();
  const day = contract.kstDayEpochMs("2026-07-30");
  assert.equal(day, Date.parse("2026-07-29T15:00:00.000Z"));
  assert.equal(contract.kstDayEpochMs("not-a-date"), null);
});

test("campaign/ad-group ids come from the detail route", () => {
  const { contract } = loadContract();
  assert.deepEqual(plain(contract.parseCampaignAdGroupRoute(CAMPAIGN_URL)), {
    campaignId: "104640375",
    adGroupId: "205034227",
  });
  assert.equal(
    contract.parseCampaignAdGroupRoute(
      "https://advertising.coupang.com/marketing/dashboard/sales",
    ),
    null,
  );
});

test("keyword metrics ask for a trailing multi-day window, never a single day", async () => {
  const requests = [];
  const { contract } = loadContract({
    fetch: async (url, init) => {
      requests.push({ url, body: init?.body ? JSON.parse(init.body) : null });
      return jsonResponse({ 버블문어: { impressions: 3, clicks: 1, deliveredAdCost: 120 } });
    },
  });

  const result = await contract.fetchAdKeywordMetrics("104640375", "541920849", "2026-07-30");

  assert.equal(result.ok, true);
  assert.deepEqual(plain(result.keywords), [
    {
      keyword: "버블문어",
      impressions: 3,
      clicks: 1,
      spend: 120,
      revenue: 0,
      conversions: 0,
      orders: 0,
    },
  ]);
  const [request] = requests;
  assert.equal(request.url, "/marketing/cmg-api/tableMetric");
  assert.equal(request.body.tableType, "keyword");
  assert.equal(request.body.creativeId, "541920849");
  // Verified live: start === end returns an empty keyword table even for an ad
  // with impressions that day. Coupang only breaks keywords out over a range.
  assert.notEqual(request.body.start, request.body.end);
  assert.equal(request.body.end, Date.parse("2026-07-29T15:00:00.000Z"));
  assert.equal(
    (request.body.end - request.body.start) / 86400000,
    6,
    "trailing 7-day window, both ends inclusive",
  );
});

test("the trailing window is inclusive on both ends", () => {
  const { contract } = loadContract();
  const window = contract.adKeywordWindow("2026-07-30");
  assert.equal(window.days, 7);
  assert.equal(window.startDate, "2026-07-24");
  assert.equal(window.endDate, "2026-07-30");
  // A caller asking for one day still gets a usable range, never start === end.
  assert.equal(contract.adKeywordWindow("2026-07-30", 1).days, 2);
  assert.equal(contract.adKeywordWindow("nope"), null);
});

test("ad-group read maps advertised options to their ad ids", async () => {
  const { contract } = loadContract({
    fetch: async () =>
      jsonResponse({
        adGroup: {
          name: "MBTI젤리",
          // Always empty on load — the keyword list is not here.
          ads: [
            {
              id: "541920849",
              vendorItemId: 95514044205,
              itemName: "캐릭터 문어발 비눗방울",
              isActive: true,
              approvedKeywords: [],
            },
            { id: "", vendorItemId: 1, itemName: "식별 불가" },
          ],
        },
      }),
  });

  const group = await contract.fetchAdGroupAds("104640375", "205034227");

  assert.equal(group.ok, true);
  assert.equal(group.adGroupName, "MBTI젤리");
  assert.deepEqual(plain(group.ads), [
    {
      adId: "541920849",
      vendorItemId: "95514044205",
      itemName: "캐릭터 문어발 비눗방울",
      isActive: true,
    },
  ]);
});

test("campaign keyword collection returns dated proof for its campaign owner without legacy upload", async () => {
  const { contract, sent } = loadContract({
    fetch: async (url, init) => {
      if (url.includes("/ad-group/")) {
        return jsonResponse({
          adGroup: {
            name: "MBTI젤리",
            ads: [
              {
                id: "541920849",
                vendorItemId: 95514044205,
                itemName: "캐릭터 문어발 비눗방울",
                isActive: true,
              },
            ],
          },
        });
      }
      if (url.includes("/ad/keywords/")) return jsonResponse([]);
      if (url.includes("tableMetric")) {
        return jsonResponse({
          버블문어: { impressions: 3, clicks: 0 },
          "콩순이 비눗방울": { impressions: 1, clicks: 0 },
          "": { impressions: 9 },
        });
      }
      return { ok: false, status: 404, text: async () => "" };
    },
  });

  const result = await contract.collectCampaignKeywords(
    { name: "쿠팡윙 집중광고", identity: "campaign:104640375" },
    "2026-07-30",
  );

  assert.equal(result.ok, true);
  assert.equal(result.adCount, 1);
  // The blank key in the metric table is not a keyword.
  assert.equal(result.keywordCount, 2);

  assert.equal(sent.some(message => message.action === "syncToServer"), false);
  const payload = result.groupResult;
  // The campaign owner supplies its frozen end date; each row keeps the existing window semantics.
  assert.equal(payload.rows[0].windowDays, 7);
  assert.deepEqual(
    plain(payload.rows).map((row) => row.keyword).sort(),
    ["버블문어", "콩순이 비눗방울"],
  );
  assert.equal(payload.rows[0].externalOptionId, "95514044205");
  assert.equal(payload.rows[0].adGroup, "MBTI젤리");
  // No registered keyword row came back, so these are smart-targeting matches.
  assert.equal(payload.rows[0].origin, "smart_targeting");
  assert.equal(result.adGroupId, "205034227");
  assert.equal(result.groupPlan.ads.length, 1);
});

test("a registered keyword with no impressions is still reported", async () => {
  const { contract, sent } = loadContract({
    fetch: async (url) => {
      if (url.includes("/ad-group/")) {
        return jsonResponse({
          adGroup: {
            name: "MBTI젤리",
            ads: [
              { id: "541920849", vendorItemId: 95514044205, itemName: "상품", isActive: true },
            ],
          },
        });
      }
      if (url.includes("/ad/keywords/")) {
        return jsonResponse([
          { keyword: "문어발 비눗방울", status: "승인", bidPrice: 300, isActive: true },
        ]);
      }
      if (url.includes("tableMetric")) return jsonResponse({ 버블문어: { impressions: 3 } });
      return { ok: false, status: 404, text: async () => "" };
    },
  });

  const result = await contract.collectCampaignKeywords({ name: "C", identity: "campaign:104640375" }, "2026-07-30");

  assert.equal(sent.some(message => message.action === "syncToServer"), false);
  const byKeyword = new Map(result.groupResult.rows.map((row) => [row.keyword, row]));
  assert.equal(byKeyword.size, 2);
  const registered = byKeyword.get("문어발 비눗방울");
  assert.equal(registered.origin, "registered");
  assert.equal(registered.status, "승인");
  assert.equal(registered.currentBid, 300);
  assert.equal(registered.impressions, 0);
  assert.equal(byKeyword.get("버블문어").origin, "smart_targeting");
});

test("keyword collection reports failure instead of syncing when the ad group is unreadable", async () => {
  const { contract, sent } = loadContract({
    fetch: async () => ({ ok: false, status: 401, text: async () => "" }),
  });

  const result = await contract.collectCampaignKeywords(
    { name: "C", identity: "campaign:104640375" },
    "2026-07-30",
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "ad_group_fetch_failed");
  assert.equal(sent.some((message) => message.action === "syncToServer"), false);
});

test("keyword collection refuses a route without an ad group", async () => {
  const { contract, sent } = loadContract({
    location: {
      href: "https://advertising.coupang.com/marketing/dashboard/sales",
      pathname: "/marketing/dashboard/sales",
      search: "",
      hash: "",
    },
  });

  const result = await contract.collectCampaignKeywords({ name: "C" }, "2026-07-30");

  assert.equal(result.ok, false);
  assert.equal(result.reason, "no_ad_group_route");
  assert.equal(sent.some((message) => message.action === "syncToServer"), false);
});

test("campaign roster preserves observed campaign and ad-group identifiers for the owner", async () => {
  const { contract } = loadContract({
    fetch: async (url, init) => {
      if (!url.includes("/tetris-api/campaigns")) {
        return { ok: false, status: 404, text: async () => "" };
      }
      const body = JSON.parse(init.body);
      assert.equal(body.isDeleted, false);
      return jsonResponse({
        campaigns: [
          {
            id: 102284299,
            name: "AI스마트광고(wing)",
            isActive: false,
            totalAdCount: 1109,
            groupList: [{ id: "202471278", name: "AI스마트광고" }],
          },
          {
            id: 104640375,
            name: "쿠팡윙 집중광고",
            isActive: true,
            totalAdCount: 29,
            groupList: [{ id: "205034227", name: "MBTI젤리" }],
          },
          { id: null, name: "식별 불가", groupList: [] },
        ],
        pageInfo: { totalCount: 3, hasNextPage: false },
      });
    },
  });

  const roster = await contract.fetchAdCampaignRoster();
  assert.equal(roster.ok, true);
  assert.equal(roster.campaigns.length, 2);

  assert.deepEqual(
    plain(roster.campaigns).map(campaign => [campaign.campaignId, campaign.groups[0].adGroupId]),
    [["102284299", "202471278"], ["104640375", "205034227"]],
  );
});

test("keyword sweep collects every campaign without navigating", async () => {
  const adGroupReads = [];
  const { run, sent } = keywordHarness({
    rosterQueue: [
      { sequence: 0, campaignId: '1', campaignName: 'A', campaignIdentity: 'campaign:1', adGroupId: '10', plan: null, resultComplete: false },
      { sequence: 1, campaignId: '2', campaignName: 'B', campaignIdentity: 'campaign:2', adGroupId: '20', plan: null, resultComplete: false },
    ],
    fetch: async (url) => {
      if (url.includes("/tetris-api/campaigns")) {
        return jsonResponse({
          campaigns: [
            { id: 1, name: "A", isActive: true, totalAdCount: 1, groupList: [{ id: "10", name: "g1" }] },
            { id: 2, name: "B", isActive: true, totalAdCount: 1, groupList: [{ id: "20", name: "g2" }] },
          ],
          pageInfo: { hasNextPage: false },
        });
      }
      if (url.includes("/ad-group/")) {
        adGroupReads.push(url);
        const adId = url.includes("/ad-group/10") ? "111" : "222";
        return jsonResponse({
          adGroup: {
            name: "g",
            ads: [{ id: adId, vendorItemId: 900 + Number(adId), itemName: "상품", isActive: true }],
          },
        });
      }
      if (url.includes("/ad/keywords/")) return jsonResponse([]);
      if (url.includes("tableMetric")) return jsonResponse({ 키워드하나: { impressions: 2 } });
      return { ok: false, status: 404, text: async () => "" };
    },
  });

  const result = await run();

  assert.equal(result.success, true);
  assert.equal(result.keywordReceipt.complete, true);
  assert.equal(result.progress.total, 2);
  assert.equal(result.keywordCount, 2);
  // Both ad groups were read from the API; the page never changed URL.
  assert.equal(adGroupReads.length, 2);

  const payloads = sent
    .filter((message) => message.action === "advertisingKeywordSourceStep" && message.step === 'group_result')
    .map((message) => message.body);
  assert.equal(payloads.length, 2);
  assert.deepEqual(
    plain(payloads).map((p) => p.rows[0].keyword),
    ["키워드하나", "키워드하나"],
  );
  assert.equal(sent.some(message => message.action === 'syncToServer'), false);
});

test("keyword sweep routing prefers an explicit request over a stale campaign hash", () => {
  const { contract } = loadContract({
    location: {
      href: "https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1",
      pathname: "/marketing/dashboard/sales",
      search: "",
      hash: "#kiditemAdSync=1",
    },
  });
  assert.equal(contract.shouldRunKeywordSweep("keyword_sweep"), true);
  assert.equal(contract.shouldRunKeywordSweep("campaign_sweep"), false);
  assert.equal(contract.shouldRunKeywordSweep(), false);
});

test("keyword sweep reports failure when the campaign roster is unreadable", async () => {
  const { run, sent } = keywordHarness({
    fetch: async () => ({ ok: false, status: 401, text: async () => "" }),
  });

  const result = await run();

  assert.equal(result.success, false);
  assert.equal(result.errorCode, "CAMPAIGN_ROSTER_INCOMPLETE");
  assert.equal(sent.some((m) => m.action === "syncToServer"), false);
});

test('a provider group without its original id cannot become confirmed empty coverage', async () => {
  const h = keywordHarness({ fetch: async () => jsonResponse({
    campaigns: [{ id: '1', name: 'campaign', groupList: [{ groupId: '10' }] }],
    pageInfo: { hasNextPage: false },
  }) });
  const result = await h.run();
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'CAMPAIGN_ROSTER_INCOMPLETE');
  assert.equal(h.sent.some(message => ['roster', 'group_result'].includes(message.step)), false);
});

test("a failed later roster page cannot publish the earlier campaigns as complete", async () => {
  const { run, sent } = keywordHarness({
    fetch: async (url, init) => {
      if (url.includes("/tetris-api/campaigns") && JSON.parse(init.body).pagination.page === 0) {
        return jsonResponse({
          campaigns: [{ id: 1, name: "A", groupList: [{ id: "10" }] }],
          pageInfo: { hasNextPage: true },
        });
      }
      if (url.includes("/ad-group/")) return jsonResponse({ adGroup: { ads: [] } });
      return { ok: false, status: 503, text: async () => "" };
    },
  });

  const result = await run();

  assert.equal(result.success, false);
  assert.equal(result.errorCode, "CAMPAIGN_ROSTER_INCOMPLETE");
  assert.equal(sent.some(m => m.action === 'advertisingKeywordSourceStep' && m.step !== 'checkpoint'), false);
  assert.equal(sent.some((m) => m.action === "syncToServer"), false);
});

test("roster keeps the 20-page cap but requires an observed terminal page", async () => {
  const requests = [];
  const { contract } = loadContract({
    fetch: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return jsonResponse({ campaigns: [], pageInfo: { hasNextPage: true } });
    },
  });

  const roster = await contract.fetchAdCampaignRoster();

  assert.equal(roster.ok, false);
  assert.equal(requests.length, 20);
  assert.deepEqual(requests[19], {
    isDeleted: false,
    pagination: { page: 19, size: 50 },
    sortedBy: "IS_ACTIVE",
    isSortDesc: false,
    budgetTypes: ["LIFETIME", "DAILY", "DAILY_SOFT", "MONTHLY_FIXED", "MONTHLY_CUSTOM"],
  });
});

test("an absent campaigns array or pagination flag is not a confirmed empty roster", async () => {
  for (const data of [{ pageInfo: { hasNextPage: false } }, { campaigns: [] }]) {
    let requests = 0;
    const { contract } = loadContract({
      fetch: async () => { requests += 1; return jsonResponse(data); },
    });

    const roster = await contract.fetchAdCampaignRoster();

    assert.equal(roster.ok, false);
    assert.equal(requests, 1, "invalid response stops at the observed failure");
  }
});

test("a failed registered-keyword request is not an empty keyword list", async () => {
  const { contract, sent } = loadContract({
    fetch: async (url) => {
      if (url.includes("/ad-group/")) return jsonResponse({
        adGroup: { name: "g", ads: [{ id: "11", vendorItemId: "901", isActive: true }] },
      });
      if (url.includes("tableMetric")) return jsonResponse({ 테스트: { impressions: 2 } });
      return { ok: false, status: 503, text: async () => "" };
    },
  });

  const result = await contract.collectCampaignKeywords(
    { name: "C", identity: "campaign:104640375" }, "2026-07-30",
  );

  assert.equal(result.ok, false);
  assert.equal(result.failedAds, 1);
  assert.equal(sent.some((m) => m.action === "syncToServer"), false);
});

test("truncated ad groups keep the 60-ad limit without claiming full coverage", async () => {
  const metricsReads = [];
  const { contract, sent } = loadContract({
    fetch: async (url, init) => {
      if (url.includes("/ad-group/")) return jsonResponse({ adGroup: {
        name: "g",
        ads: Array.from({ length: 61 }, (_, index) => ({ id: String(61 - index), vendorItemId: String(900 + index) })),
      } });
      if (url.includes("tableMetric")) {
        metricsReads.push(JSON.parse(init.body).creativeId);
        return jsonResponse({});
      }
      return jsonResponse([]);
    },
  });

  const result = await contract.collectCampaignKeywords(
    { name: "C", identity: "campaign:104640375" }, "2026-07-30",
  );

  assert.equal(result.ok, false);
  assert.equal(result.truncatedAds, 1);
  assert.equal(metricsReads.length, 60);
  assert.equal(metricsReads[0], "61", "preserve provider order");
  assert.equal(metricsReads[59], "2");
  assert.equal(sent.some((m) => m.action === "syncToServer"), false);
});

test("roster preserves page and group-list evidence separately from normalized targets", async () => {
  const { contract } = loadContract({ fetch: async () => jsonResponse({
    campaigns: [{ id: 1, name: "A", groupList: [] }, { id: 2, name: "B" }],
    pageInfo: { hasNextPage: false },
  }) });

  const roster = await contract.fetchAdCampaignRoster();

  assert.deepEqual(plain(roster.pages), [
    { page: 0, campaignsArrayObserved: true, hasNextPage: false, campaignCount: 2 },
  ]);
  assert.equal(roster.campaigns[0].groupsArrayObserved, true);
  assert.equal(roster.campaigns[1].groupsArrayObserved, false);
  assert.deepEqual(plain(roster.campaigns[1].groups), []);
});

test("an absent group ads array is not a confirmed empty advertised group", async () => {
  const { contract, sent } = loadContract({ fetch: async () => jsonResponse({ adGroup: { name: "g" } }) });
  const result = await contract.collectCampaignKeywords(
    { name: "C", identity: "campaign:104640375" }, "2026-07-30",
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "ad_group_fetch_failed");
  assert.equal(sent.some((m) => m.action === "syncToServer"), false);
});
