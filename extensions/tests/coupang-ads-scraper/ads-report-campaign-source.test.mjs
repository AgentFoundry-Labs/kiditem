import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync(new URL('../../kiditem-os/content/coupang/ads-report.js', import.meta.url), 'utf8');
const productMetricsSource = fs.readFileSync(new URL('../../kiditem-os/content/coupang/ad-product-metrics.js', import.meta.url), 'utf8');
const dashboard = 'https://advertising.coupang.com/marketing/dashboard/sales';
const detail = dashboard + '/campaign/123/group/456/product';
const plain = value => JSON.parse(JSON.stringify(value));

function harness({ metadata = false, rawOnly = false, manual = false, manualPeriod = '7d', failDate = null, failKeywords = false, failProductSales = false, metadataRows = null, metadataPageSize = null, metadataNextDisabled = false, detailFailures = 0, onDetailFailure = null, onDelay = null, gridMissing = false } = {}) {
  const dom = new JSDOM('', { url: dashboard });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
  dom.window.HTMLElement.prototype.getClientRects = () => [{}];
  const manualTargetUrl = manualPeriod === '1d' ? `${detail}#targetDate=2026-07-31` : detail;
  const control = { attemptId: '11111111-1111-4111-8111-111111111111', state: 'RUNNING',
    expiresAt: '2026-08-03T00:00:00Z', manifestChecksum: 'a'.repeat(64), receipts: [], pages: [], campaigns: [],
    plan: manual
      ? { expectedAdvertiserId: 'A0001', captureMode: 'manual_report', period: manualPeriod, targetUrl: manualTargetUrl,
        startDate: manualPeriod === '1d' ? '2026-07-31' : '2026-07-25', endDate: '2026-07-31', businessDates: ['2026-07-31'] }
      : { expectedAdvertiserId: 'A0001', captureMode: 'campaign_sweep', startDate: '2026-07-01', endDate: '2026-07-31',
        businessDates: Array.from({length:31}, (_,i) => `2026-07-${String(31-i).padStart(2,'0')}`) } };
  let now = Date.parse('2026-08-01T14:59:00Z'), selectedDate, listener;
  const receipts = [], requests = [], appliedDates = [], delays = [];
  const name = metadata ? 'AI 스마트 광고' : rawOnly ? 'AI 스마트 광고 (HUB)' : 'OFF campaign';
  const identity = '<dl><dt>업체코드</dt><dd>A0001</dd></dl>';
  const effectiveMetadataRows = metadataRows ?? (manual ? [] : [
    { itemId: '1001', productName: 'one' },
    { itemId: '1002', productName: 'two' },
  ]);
  const effectiveMetadataPageSize = Math.max(
    1,
    Number(metadataPageSize) || effectiveMetadataRows.length || 1,
  );
  let metadataPage = 1;
  const dashboardPagination = '<div class="pagination-bottom"><input aria-label="jump to page" value="1"><span class="-totalPages">1</span></div>';
  function metadataPagination() {
    const totalPages = Math.max(1, Math.ceil(effectiveMetadataRows.length / effectiveMetadataPageSize));
    const nextDisabled = metadataNextDisabled || metadataPage >= totalPages;
    return `<div class="pagination-bottom"><input aria-label="jump to page" value="${metadataPage}"><span class="-totalPages">${totalPages}</span><div class="-next"><button class="-btn"${nextDisabled ? ' disabled' : ''}>Next</button></div></div>`;
  }
  function renderDashboard() {
    dom.window.history.replaceState({}, '', dashboard);
    dom.window.document.body.innerHTML = identity + `<div class="rt-table"><div class="rt-thead"><span class="rt-th">캠페인</span><span class="rt-th">노출수</span><span class="rt-th">클릭수</span></div><div class="rt-tbody"><div class="rt-tr-group"><div role="gridcell" data-bigfoot-component="campaign_name"><a class="dashboard-title" href="${rawOnly ? dashboard : detail}">${name}</a></div><div role="gridcell">OFF</div><div role="gridcell">중지</div></div></div></div>` + dashboardPagination;
    if (gridMissing) {
      dom.window.document.querySelector('.rt-table').remove();
      return;
    }
    dom.window.document.querySelector('a').onclick = event => {
      event.preventDefault();
      // A visit that never reaches the detail page, like a stalled Coupang page.
      if (detailFailuresLeft > 0) {
        detailFailuresLeft -= 1;
        onDetailFailure?.(dom);
        return;
      }
      renderDetail();
    };
  }
  let detailFailuresLeft = detailFailures;
  function renderDetail() {
    dom.window.history.replaceState({}, '', detail);
    const pageStart = (metadataPage - 1) * effectiveMetadataPageSize;
    const pageRows = (effectiveMetadataRows || []).slice(pageStart, pageStart + effectiveMetadataPageSize);
    const productRows = pageRows.map((row) => {
      const href = row.itemId
        ? `https://www.coupang.com/vp/products/${row.itemId}?vendorItemId=${row.itemId}`
        : '';
      const product = href
        ? `<a href="${href}">${row.productName || ''}</a>`
        : `${row.productName || ''}`;
      return `<div class="rt-tr-group"><div class="rt-td" role="gridcell">${product}</div><div class="rt-td" role="gridcell">0</div><div class="rt-td" role="gridcell">0</div></div>`;
    }).join('');
    dom.window.document.body.innerHTML = identity + '<a data-bigfoot-component="lnb-menu-ads-management-sales">매출 최적화</a><button class="dashboard-metric-widget-date-indicator-revamp ant-dropdown-trigger">최근 7일</button><div class="rt-table"><div class="rt-thead"><span class="rt-th">상품명</span><span class="rt-th">노출수</span><span class="rt-th">클릭수</span></div><div class="rt-tbody">' + productRows + '</div>' + (productRows ? '' : '<div class="ant-empty">데이터가 없습니다.</div>') + '</div>' + metadataPagination();
    dom.window.document.querySelector('a').onclick = renderDashboard;
    const nextPageButton = dom.window.document.querySelector('.pagination-bottom .-next .-btn');
    if (nextPageButton) {
      nextPageButton.onclick = () => {
        metadataPage += 1;
        renderDetail();
      };
    }
    dom.window.document.querySelector('button').onclick = () => {
      const popup = dom.window.document.createElement('div');
      popup.className = 'ant-dropdown dashboard-metric-widget-calendar-dropdown';
      popup.innerHTML = '<div class="ant-calendar-range-left"><span class="ant-calendar-year-select">2026년</span><span class="ant-calendar-month-select">7월</span><table><tbody><tr>' +
        Array.from({length:31}, (_,i) => `<td class="ant-calendar-cell"><span class="ant-calendar-date">${i+1}</span></td>`).join('') + '</tr></tbody></table></div><button class="ant-btn ant-btn-primary">적용</button>';
      for (const cell of popup.querySelectorAll('.ant-calendar-date')) cell.onclick = () => { selectedDate = `2026-07-${cell.textContent.padStart(2,'0')}`; };
      popup.querySelector('button').onclick = () => {
        appliedDates.push(selectedDate);
        dom.window.document.querySelector('.dashboard-metric-widget-date-indicator-revamp').textContent = selectedDate === failDate ? '이전 날짜' : `${selectedDate} ~ ${selectedDate}`;
        popup.remove();
      };
      dom.window.document.body.append(popup);
    };
  }
  renderDashboard();
  if (manual || metadataRows) {
    renderDetail();
    dom.window.history.replaceState({}, '', manualTargetUrl);
  }
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  let skippedLegacyAutoStart = false;
  const schedule = fn => {
    if (manual && manualPeriod === '1d' && !skippedLegacyAutoStart) {
      skippedLegacyAutoStart = true;
      return 0;
    }
    fn();
    return 0;
  };
  const context = vm.createContext({ document: dom.window.document, location: dom.window.location, history: dom.window.history,
    sessionStorage: dom.window.sessionStorage, Date: Clock, URL, URLSearchParams, AbortController,
    showBadge() {}, console: { log() {}, warn() {}, error() {} },
    setTimeout: schedule, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    fetch: async (url, init) => {
      requests.push({url,init});
      const body = init?.body ? JSON.parse(init.body) : null;
      const keywordRequest = url.includes('/ad/keywords/') ||
        (url.includes('tableMetric') && body?.tableType === 'keyword');
      if (failKeywords && keywordRequest) {
        return { ok: false, status: 503, text: async () => '' };
      }
      if (failProductSales && body?.tableType === 'product_sales') {
        return { ok: false, status: 503, text: async () => '' };
      }
      if (url.includes('/tetris-api/campaigns')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({
          campaigns: [{ id: '123', name, totalAdCount: 2, groupList: [{ id: '456', name: 'group' }] }],
          pageInfo: { hasNextPage: false },
        }) };
      }
      if (url.includes('/tetris-api/campaign/')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ adGroup: {
          name: 'group', adSelectionType: 'MANUAL_SELECTION', ads: [
            { id: '101', vendorItemId: '1001', itemName: 'one', isActive: true },
            { id: '102', vendorItemId: '1002', itemName: 'two', isActive: false },
          ],
        } }) };
      }
      if (url.includes('tableMetric') && body?.tableType === 'product_sales') {
        return { ok: true, status: 200, text: async () => JSON.stringify({
          '101': { deliveredAdCost: 0, adAttributedSales: 0, impressions: 0, clicks: 0, adAttributedUnits: 0, adAttributedOrders: 0 },
          '102': { deliveredAdCost: 0, adAttributedSales: 0, impressions: 0, clicks: 0, adAttributedUnits: 0, adAttributedOrders: 0 },
        }) };
      }
      if (keywordRequest) return { ok: true, status: 200, text: async () => JSON.stringify([]) };
      return { ok: true, status: 200, text: async () => JSON.stringify({}) };
    },
    chrome: { runtime: { lastError: null, onMessage: { addListener(fn) { listener = fn; } }, sendMessage(message, callback) {
      if (message.action === 'waitForAdCollectorDelay') { now += message.milliseconds; delays.push(message.milliseconds); onDelay?.(dom); }
      if (message.action === 'syncToServer') throw new Error('campaign must not publish through legacy sync');
      if (message.action !== 'advertisingCampaignSourceStep') return callback?.({success:true});
      if (message.step === 'resume') return callback({success:true,control:structuredClone(control)});
      if (message.step === 'checkpoint') return callback({success:true});
      const body = plain(message.body);
      const receipt = {sequence: receipts.length, key:body.key,kind:body.kind, checksum:'b'.repeat(64),
        ...(body.campaignKey ? {campaignKey:body.campaignKey} : {}), ...(body.businessDate ? {businessDate:body.businessDate} : {}),
        ...(body.period ? {period:body.period, startDate:body.startDate, endDate:body.endDate} : {})};
      assert.equal(receipts.some(previous => previous.key === body.key), false, 'accepted receipt is not re-sent');
      receipts.push(body); control.receipts.push(receipt);
      if (body.kind === 'dashboard_page') control.pages.push(body);
      if (body.kind === 'campaign') { const {payload, ...descriptor} = body; control.campaigns.push(descriptor); }
      callback({success:true,receipt,manifestChecksum:control.manifestChecksum});
    } }, storage: {local:{set(){}}} },
  });
  context.window = context;
  vm.runInContext(productMetricsSource, context, { filename: 'ad-product-metrics.js' });
  vm.runInContext(source, context);
  return { control, receipts, requests, appliedDates, delays, contract: context.KidItemAdsReportContract, close: () => dom.window.close(),
    run: () => new Promise(resolve => listener({ action:'manualSync', collectionRunId:control.attemptId,
      collectionAttempt:1, environmentId:'local', syncMode:manual ? 'campaign_manual_report' : 'campaign_sweep', campaignControl:structuredClone(control) }, {}, resolve)) };
}

