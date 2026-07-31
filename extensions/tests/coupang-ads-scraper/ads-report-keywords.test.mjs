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
  const context = vm.createContext({
    chrome: {
      runtime: {
        lastError: null,
        onMessage: { addListener() {} },
        sendMessage(message, callback) {
          sent.push(message);
          callback?.(options.syncResponse ?? { success: true });
        },
      },
      storage: { local: { set() {} } },
    },
    console: { log() {}, warn() {}, error() {} },
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
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
  });
  context.window = context;
  context.window.location = location;
  vm.runInContext(source, context, { filename: "ads-report.js" });
  return { contract: context.KidItemAdsReportContract, sent };
}

// Values built inside the vm realm carry that realm's prototypes, so strict
// deep equality fails on structurally identical objects. Compare plain clones.
const plain = (value) => JSON.parse(JSON.stringify(value));

function jsonResponse(data) {
  return { ok: true, status: 200, text: async () => JSON.stringify(data) };
}

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

test("campaign keyword collection sends one dated ad_keyword payload", async () => {
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

  const payload = sent.find((message) => message.action === "syncToServer")?.payload;
  assert.equal(payload.type, "ad_keyword");
  // Dated to the END of the observation window.
  assert.equal(payload.startDate, "2026-07-24");
  assert.equal(payload.endDate, "2026-07-30");
  assert.equal(payload.period, "7d");
  assert.equal(payload.data[0].windowDays, 7);
  assert.deepEqual(
    plain(payload.data).map((row) => row.keyword).sort(),
    ["버블문어", "콩순이 비눗방울"],
  );
  assert.equal(payload.data[0].externalOptionId, "95514044205");
  assert.equal(payload.data[0].adGroup, "MBTI젤리");
  // No registered keyword row came back, so these are smart-targeting matches.
  assert.equal(payload.data[0].origin, "smart_targeting");
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

  await contract.collectCampaignKeywords({ name: "C", identity: "campaign:104640375" }, "2026-07-30");

  const payload = sent.find((message) => message.action === "syncToServer")?.payload;
  const byKeyword = new Map(payload.data.map((row) => [row.keyword, row]));
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

test("campaign roster flattens to ad-group work units, running campaigns first", async () => {
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

  const queue = contract.buildKeywordSweepQueue(roster.campaigns);
  // The running campaign is collected first so a budgeted run always covers
  // the ads that are actually spending.
  assert.deepEqual(
    plain(queue).map((unit) => unit.key),
    ["104640375:205034227", "102284299:202471278"],
  );
  assert.equal(queue[0].campaignIdentity, "campaign:104640375");
  assert.equal(queue[0].adGroupId, "205034227");
});

test("keyword sweep collects every campaign without navigating", async () => {
  const adGroupReads = [];
  const { contract, sent } = loadContract({
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

  const result = await contract.runKeywordSweep();

  assert.equal(result.success, true);
  assert.equal(result.complete, true);
  assert.equal(result.groupCount, 2);
  assert.equal(result.keywordCount, 2);
  // Both ad groups were read from the API; the page never changed URL.
  assert.equal(adGroupReads.length, 2);

  const payloads = sent
    .filter((message) => message.action === "syncToServer")
    .map((message) => message.payload);
  assert.equal(payloads.length, 2);
  assert.deepEqual(
    plain(payloads).map((p) => p.type),
    ["ad_keyword", "ad_keyword"],
  );
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
  const { contract, sent } = loadContract({
    fetch: async () => ({ ok: false, status: 401, text: async () => "" }),
  });

  const result = await contract.runKeywordSweep();

  assert.equal(result.success, false);
  assert.equal(result.error, "campaign_roster_fetch_failed");
  assert.equal(sent.some((m) => m.action === "syncToServer"), false);
});
