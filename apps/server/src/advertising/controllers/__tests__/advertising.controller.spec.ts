import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';

vi.mock('../../services/ad-strategy.service', () => ({
  AdStrategyService: class AdStrategyService {},
}));

import { AdvertisingController } from '../advertising.controller';

// ── Controller wiring only ──
// 목적: @CurrentCompany 주입이 서비스에 정확히 전파되는지 + 7 sub-action dispatch 분기 + BadRequestException.
// 서비스 내부 로직은 각 service spec 에서 검증. 여기선 위임만.

function makeServices() {
  return {
    advertising: {
      getHubData: vi.fn(),
      findAll: vi.fn(),
      changeTier: vi.fn(),
    },
    campaigns: {
      getCampaigns: vi.fn(),
      getTrends: vi.fn(),
    },
    strategy: {
      getRules: vi.fn(),
      getWeeklyPlan: vi.fn(),
      getAiEnhancedPlan: vi.fn(),
      getRecommendations: vi.fn(),
      getExposureAnalysis: vi.fn(),
      registerCampaign: vi.fn(),
    },
    benchmark: { getDiagnosis: vi.fn() },
    collect: { startCollection: vi.fn(), getStatus: vi.fn() },
    sync: {
      sync: vi.fn(),
      getExtensionStatus: vi.fn(),
      getScrapeTargets: vi.fn(),
      createScrapeTarget: vi.fn(),
      markScraped: vi.fn(),
      deleteScrapeTarget: vi.fn(),
    },
    action: {
      getActions: vi.fn(),
      generateActions: vi.fn(),
      approveActions: vi.fn(),
      rejectActions: vi.fn(),
      markRunning: vi.fn(),
      markDone: vi.fn(),
      markFailed: vi.fn(),
      resetFailed: vi.fn(),
    },
    execution: {
      lease: vi.fn(),
      heartbeat: vi.fn(),
      report: vi.fn(),
    },
    config: { getConfig: vi.fn(), updateConfig: vi.fn() },
  };
}

function makeController(svcs = makeServices()) {
  const ctrl = new AdvertisingController(
    svcs.advertising as any,
    svcs.campaigns as any,
    svcs.strategy as any,
    svcs.benchmark as any,
    svcs.collect as any,
    svcs.sync as any,
    svcs.action as any,
    svcs.execution as any,
    svcs.config as any,
  );
  return { ctrl, svcs };
}

const COMPANY = 'company-1';

