import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';

vi.mock('../../../../application/service/ad-strategy.service', () => ({
  AdStrategyService: class AdStrategyService {},
}));

import { AdvertisingActionsController } from '../advertising-actions.controller';
import { AdvertisingCampaignsController } from '../advertising-campaigns.controller';
import { AdvertisingConfigController } from '../advertising-config.controller';
import { AdvertisingDiagnosticsController } from '../advertising-diagnostics.controller';
import { AdvertisingExecutionController } from '../advertising-execution.controller';
import { AdvertisingIngestController } from '../advertising-ingest.controller';
import { AdvertisingOverviewController } from '../advertising-overview.controller';
import { AdvertisingStrategyController } from '../advertising-strategy.controller';

// Controller wiring: this spec keeps the cases where the controller does
// real work — defaults, body→service transformations, command/sub-action
// dispatch (including BadRequest), and cross-tenant organizationId propagation.
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
      getCampaignSyncStatus: vi.fn(),
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

function makeControllers(svcs = makeServices()) {
  const overviewCtrl = new AdvertisingOverviewController(svcs.advertising as any);
  const campaignsCtrl = new AdvertisingCampaignsController(
    svcs.campaigns as any,
    svcs.strategy as any,
  );
  const strategyCtrl = new AdvertisingStrategyController(svcs.strategy as any);
  const diagnosticsCtrl = new AdvertisingDiagnosticsController(svcs.benchmark as any);
  const ingestCtrl = new AdvertisingIngestController(
    svcs.collect as any,
    svcs.sync as any,
  );
  const actionCtrl = new AdvertisingActionsController(svcs.action as any);
  const executionCtrl = new AdvertisingExecutionController(svcs.execution as any);
  const configCtrl = new AdvertisingConfigController(svcs.config as any);

  return {
    overviewCtrl,
    campaignsCtrl,
    strategyCtrl,
    diagnosticsCtrl,
    ingestCtrl,
    actionCtrl,
    executionCtrl,
    configCtrl,
    svcs,
  };
}

function makeActionController(svcs = makeServices()) {
  const { actionCtrl, svcs: services } = makeControllers(svcs);
  return { ctrl: actionCtrl, svcs: services };
}

function makeIngestController(svcs = makeServices()) {
  const { ingestCtrl, svcs: services } = makeControllers(svcs);
  return { ctrl: ingestCtrl, svcs: services };
}

function makeExecutionController(svcs = makeServices()) {
  const { executionCtrl, svcs: services } = makeControllers(svcs);
  return { ctrl: executionCtrl, svcs: services };
}

function makeConfigController(svcs = makeServices()) {
  const { configCtrl, svcs: services } = makeControllers(svcs);
  return { ctrl: configCtrl, svcs: services };
}

function makeOverviewController(svcs = makeServices()) {
  const { overviewCtrl, svcs: services } = makeControllers(svcs);
  return { ctrl: overviewCtrl, svcs: services };
}

function makeCampaignsController(svcs = makeServices()) {
  const { campaignsCtrl, svcs: services } = makeControllers(svcs);
  return { ctrl: campaignsCtrl, svcs: services };
}

function makeStrategyController(svcs = makeServices()) {
  const { strategyCtrl, svcs: services } = makeControllers(svcs);
  return { ctrl: strategyCtrl, svcs: services };
}

const COMPANY = 'organization-1';