function linklessSweepHarness() {
  const campaigns = [
    {
      campaignId: '201',
      adGroupId: '301',
      name: 'linkless campaign one',
      ad: { adId: '2101', vendorItemId: '3101', itemName: 'one' },
    },
    {
      campaignId: '202',
      adGroupId: '302',
      name: 'linkless campaign two',
      ad: { adId: '2201', vendorItemId: '3201', itemName: 'two' },
    },
  ];
  const businessDates = Array.from(
    { length: 31 },
    (_, index) => `2026-07-${String(31 - index).padStart(2, '0')}`,
  );
  const serverControl = {
    attemptId: '22222222-2222-4222-8222-222222222222',
    state: 'RUNNING',
    expiresAt: '2026-08-03T00:00:00Z',
    manifestChecksum: 'c'.repeat(64),
    receipts: [],
    pages: [],
    campaigns: [],
    plan: {
      expectedAdvertiserId: 'A0001',
      captureMode: 'campaign_sweep',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      businessDates,
    },
  };
  const storageValues = new Map();
  const sessionStorage = {
    getItem(key) {
      return storageValues.get(key) ?? null;
    },
    setItem(key, value) {
      storageValues.set(key, String(value));
    },
    removeItem(key) {
      storageValues.delete(key);
    },
    clear() {
      storageValues.clear();
    },
  };
  const receipts = [];
  const requests = [];
  const duplicateReceiptKeys = [];
  const navigations = [];
  const runs = [];
  let now = Date.parse('2026-08-01T14:59:00Z');
  let currentUrl = dashboard;
  let currentContext = null;
  let contextCount = 0;

  const campaignById = (campaignId) =>
    campaigns.find((campaign) => campaign.campaignId === String(campaignId)) || null;
  const detailHref = (campaign) =>
    `${dashboard}/campaign/${campaign.campaignId}/group/${campaign.adGroupId}/product?internalChannel=click_campaign_name`;
  const jsonResponse = (data) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(data),
  });

  function createContext(url) {
    const dom = new JSDOM('', { url });
    Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', {
      get() { return this.textContent; },
    });
    dom.window.HTMLElement.prototype.getClientRects = () => [{}];
    let listener;
    let navigationTarget = null;
    const identity = '<dl><dt>업체코드</dt><dd>A0001</dd></dl>';
    const navigationError = Object.assign(
      new Error('DOCUMENT_RECREATED'),
      { code: 'DOCUMENT_RECREATED' },
    );
    const navigateDocument = (target, campaign = null) => {
      navigationTarget = target;
      navigations.push({
        from: url,
        to: target,
        campaignId: campaign?.campaignId || null,
      });
      dom.window.history.replaceState({}, '', target);
      throw navigationError;
    };

    const renderDashboard = () => {
      dom.window.history.replaceState({}, '', dashboard);
      const rows = campaigns.map((campaign) =>
        `<div class="rt-tr-group"><div role="gridcell" data-bigfoot-component="campaign_name"><a class="dashboard-title" href="">${campaign.name}</a></div><div role="gridcell">OFF</div><div role="gridcell">중지</div></div>`
      ).join('');
      dom.window.document.body.innerHTML = identity +
        `<div class="rt-table"><div class="rt-thead"><span class="rt-th">캠페인</span><span class="rt-th">노출수</span><span class="rt-th">클릭수</span></div><div class="rt-tbody">${rows}</div></div>` +
        '<div class="pagination-bottom"><input aria-label="jump to page" value="1"><span class="-totalPages">1</span></div>';
      dom.window.document.querySelectorAll('.dashboard-title').forEach((anchor, index) => {
        const campaign = campaigns[index];
        Object.defineProperty(anchor, 'click', {
          configurable: true,
          value: () => navigateDocument(detailHref(campaign), campaign),
        });
      });
    };

    const renderDetail = () => {
      const campaign = campaigns.find((candidate) => url.includes(
        `/campaign/${candidate.campaignId}/group/${candidate.adGroupId}/`,
      ));
      if (!campaign) throw new Error(`unknown detail url: ${url}`);
      dom.window.history.replaceState({}, '', url);
      const product = campaign.ad;
      const productHref = `https://www.coupang.com/vp/products/${product.vendorItemId}?vendorItemId=${product.vendorItemId}`;
      dom.window.document.body.innerHTML = identity +
        '<a data-bigfoot-component="lnb-menu-ads-management-sales">매출 최적화</a>' +
        '<button class="dashboard-metric-widget-date-indicator-revamp ant-dropdown-trigger">최근 7일</button>' +
        `<div class="rt-table"><div class="rt-thead"><span class="rt-th">상품명</span><span class="rt-th">노출수</span><span class="rt-th">클릭수</span></div><div class="rt-tbody"><div class="rt-tr-group"><div class="rt-td" role="gridcell"><a href="${productHref}">${product.itemName}</a></div><div class="rt-td" role="gridcell">0</div><div class="rt-td" role="gridcell">0</div></div></div></div>` +
        '<div class="pagination-bottom"><input aria-label="jump to page" value="1"><span class="-totalPages">1</span></div>';
      const dashboardControl = dom.window.document.querySelector(
        "[data-bigfoot-component='lnb-menu-ads-management-sales']",
      );
      Object.defineProperty(dashboardControl, 'click', {
        configurable: true,
        value: () => navigateDocument(dashboard),
      });
    };

    const isDashboard = new URL(url).pathname === '/marketing/dashboard/sales';
    if (isDashboard) renderDashboard();
    else renderDetail();

    class Clock extends Date {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    }
    const schedule = (fn) => {
      fn();
      return 0;
    };
    const context = vm.createContext({
      document: dom.window.document,
      location: dom.window.location,
      history: dom.window.history,
      sessionStorage,
      Date: Clock,
      URL,
      URLSearchParams,
      AbortController,
      showBadge() {},
      console: { log() {}, warn() {}, error() {} },
      setTimeout: schedule,
      clearTimeout() {},
      setInterval: () => 0,
      clearInterval() {},
      fetch: async (requestUrl, init) => {
        requests.push({ url: requestUrl, init });
        const body = init?.body ? JSON.parse(init.body) : null;
        if (requestUrl.includes('/tetris-api/campaigns')) {
          return jsonResponse({
            campaigns: campaigns.map((campaign) => ({
              id: campaign.campaignId,
              name: campaign.name,
              totalAdCount: 1,
              groupList: [{ id: campaign.adGroupId, name: `${campaign.name} group` }],
            })),
            pageInfo: { hasNextPage: false },
          });
        }
        const groupMatch = requestUrl.match(
          /\/tetris-api\/campaign\/(\d+)\/ad-group\/(\d+)/,
        );
        if (groupMatch) {
          const campaign = campaignById(groupMatch[1]);
          if (!campaign || campaign.adGroupId !== groupMatch[2]) {
            return { ok: false, status: 404, text: async () => '' };
          }
          return jsonResponse({
            adGroup: {
              name: `${campaign.name} group`,
              adSelectionType: 'MANUAL_SELECTION',
              ads: [{
                id: campaign.ad.adId,
                vendorItemId: campaign.ad.vendorItemId,
                itemName: campaign.ad.itemName,
                isActive: true,
              }],
            },
          });
        }
        if (requestUrl.includes('tableMetric') && body?.tableType === 'product_sales') {
          const campaign = campaignById(body?.campaignIds?.[0]);
          return jsonResponse(Object.fromEntries(
            (campaign ? [campaign.ad] : []).map((ad) => [ad.adId, {
              deliveredAdCost: 0,
              adAttributedSales: 0,
              impressions: 0,
              clicks: 0,
              adAttributedUnits: 0,
              adAttributedOrders: 0,
            }]),
          ));
        }
        if (requestUrl.includes('tableMetric') && body?.tableType === 'keyword') {
          return jsonResponse({});
        }
        if (requestUrl.includes('/tetris-api/ad/keywords/')) return jsonResponse([]);
        return jsonResponse({});
      },
      chrome: {
        runtime: {
          lastError: null,
          onMessage: { addListener(fn) { listener = fn; } },
          sendMessage(message, callback) {
            if (message.action === 'waitForAdCollectorDelay') {
              now += message.milliseconds;
              callback?.({ success: true });
              return;
            }
            if (message.action === 'syncToServer') {
              throw new Error('campaign must not publish through legacy sync');
            }
            if (message.action !== 'advertisingCampaignSourceStep') {
              callback?.({ success: true });
              return;
            }
            if (message.step === 'resume') {
              callback({ success: true, control: structuredClone(serverControl) });
              return;
            }
            if (message.step === 'checkpoint') {
              callback({ success: true });
              return;
            }
            const body = plain(message.body);
            const duplicate = receipts.some((previous) => previous.key === body.key);
            if (duplicate) {
              duplicateReceiptKeys.push(body.key);
              callback({ success: false, errorCode: 'DUPLICATE_RECEIPT', error: 'duplicate receipt' });
              return;
            }
            const receipt = {
              sequence: receipts.length,
              key: body.key,
              kind: body.kind,
              checksum: 'd'.repeat(64),
              ...(body.campaignKey ? { campaignKey: body.campaignKey } : {}),
              ...(body.businessDate ? { businessDate: body.businessDate } : {}),
            };
            receipts.push(body);
            serverControl.receipts.push(receipt);
            if (body.kind === 'dashboard_page') serverControl.pages.push(body);
            if (body.kind === 'campaign') {
              const { payload: _payload, ...descriptor } = body;
              serverControl.campaigns.push(descriptor);
            }
            callback({ success: true, receipt, manifestChecksum: serverControl.manifestChecksum });
          },
        },
        storage: { local: { set() {} } },
      },
    });
    context.window = context;
    vm.runInContext(productMetricsSource, context, { filename: 'ad-product-metrics.js' });
    vm.runInContext(source, context, { filename: 'ads-report.js' });
    return {
      dom,
      listener,
      navigationTarget: () => navigationTarget,
    };
  }

  function recreate(url) {
    currentContext?.dom.window.close();
    currentUrl = url;
    currentContext = createContext(url);
    contextCount += 1;
  }
  recreate(dashboard);

  return {
    campaigns,
    businessDates,
    serverControl,
    receipts,
    requests,
    duplicateReceiptKeys,
    navigations,
    runs,
    sessionStorage,
    get contextCount() { return contextCount; },
    get currentUrl() { return currentUrl; },
    dropLocalSweepState() {
      sessionStorage.removeItem('kiditem_ad_sweep_seen_v2');
      sessionStorage.removeItem('kiditem_ad_sweep_progress_v2');
    },
    async run() {
      const contextAtStart = currentContext;
      const before = receipts.length;
      const message = {
        action: 'manualSync',
        collectionRunId: serverControl.attemptId,
        collectionAttempt: 1,
        environmentId: 'local',
        syncMode: 'campaign_sweep',
        campaignControl: structuredClone(serverControl),
      };
      const result = await new Promise((resolve) => {
        try {
          contextAtStart.listener(message, {}, resolve);
        } catch (error) {
          resolve({ success: false, error: error?.message || String(error), errorCode: error?.code });
        }
      });
      const target = contextAtStart.navigationTarget();
      const run = {
        from: currentUrl,
        result,
        receipts: receipts.slice(before),
        navigationTarget: target,
      };
      if (target) {
        recreate(target);
        run.result = { ...result, resumeRequired: true, documentRecreated: true };
      }
      runs.push(run);
      return run.result;
    },
    close() {
      currentContext?.dom.window.close();
    },
  };
}

