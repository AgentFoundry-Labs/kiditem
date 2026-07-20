import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const source = fs.readFileSync(
  path.join(repoRoot, 'extensions/coupang-ads-scraper/content/ads-report.js'),
  'utf8',
);

function loadContract() {
  const location = {
    href: 'https://advertising.coupang.com/marketing/dashboard/sales',
    pathname: '/marketing/dashboard/sales',
    search: '',
    hash: '',
  };
  const context = vm.createContext({
    chrome: {
      runtime: {
        lastError: null,
        onMessage: { addListener() {} },
        sendMessage() {},
      },
      storage: { local: { set() {} } },
    },
    console,
    document: {
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      title: '광고센터',
    },
    history: { back() {} },
    location,
    sessionStorage: {
      getItem() {
        return null;
      },
      removeItem() {},
      setItem() {},
    },
    setTimeout() {
      return 0;
    },
    clearTimeout() {},
    showBadge() {},
    URL,
  });
  context.window = context;
  context.window.location = location;
  vm.runInContext(source, context, { filename: 'ads-report.js' });
  return context.KidItemAdsReportContract;
}

test('OFF campaign envelope is metadata-only', () => {
  const contract = loadContract();

  assert.equal(typeof contract?.buildCampaignReportAuthorityEnvelope, 'function');
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        contract.buildCampaignReportAuthorityEnvelope(
          { name: 'Paused', onOff: 'OFF' },
          '2026-07-17',
        ),
      ),
    ),
    { campaignReportScope: 'single_campaign_metadata_raw' },
  );
});

test('ON campaign envelope is authoritative for one exact day', () => {
  const contract = loadContract();

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        contract.buildCampaignReportAuthorityEnvelope(
          { name: 'Running', onOff: 'ON' },
          '2026-07-17',
        ),
      ),
    ),
    {
      campaignReportScope: 'single_campaign_authoritative',
      period: '1d',
      periodLabel: '어제',
      startDate: '2026-07-17',
      endDate: '2026-07-17',
      dateFrom: '2026-07-17',
      dateTo: '2026-07-17',
    },
  );
});

test('campaign-only rows preserve identity and state without invented metrics', () => {
  const contract = loadContract();
  const rows = JSON.parse(JSON.stringify(contract.buildCampaignOnlyRows({
    campaignId: 'campaign-1',
    identity: 'href:https://advertising.coupang.com/campaign/1',
    href: 'https://advertising.coupang.com/campaign/1',
    name: 'Paused',
    onOff: 'OFF',
    status: '일시정지',
  })));

  assert.deepEqual(rows.normalizedRows, [{
    pageType: 'campaign',
    campaignId: 'campaign-1',
    campaignIdentity: 'href:https://advertising.coupang.com/campaign/1',
    campaignName: 'Paused',
    onOff: 'OFF',
    status: '일시정지',
    _campaignOnly: true,
  }]);
  for (const metric of [
    'spend', 'revenue', 'impressions', 'clicks', 'conversions', 'orders',
  ]) {
    assert.equal(Object.hasOwn(rows.normalizedRows[0], metric), false);
  }
});