describe('AdvertisingController — defaults + body transformations', () => {
  it('PATCH /:id/tier extracts adTier from body before delegating', () => {
    const { ctrl, svcs } = makeOverviewController();
    ctrl.changeTier('ad-1', { adTier: 'A' } as any, COMPANY);
    expect(svcs.advertising.changeTier).toHaveBeenCalledWith('ad-1', 'A', COMPANY);
  });

  it('GET /campaigns falls back to period 7d when query omitted', () => {
    const { ctrl, svcs } = makeCampaignsController();
    ctrl.getCampaigns({} as any, COMPANY);
    expect(svcs.campaigns.getCampaigns).toHaveBeenCalledWith('7d', COMPANY);
  });

  it('GET /campaigns/sync-status uses the authenticated organization scope', () => {
    const { ctrl, svcs } = makeCampaignsController();

    ctrl.getCampaignSyncStatus(COMPANY);

    expect(svcs.campaigns.getCampaignSyncStatus).toHaveBeenCalledWith(COMPANY);
  });

  it('GET /campaigns/trends passes an inclusive custom date range', () => {
    const { ctrl, svcs } = makeCampaignsController();
    ctrl.getTrends(
      { from: '2026-07-01', to: '2026-07-24' },
      COMPANY,
    );

    expect(svcs.campaigns.getTrends).toHaveBeenCalledWith(
      '14d',
      undefined,
      COMPANY,
      {
        from: new Date('2026-07-01T00:00:00.000Z'),
        to: new Date('2026-07-24T00:00:00.000Z'),
      },
    );
  });

  it('GET /campaigns/trends rejects reversed or over-90-day ranges', () => {
    const { ctrl } = makeCampaignsController();

    expect(() =>
      ctrl.getTrends(
        { from: '2026-07-24', to: '2026-07-01' },
        COMPANY,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      ctrl.getTrends(
        { from: '2026-01-01', to: '2026-07-24' },
        COMPANY,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      ctrl.getTrends(
        { from: '2026-02-31', to: '2026-03-03' },
        COMPANY,
      ),
    ).toThrow(BadRequestException);
  });

  it('GET /strategy/rules falls back to period 14d when query omitted', () => {
    const { ctrl, svcs } = makeStrategyController();
    ctrl.getRules({} as any, COMPANY);
    expect(svcs.strategy.getRules).toHaveBeenCalledWith('14d', COMPANY);
  });

  it('POST /execution/lease bundles label/pageType/limit into options object', () => {
    const { ctrl, svcs } = makeExecutionController();
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
    const { ctrl, svcs } = makeExecutionController();
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
    const { ctrl, svcs } = makeConfigController();
    ctrl.updateConfig('minRoas', { value: 200 } as any, COMPANY);
    expect(svcs.config.updateConfig).toHaveBeenCalledWith('ads.minRoas', 200, COMPANY);
  });
});

describe('AdvertisingController — POST /scrape-targets dispatch', () => {
  it('action=markScraped → sync.markScraped(id, organizationId)', () => {
    const { ctrl, svcs } = makeIngestController();
    ctrl.handleScrapeTarget({ action: 'markScraped', id: 'target-1' } as any, COMPANY);
    expect(svcs.sync.markScraped).toHaveBeenCalledWith('target-1', COMPANY);
  });

  it('create body → sync.createScrapeTarget(url, label, category, organizationId)', () => {
    const { ctrl, svcs } = makeIngestController();
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
  let ctrl: AdvertisingActionsController;

  beforeEach(() => {
    ({ ctrl, svcs } = makeActionController());
  });

  it('action=generate → action.generateActions(organizationId)', () => {
    ctrl.handleActionCommand({ action: 'generate' } as any, COMPANY);
    expect(svcs.action.generateActions).toHaveBeenCalledWith(COMPANY);
  });

  it('action=approve → action.approveActions(ids, organizationId)', () => {
    ctrl.handleActionCommand({ action: 'approve', ids: ['a', 'b'] } as any, COMPANY);
    expect(svcs.action.approveActions).toHaveBeenCalledWith(['a', 'b'], COMPANY);
  });

  it('action=approve (ids 없음) → empty array 전달', () => {
    ctrl.handleActionCommand({ action: 'approve' } as any, COMPANY);
    expect(svcs.action.approveActions).toHaveBeenCalledWith([], COMPANY);
  });

  it('action=reject → action.rejectActions(ids, organizationId)', () => {
    ctrl.handleActionCommand({ action: 'reject', ids: ['a'] } as any, COMPANY);
    expect(svcs.action.rejectActions).toHaveBeenCalledWith(['a'], COMPANY);
  });

  it('action=markRunning → action.markRunning(id, beforeJson, organizationId)', () => {
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

  it('action=markDone → action.markDone(id, afterJson, organizationId)', () => {
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

  it('action=markFailed → action.markFailed(id, errorMessage, afterJson, organizationId)', () => {
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

  it('action=resetFailed → action.resetFailed(organizationId)', () => {
    ctrl.handleActionCommand({ action: 'resetFailed' } as any, COMPANY);
    expect(svcs.action.resetFailed).toHaveBeenCalledWith(COMPANY);
  });

  it('unknown action → BadRequestException', () => {
    expect(() =>
      ctrl.handleActionCommand({ action: 'nonexistent' } as any, COMPANY),
    ).toThrow(BadRequestException);
  });
});

describe('AdvertisingController — organizationId 격리', () => {
  it('서로 다른 organizationId 는 각각 전파 (cross-tenant 흘림 없음)', () => {
    const { ctrl, svcs } = makeOverviewController();
    ctrl.getHub('organization-a');
    ctrl.getHub('organization-b');
    expect(svcs.advertising.getHubData).toHaveBeenNthCalledWith(1, 'organization-a');
    expect(svcs.advertising.getHubData).toHaveBeenNthCalledWith(2, 'organization-b');
  });
});