test('actual campaign DOM collector preserves frozen 31 days and automatic 12 + 12 + 7 same-attempt handoff', async () => {
  const h = harness({failKeywords:true});
  try {
    const counts = [];
    for (let i = 0; i < 3; i++) {
      const before = h.appliedDates.length;
      const result = await h.run();
      counts.push(h.appliedDates.length - before);
      if (i < 2) assert.equal(result.resumeRequired, true, JSON.stringify(result));
      else { assert.equal(result.success, true, JSON.stringify(result)); assert.equal(result.campaignReceipt.complete, true); }
    }
    assert.deepEqual(counts, [0, 0, 0], 'product_sales owns the exact-day range; no date picker is used');
    assert.deepEqual(h.appliedDates, []);
    assert.deepEqual(h.receipts.filter(r => r.kind === 'campaign_day').map(r => r.businessDate), h.control.plan.businessDates);
    assert.equal(h.receipts.filter(r => r.kind === 'dashboard_page').length, 1);
    assert.ok(h.receipts.filter(r => r.kind === 'campaign_day').every(r => r.proof.kind === 'product_sales_api' && r.proof.complete && !r.proof.explicitEmpty && r.payload.startDate === r.businessDate && r.payload.endDate === r.businessDate && r.payload.kpis && Object.keys(r.payload.kpis).length === 0));
    assert.ok(h.receipts.filter(r => r.kind === 'campaign_day').every(r => r.payload.data.length === 2 && r.payload.normalizedRows.length === 2));
    assert.ok(h.receipts.filter(r => r.kind === 'campaign_day').every(r => r.proof.start === Date.parse(`${r.businessDate}T00:00:00+09:00`) && r.proof.end === r.proof.start), 'each API receipt keeps its exact KST day');
    assert.equal(h.receipts.some(r => r.kind === 'auxiliary_keywords'), false, 'optional provider failure does not undo daily coverage');
    assert.equal(h.requests.filter(({ url, init }) => url.includes('tableMetric') && JSON.parse(init.body).tableType === 'product_sales').length, 31);
  } finally { h.close(); }
});