describe('AdvertisingController — @CurrentCompany 주입 + 서비스 위임', () => {
  it('GET /hub → advertising.getHubData(companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.getHub(COMPANY);
    expect(svcs.advertising.getHubData).toHaveBeenCalledWith(COMPANY);
  });

  it('GET / → advertising.findAll(query, companyId)', () => {
    const { ctrl, svcs } = makeController();
    const query = { page: 1, limit: 10 };
    ctrl.findAll(query as any, COMPANY);
    expect(svcs.advertising.findAll).toHaveBeenCalledWith(query, COMPANY);
  });

  it('PATCH /:id/tier → advertising.changeTier(id, adTier, companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.changeTier('ad-1', { adTier: 'A' } as any, COMPANY);
    expect(svcs.advertising.changeTier).toHaveBeenCalledWith('ad-1', 'A', COMPANY);
  });

  it('GET /campaigns → campaigns.getCampaigns(period, campaign, companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.getCampaigns({ period: '14d', campaign: 'camp-1' } as any, COMPANY);
    expect(svcs.campaigns.getCampaigns).toHaveBeenCalledWith('14d', 'camp-1', COMPANY);
  });

  it('GET /campaigns → period 기본값 7d fallback', () => {
    const { ctrl, svcs } = makeController();
    ctrl.getCampaigns({} as any, COMPANY);
    expect(svcs.campaigns.getCampaigns).toHaveBeenCalledWith('7d', undefined, COMPANY);
  });

  it('GET /campaigns/trends → campaigns.getTrends(period, days, companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.getTrends({ period: '7d', days: 7 } as any, COMPANY);
    expect(svcs.campaigns.getTrends).toHaveBeenCalledWith('7d', 7, COMPANY);
  });

  it('POST /campaigns/register → strategy.registerCampaign(body, companyId)', () => {
    const { ctrl, svcs } = makeController();
    const body = { campaignName: 'c1', listings: [] };
    ctrl.registerCampaign(body as any, COMPANY);
    expect(svcs.strategy.registerCampaign).toHaveBeenCalledWith(body, COMPANY);
  });

  it('GET /strategy/rules → strategy.getRules(period, companyId) with 14d default', () => {
    const { ctrl, svcs } = makeController();
    ctrl.getRules({} as any, COMPANY);
    expect(svcs.strategy.getRules).toHaveBeenCalledWith('14d', COMPANY);
  });

  it('GET /strategy/plan → strategy.getWeeklyPlan(period, companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.getWeeklyPlan({ period: '7d' } as any, COMPANY);
    expect(svcs.strategy.getWeeklyPlan).toHaveBeenCalledWith('7d', COMPANY);
  });

  it('POST /strategy/ai-plan → strategy.getAiEnhancedPlan(period, companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.getAiPlan({ period: 'month' } as any, COMPANY);
    expect(svcs.strategy.getAiEnhancedPlan).toHaveBeenCalledWith('month', COMPANY);
  });

  it('GET /strategy/recommend → strategy.getRecommendations(companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.getRecommendations(COMPANY);
    expect(svcs.strategy.getRecommendations).toHaveBeenCalledWith(COMPANY);
  });

  it('GET /exposure-analysis → strategy.getExposureAnalysis(companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.getExposureAnalysis(COMPANY);
    expect(svcs.strategy.getExposureAnalysis).toHaveBeenCalledWith(COMPANY);
  });

  it('GET /benchmark → benchmark.getDiagnosis(companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.getBenchmark(COMPANY);
    expect(svcs.benchmark.getDiagnosis).toHaveBeenCalledWith(COMPANY);
  });

  it('POST /collect → collect.startCollection(period, companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.startCollection({ period: '7d' } as any, COMPANY);
    expect(svcs.collect.startCollection).toHaveBeenCalledWith('7d', COMPANY);
  });

  it('GET /collect/status → collect.getStatus(companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.getCollectStatus(COMPANY);
    expect(svcs.collect.getStatus).toHaveBeenCalledWith(COMPANY);
  });

  it('POST /extension/sync → sync.sync(body, companyId)', () => {
    const { ctrl, svcs } = makeController();
    const body = { type: 'ad_campaign', rows: [] };
    ctrl.extensionSync(body as any, COMPANY);
    expect(svcs.sync.sync).toHaveBeenCalledWith(body, COMPANY);
  });

  it('GET /extension/status → sync.getExtensionStatus(companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.extensionStatus(COMPANY);
    expect(svcs.sync.getExtensionStatus).toHaveBeenCalledWith(COMPANY);
  });

  it('GET /scrape-targets → sync.getScrapeTargets(companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.getScrapeTargets(COMPANY);
    expect(svcs.sync.getScrapeTargets).toHaveBeenCalledWith(COMPANY);
  });

  it('POST /scrape-targets action=markScraped → sync.markScraped(id, companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.handleScrapeTarget({ action: 'markScraped', id: 'target-1' } as any, COMPANY);
    expect(svcs.sync.markScraped).toHaveBeenCalledWith('target-1', COMPANY);
  });

  it('POST /scrape-targets (create) → sync.createScrapeTarget(url, label, category, companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.handleScrapeTarget(
      { url: 'https://example.com', label: 'L', category: 'C' } as any,
      COMPANY,
    );
    expect(svcs.sync.createScrapeTarget).toHaveBeenCalledWith(
      'https://example.com',
      'L',
      'C',
      COMPANY,
    );
  });

  it('DELETE /scrape-targets/:id → sync.deleteScrapeTarget(id, companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.deleteScrapeTarget('target-1', COMPANY);
    expect(svcs.sync.deleteScrapeTarget).toHaveBeenCalledWith('target-1', COMPANY);
  });

  it('GET /actions → action.getActions(query, companyId)', () => {
    const { ctrl, svcs } = makeController();
    const query = { approvalStatus: 'pending' };
    ctrl.getActions(query as any, COMPANY);
    expect(svcs.action.getActions).toHaveBeenCalledWith(query, COMPANY);
  });

  it('POST /execution/lease → execution.lease(workerKey, opts, companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.executionLease(
      { workerKey: 'w1', label: 'L', pageType: 'campaign', limit: 3 } as any,
      COMPANY,
    );
    expect(svcs.execution.lease).toHaveBeenCalledWith(
      'w1',
      { label: 'L', pageType: 'campaign', limit: 3 },
      COMPANY,
    );
  });

  it('POST /execution/heartbeat → execution.heartbeat(workerKey, meta, companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.executionHeartbeat(
      { workerKey: 'w1', currentUrl: 'http://x', currentPageType: 'keyword' } as any,
      COMPANY,
    );
    expect(svcs.execution.heartbeat).toHaveBeenCalledWith(
      'w1',
      { currentUrl: 'http://x', currentPageType: 'keyword' },
      COMPANY,
    );
  });

  it('POST /execution/report → execution.report(body, companyId)', () => {
    const { ctrl, svcs } = makeController();
    const body = { taskId: 't1', workerKey: 'w1', status: 'done' };
    ctrl.executionReport(body as any, COMPANY);
    expect(svcs.execution.report).toHaveBeenCalledWith(body, COMPANY);
  });

  it('GET /config → config.getConfig(companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.getConfig(COMPANY);
    expect(svcs.config.getConfig).toHaveBeenCalledWith(COMPANY);
  });

  it('PATCH /config/:key → config.updateConfig(ads.key, value, companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.updateConfig('minRoas', { value: 200 } as any, COMPANY);
    expect(svcs.config.updateConfig).toHaveBeenCalledWith('ads.minRoas', 200, COMPANY);
  });
});

