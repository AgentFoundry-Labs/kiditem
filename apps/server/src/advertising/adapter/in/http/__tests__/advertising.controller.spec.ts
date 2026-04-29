import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';

vi.mock('../../../../services/ad-strategy.service', () => ({
  AdStrategyService: class AdStrategyService {},
}));

import { AdvertisingController } from '../advertising.controller';

// Controller wiring: this spec keeps the cases where the controller does
// real work — defaults, body→service transformations, command/sub-action
// dispatch (including BadRequest), and cross-tenant companyId propagation.
// Pure pass-through GETs are removed because TypeScript signatures + the
// service unit/integration suites already cover them; see the Phase 3B
// Lane C plan ("Test Cleanup Inventory") for the full rationale.

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

describe('AdvertisingController — defaults + body transformations', () => {
  it('PATCH /:id/tier extracts adTier from body before delegating', () => {
    const { ctrl, svcs } = makeController();
    ctrl.changeTier('ad-1', { adTier: 'A' } as any, COMPANY);
    expect(svcs.advertising.changeTier).toHaveBeenCalledWith('ad-1', 'A', COMPANY);
  });

  it('GET /campaigns falls back to period 7d when query omitted', () => {
    const { ctrl, svcs } = makeController();
    ctrl.getCampaigns({} as any, COMPANY);
    expect(svcs.campaigns.getCampaigns).toHaveBeenCalledWith('7d', undefined, COMPANY);
  });

  it('GET /strategy/rules falls back to period 14d when query omitted', () => {
    const { ctrl, svcs } = makeController();
    ctrl.getRules({} as any, COMPANY);
    expect(svcs.strategy.getRules).toHaveBeenCalledWith('14d', COMPANY);
  });

  it('POST /execution/lease bundles label/pageType/limit into options object', () => {
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

  it('POST /execution/heartbeat bundles currentUrl/currentPageType into meta', () => {
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

  it('PATCH /config/:key prefixes the key with "ads." before delegating', () => {
    const { ctrl, svcs } = makeController();
    ctrl.updateConfig('minRoas', { value: 200 } as any, COMPANY);
    expect(svcs.config.updateConfig).toHaveBeenCalledWith('ads.minRoas', 200, COMPANY);
  });
});

describe('AdvertisingController — POST /scrape-targets dispatch', () => {
  it('action=markScraped → sync.markScraped(id, companyId)', () => {
    const { ctrl, svcs } = makeController();
    ctrl.handleScrapeTarget({ action: 'markScraped', id: 'target-1' } as any, COMPANY);
    expect(svcs.sync.markScraped).toHaveBeenCalledWith('target-1', COMPANY);
  });

  it('create body → sync.createScrapeTarget(url, label, category, companyId)', () => {
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
});

describe('AdvertisingController — POST /actions sub-action dispatch', () => {
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