test('metadata and raw-only campaign outputs stay descriptors, never fabricated 31-day facts', async () => {
  for (const mode of ['metadata','rawOnly']) {
    const h = harness({[mode]:true});
    try {
      const result = await h.run();
      assert.equal(result.success, true, JSON.stringify(result));
      assert.deepEqual(h.appliedDates, []);
      assert.equal(h.receipts.filter(r => r.kind === 'campaign').length, 1);
      assert.equal(h.receipts.find(r => r.kind === 'campaign').mode, mode === 'rawOnly' ? 'raw_only' : 'metadata');
      assert.equal(h.requests.length, 0);
    } finally { h.close(); }
  }
});

test('manual product metadata joins exact vendor ids and strips displayed metric columns', async () => {
  const h = harness({ metadataRows: [
    { itemId: '1001', productName: 'same name' },
    { itemId: '1002', productName: 'same name' },
  ] });
  try {
    const result = await h.contract.captureManualProductMetadata(
      { campaignId: '123', identity: 'campaign:123', name: 'manual' },
      {
        adGroupId: '456', adGroupName: 'group', adSelectionType: 'MANUAL_SELECTION',
        ads: [
          { adId: '101', vendorItemId: '1001', itemName: 'different label' },
          { adId: '102', vendorItemId: '1002', itemName: 'different label' },
        ],
      },
    );
    assert.equal(result.ok, true, JSON.stringify({ reason: result.reason, observedRowCount: result.observedRowCount, metadataAdCount: result.metadataAdCount }));
    assert.equal(result.metadataAdCount, 2);
    assert.deepEqual(plain(result.metadataByAdId.get('101').rawColumns), {});
    assert.equal(result.metadataByAdId.get('101').vendorItemId, '1001');
  } finally { h.close(); }
});