describe('AdvertisingController — POST /actions 7 sub-action dispatch', () => {
  let svcs: ReturnType<typeof makeServices>;
  let ctrl: AdvertisingController;

  beforeEach(() => {
    ({ ctrl, svcs } = makeController());
  });

  it('action=generate → action.generateActions(companyId)', () => {
    ctrl.handleActionCommand({ action: 'generate' } as any, COMPANY);
    expect(svcs.action.generateActions).toHaveBeenCalledWith(COMPANY);
  });

  it('action=approve → action.approveActions(ids, companyId)', () => {
    ctrl.handleActionCommand({ action: 'approve', ids: ['a', 'b'] } as any, COMPANY);
    expect(svcs.action.approveActions).toHaveBeenCalledWith(['a', 'b'], COMPANY);
  });

  it('action=approve (ids 없음) → empty array 전달', () => {
    ctrl.handleActionCommand({ action: 'approve' } as any, COMPANY);
    expect(svcs.action.approveActions).toHaveBeenCalledWith([], COMPANY);
  });

  it('action=reject → action.rejectActions(ids, companyId)', () => {
    ctrl.handleActionCommand({ action: 'reject', ids: ['a'] } as any, COMPANY);
    expect(svcs.action.rejectActions).toHaveBeenCalledWith(['a'], COMPANY);
  });

  it('action=markRunning → action.markRunning(id, beforeJson, companyId)', () => {
    ctrl.handleActionCommand(
      { action: 'markRunning', id: 'x', beforeJson: { before: 1 } } as any,
      COMPANY,
    );
    expect(svcs.action.markRunning).toHaveBeenCalledWith('x', { before: 1 }, COMPANY);
  });

  it('action=markRunning (id 없음) → BadRequestException', () => {
    expect(() =>
      ctrl.handleActionCommand({ action: 'markRunning' } as any, COMPANY),
    ).toThrow(BadRequestException);
  });

  it('action=markDone → action.markDone(id, afterJson, companyId)', () => {
    ctrl.handleActionCommand(
      { action: 'markDone', id: 'x', afterJson: { after: 1 } } as any,
      COMPANY,
    );
    expect(svcs.action.markDone).toHaveBeenCalledWith('x', { after: 1 }, COMPANY);
  });

  it('action=markDone (id 없음) → BadRequestException', () => {
    expect(() =>
      ctrl.handleActionCommand({ action: 'markDone' } as any, COMPANY),
    ).toThrow(BadRequestException);
  });

  it('action=markFailed → action.markFailed(id, errorMessage, afterJson, companyId)', () => {
    ctrl.handleActionCommand(
      {
        action: 'markFailed',
        id: 'x',
        errorMessage: 'oops',
        afterJson: { after: 1 },
      } as any,
      COMPANY,
    );
    expect(svcs.action.markFailed).toHaveBeenCalledWith('x', 'oops', { after: 1 }, COMPANY);
  });

  it('action=markFailed (id 없음) → BadRequestException', () => {
    expect(() =>
      ctrl.handleActionCommand({ action: 'markFailed' } as any, COMPANY),
    ).toThrow(BadRequestException);
  });

  it('action=resetFailed → action.resetFailed(companyId)', () => {
    ctrl.handleActionCommand({ action: 'resetFailed' } as any, COMPANY);
    expect(svcs.action.resetFailed).toHaveBeenCalledWith(COMPANY);
  });

  it('unknown action → BadRequestException', () => {
    expect(() =>
      ctrl.handleActionCommand({ action: 'nonexistent' } as any, COMPANY),
    ).toThrow(BadRequestException);
  });
});

describe('AdvertisingController — companyId 격리 (ADR-0006)', () => {
  it('서로 다른 companyId 는 각각 전파 (cross-tenant 흘림 없음)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.getHub('company-a');
    ctrl.getHub('company-b');
    expect(svcs.advertising.getHubData).toHaveBeenNthCalledWith(1, 'company-a');
    expect(svcs.advertising.getHubData).toHaveBeenNthCalledWith(2, 'company-b');
  });
});