test('manual product metadata walks the React-Table product pages before joining the full roster', async () => {
  const h = harness({
    metadataRows: [
      { itemId: '1001', productName: 'one' },
      { itemId: '1002', productName: 'two' },
      { itemId: '1003', productName: 'three' },
    ],
    metadataPageSize: 2,
  });
  try {
    const result = await h.contract.captureManualProductMetadata(
      { campaignId: '123', identity: 'campaign:123', name: 'manual' },
      {
        adGroupId: '456', adGroupName: 'group', adSelectionType: 'MANUAL_SELECTION',
        ads: [
          { adId: '101', vendorItemId: '1001', itemName: 'one' },
          { adId: '102', vendorItemId: '1002', itemName: 'two' },
          { adId: '103', vendorItemId: '1003', itemName: 'three' },
        ],
      },
    );
    assert.equal(result.ok, true, JSON.stringify({ reason: result.reason, observedRowCount: result.observedRowCount, metadataAdCount: result.metadataAdCount }));
    assert.equal(result.observedRowCount, 3);
    assert.equal(result.metadataAdCount, 3);
    assert.equal(result.metadataByAdId.get('103').vendorItemId, '1003');
  } finally { h.close(); }
});

test('manual product metadata fails closed when a two-page report disables Next on page one', async () => {
  const h = harness({
    metadataRows: [
      { itemId: '1001', productName: 'one' },
      { itemId: '1002', productName: 'two' },
      { itemId: '1003', productName: 'three' },
    ],
    metadataPageSize: 2,
    metadataNextDisabled: true,
  });
  try {
    const pagination = await h.contract.collectPaginatedReport({ maxPages: 3 });
    assert.equal(pagination.complete, false);
    assert.equal(pagination.error, 'page_navigation_failed');
    assert.deepEqual([...pagination.visitedPages], [1]);

    const result = await h.contract.captureManualProductMetadata(
      { campaignId: '123', identity: 'campaign:123', name: 'manual' },
      {
        adGroupId: '456', adGroupName: 'group', adSelectionType: 'MANUAL_SELECTION',
        ads: [
          { adId: '101', vendorItemId: '1001', itemName: 'one' },
          { adId: '102', vendorItemId: '1002', itemName: 'two' },
          { adId: '103', vendorItemId: '1003', itemName: 'three' },
        ],
      },
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'metadata_observed_count_mismatch');
    assert.equal(result.observedRowCount, 0);
  } finally { h.close(); }
});

test('manual product metadata rejects ambiguous names, conflicting ids, and row-count drift', async () => {
  const ambiguous = harness({ metadataRows: [
    { productName: 'same name' },
    { productName: 'same name' },
  ] });
  try {
    const result = await ambiguous.contract.captureManualProductMetadata(
      { campaignId: '123', identity: 'campaign:123', name: 'manual' },
      {
        adGroupId: '456', adSelectionType: 'MANUAL_SELECTION',
        ads: [
          { adId: '101', vendorItemId: '1001', itemName: 'same name' },
          { adId: '102', vendorItemId: '1002', itemName: 'same name' },
        ],
      },
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'metadata_ambiguous_product_name');
  } finally { ambiguous.close(); }

  const conflicting = harness({ metadataRows: [{ itemId: '1002', productName: 'same name' }] });
  try {
    const result = await conflicting.contract.captureManualProductMetadata(
      { campaignId: '123', identity: 'campaign:123', name: 'manual' },
      {
        adGroupId: '456', adSelectionType: 'MANUAL_SELECTION',
        ads: [{ adId: '101', vendorItemId: '1001', itemName: 'same name' }],
      },
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'metadata_vendor_item_id_unmatched');
  } finally { conflicting.close(); }

  const countMismatch = harness({ metadataRows: [{ itemId: '1001', productName: 'one' }] });
  try {
    const result = await countMismatch.contract.captureManualProductMetadata(
      { campaignId: '123', identity: 'campaign:123', name: 'manual' },
      {
        adGroupId: '456', adSelectionType: 'MANUAL_SELECTION',
        ads: [
          { adId: '101', vendorItemId: '1001', itemName: 'one' },
          { adId: '102', vendorItemId: '1002', itemName: 'two' },
        ],
      },
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'metadata_observed_count_mismatch');
  } finally { countMismatch.close(); }
});

test('a product_sales failure cannot produce a complete campaign receipt', async () => {
  const h = harness({failDate:'2026-07-30', failProductSales: true});
  try {
    const result = await h.run();
    assert.equal(result.success, false);
    assert.notEqual(result.campaignReceipt?.complete, true);
    assert.deepEqual(h.receipts.filter(r => r.kind === 'campaign_day').map(r => r.businessDate), []);
  } finally { h.close(); }
});

test('successful visited-group auxiliary capture shares campaign receipt ownership and preserves confirmed empty proof', async () => {
  const h = harness();
  try {
    for (let i = 0; i < 3; i++) await h.run();
    const auxiliary = h.receipts.find(r => r.kind === 'auxiliary_keywords');
    assert.equal(auxiliary.adGroupId, '456');
    assert.equal(auxiliary.campaignKey, h.receipts.find(r => r.kind === 'campaign').campaignKey);
    assert.equal(auxiliary.groupPlan.adsArrayObserved, true);
    assert.equal(auxiliary.groupPlan.enumeratedAdCount, 2);
    assert.equal(auxiliary.groupResult.ads.length, 2);
    assert.deepEqual(auxiliary.groupResult.rows, []);
    assert.equal(auxiliary.groupPlan.advertiserId, 'A0001');
    assert.equal(auxiliary.groupResult.advertiserId, 'A0001');
  } finally { h.close(); }
});

test('manual displayed seven-day report publishes one exact-period owner receipt without legacy sync', async () => {
  const h = harness({ manual: true });
  try {
    const result = await h.run();
    assert.equal(result.success, true, JSON.stringify(result));
    assert.deepEqual(h.receipts.map(receipt => receipt.kind), ['manual_report']);
    assert.equal(h.receipts[0].period, '7d');
    assert.equal(h.receipts[0].startDate, '2026-07-25');
    assert.equal(h.receipts[0].endDate, '2026-07-31');
    assert.deepEqual(h.receipts[0].payload.data, []);
    assert.equal(h.requests.length, 0);
  } finally { h.close(); }
});

test('manual exact-day report preserves the requested target date and remains one report receipt', async () => {
  const h = harness({ manual: true, manualPeriod: '1d' });
  try {
    const result = await h.run();
    assert.equal(result.success, true, JSON.stringify(result));
    assert.deepEqual(h.receipts.map(receipt => receipt.kind), ['manual_report']);
    assert.equal(h.receipts[0].period, '1d');
    assert.equal(h.receipts[0].startDate, '2026-07-31');
    assert.equal(h.receipts[0].endDate, '2026-07-31');
    assert.deepEqual(h.appliedDates, ['2026-07-31']);
    assert.equal(h.requests.length, 0);
  } finally { h.close(); }
});

test('two linkless campaigns survive 12-day handoffs and content recreation with server receipt resume', async () => {
  const h = linklessSweepHarness();
  let terminal = null;
  let localStateDropped = false;
  try {
    for (let invocation = 0; invocation < 20; invocation += 1) {
      const result = await h.run();
      const latest = h.runs[h.runs.length - 1];
      const dailyReceipts = latest.receipts.filter((receipt) => receipt.kind === 'campaign_day');
      if (
        !localStateDropped &&
        dailyReceipts.length === 12 &&
        dailyReceipts.every((receipt) => receipt.campaignKey.includes('linkless campaign one'))
      ) {
        // Keep the owner receipts and terminal-navigation set, but remove the
        // local seen/progress cache. The next document must rebuild coverage
        // from the server control without replaying accepted day keys.
        h.dropLocalSweepState();
        localStateDropped = true;
      }
      if (result.success === true) {
        terminal = result;
        break;
      }
      if (!result.documentRecreated) break;
    }

    assert.equal(localStateDropped, true);
    assert.ok(terminal, 'bounded handoffs should reach a terminal response');
    assert.equal(terminal.campaignReceipt?.complete, true, JSON.stringify(terminal));
    assert.equal(terminal.campaigns, 2, JSON.stringify(terminal));
    assert.equal(terminal.failed, 0, JSON.stringify(terminal));
    assert.equal(h.duplicateReceiptKeys.length, 0, JSON.stringify(h.duplicateReceiptKeys));
    assert.ok(h.contextCount > 1, 'each full-document navigation must recreate content context');

    for (const [index, campaign] of h.campaigns.entries()) {
      const campaignKey = `dashboard-campaign\u001f1\u001f${index}\u001f${campaign.name}`;
      const days = h.receipts
        .filter((receipt) => receipt.kind === 'campaign_day' && receipt.campaignKey === campaignKey)
        .map((receipt) => receipt.businessDate);
      assert.deepEqual(days, h.businessDates, `${campaign.name} exact daily coverage`);
      assert.equal(new Set(days).size, h.businessDates.length);
      assert.ok(
        h.receipts
          .filter((receipt) => receipt.kind === 'campaign_day' && receipt.campaignKey === campaignKey)
          .every((receipt) =>
            receipt.payload.data.length === 1 &&
            receipt.payload.normalizedRows.length === 1 &&
            receipt.payload.startDate === receipt.businessDate &&
            receipt.payload.endDate === receipt.businessDate &&
            receipt.payload.normalizedRows[0].vendorItemId === campaign.ad.vendorItemId,
          ),
        `${campaign.name} must contain only API-owned product rows`,
      );
    }

    const detailNavigations = h.navigations.filter(({ to }) => /\/campaign\/\d+\/group\/\d+\//.test(to));
    assert.deepEqual(
      detailNavigations.map(({ campaignId }) => campaignId),
      ['201', '201', '201', '202', '202', '202'],
      'each linkless campaign gets exactly three detail entries for 12+12+7 days',
    );
    assert.deepEqual(
      h.runs
        .map((run) => run.receipts.filter((receipt) => receipt.kind === 'campaign_day'))
        .filter((days) => days.length > 0)
        .map((days) => [days[0].campaignKey.includes('linkless campaign one') ? '201' : '202', days.length]),
      [['201', 12], ['201', 12], ['201', 7], ['202', 12], ['202', 12], ['202', 7]],
      'each document handoff must carry one bounded 12+12+7 date slice',
    );
  } finally {
    h.close();
  }
});

// The page-world recorder the collector installs while a sweep runs
// (background/coupang/ad-center-collector.js) writes Coupang dialogs here.
function recordCoupangAlert(dom, message) {
  const key = 'kiditem_ads_dialog_log_v1';
  const log = JSON.parse(dom.window.sessionStorage.getItem(key) || '[]');
  log.push({ seq: (log.at(-1)?.seq || 0) + 1, kind: 'alert', message });
  dom.window.sessionStorage.setItem(key, JSON.stringify(log));
}

test('a campaign whose detail page never loads gets one retry in the attempt, then fails it with a named reason', async () => {
  const h = harness({ detailFailures: 2 });
  try {
    const first = await h.run();
    assert.equal(first.resumeRequired, true, JSON.stringify(first));
    assert.equal(first.resumeUrl, dashboard, 'a hashless dashboard URL reloads the page, so the retry starts from page one');
    assert.equal(first.campaignReceipt, undefined, 'the first failure does not end the attempt');

    const second = await h.run();

    assert.equal(second.success, false, JSON.stringify(second));
    assert.equal(second.campaignReceipt.complete, false);
    assert.equal(second.error, '쿠팡 광고 캠페인 1개를 불러오지 못했습니다: OFF campaign.');
    assert.equal(h.receipts.some((receipt) => receipt.kind === 'campaign_day'), false);
  } finally { h.close(); }
});

test('a campaign that loads on its retry completes the attempt', async () => {
  const h = harness({ detailFailures: 1 });
  try {
    let result;
    for (let invocation = 0; invocation < 6; invocation += 1) {
      result = await h.run();
      if (!result.resumeRequired) break;
    }
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.campaignReceipt.complete, true);
    assert.equal(result.failed, 0);
    assert.deepEqual(
      h.receipts.filter((receipt) => receipt.kind === 'campaign_day').map((receipt) => receipt.businessDate),
      h.control.plan.businessDates,
    );
  } finally { h.close(); }
});

test('a Coupang alert during the detail wait counts as a page error and is named in the failure reason', async () => {
  const h = harness({
    detailFailures: 2,
    onDetailFailure: (dom) => recordCoupangAlert(dom, '캠페인 정보를 불러오지 못했습니다.'),
  });
  try {
    const first = await h.run();
    assert.equal(first.resumeRequired, true, JSON.stringify(first));

    const second = await h.run();

    assert.equal(second.success, false, JSON.stringify(second));
    assert.equal(second.errors[0].error, 'coupang_alert', 'the recorded alert ends the wait instead of a timeout');
    assert.equal(
      second.error,
      "쿠팡 광고 캠페인 1개를 불러오지 못했습니다: OFF campaign. 쿠팡 알림: '캠페인 정보를 불러오지 못했습니다.'",
    );
  } finally { h.close(); }
});

test('a dashboard whose campaign grid never loads answers with the dashboard failure', async () => {
  const h = harness({ gridMissing: true });
  try {
    const result = await h.run();
    assert.deepEqual(plain({ success: result.success, errorCode: result.errorCode, error: result.error }), {
      success: false,
      errorCode: 'AD_DASHBOARD_NOT_LOADED',
      error: '쿠팡 광고센터 대시보드를 불러오지 못했습니다. 로그인 상태를 확인한 뒤 다시 시도해 주세요.',
    });
    assert.equal(h.receipts.length, 0);
  } finally { h.close(); }
});

test('a Coupang alert while the dashboard grid loads is named in the dashboard failure', async () => {
  let alerted = false;
  const h = harness({
    gridMissing: true,
    onDelay: (dom) => {
      if (alerted) return;
      alerted = true;
      recordCoupangAlert(dom, '세션이 만료되었습니다.');
    },
  });
  try {
    const result = await h.run();
    assert.equal(result.errorCode, 'AD_DASHBOARD_NOT_LOADED');
    assert.equal(
      result.error,
      "쿠팡 광고센터 대시보드를 불러오지 못했습니다. 로그인 상태를 확인한 뒤 다시 시도해 주세요. 쿠팡 알림: '세션이 만료되었습니다.'",
    );
  } finally { h.close(); }
});
