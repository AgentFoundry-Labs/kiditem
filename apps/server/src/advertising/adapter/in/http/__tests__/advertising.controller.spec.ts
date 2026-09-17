import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdvertisingActionsController } from '../advertising-actions.controller';
import { AdActionCommandDto } from '../dto';
import { AdvertisingCampaignsController } from '../advertising-campaigns.controller';
import { AdvertisingConfigController } from '../advertising-config.controller';
import { AdvertisingDiagnosticsController } from '../advertising-diagnostics.controller';
import { AdvertisingIngestController } from '../advertising-ingest.controller';
import { AdvertisingOverviewController } from '../advertising-overview.controller';
import { AdvertisingStrategyController } from '../advertising-strategy.controller';

vi.mock('../../../../application/service/ad-strategy.service', () => ({
  AdStrategyService: class AdStrategyService {},
}));

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
      registerCampaign: vi.fn(),
    },
    benchmark: { getDiagnosis: vi.fn() },
    extension: {
      getExtensionStatus: vi.fn(),
    },
    action: {
      getActions: vi.fn(),
      generateActions: vi.fn(),
      approveActions: vi.fn(),
      rejectActions: vi.fn(),
      markRunning: vi.fn(),
      markDone: vi.fn(),
      markFailed: vi.fn(),
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
    svcs.extension as any,
  );
  const actionCtrl = new AdvertisingActionsController(svcs.action as any);
  const configCtrl = new AdvertisingConfigController(svcs.config as any);

  return {
    overviewCtrl,
    campaignsCtrl,
    strategyCtrl,
    diagnosticsCtrl,
    ingestCtrl,
    actionCtrl,
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

describe('AdvertisingController — overview surface', () => {
  it('exposes no operator ad-tier write', () => {
    const { ctrl } = makeOverviewController();
    expect('changeTier' in Object.getPrototypeOf(ctrl)).toBe(false);
  });
});

describe('AdvertisingController — defaults + body transformations', () => {
  it('GET /campaigns falls back to period 7d when query omitted', () => {
    const { ctrl, svcs } = makeCampaignsController();
    ctrl.getCampaigns({} as any, COMPANY);
    expect(svcs.campaigns.getCampaigns).toHaveBeenCalledWith('7d', COMPANY);
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

  it('PATCH /config/:key prefixes the key with "ads." before delegating', () => {
    const { ctrl, svcs } = makeConfigController();
    ctrl.updateConfig('minRoas', { value: 200 } as any, COMPANY);
    expect(svcs.config.updateConfig).toHaveBeenCalledWith('ads.minRoas', 200, COMPANY);
  });
});

describe('AdvertisingController — extension status', () => {
  it('retains the status read while exposing no generic extension write method', () => {
    const { ctrl, svcs } = makeIngestController();

    ctrl.extensionStatus(COMPANY);

    expect(svcs.extension.getExtensionStatus).toHaveBeenCalledWith(COMPANY);
    expect('extensionSync' in Object.getPrototypeOf(ctrl)).toBe(false);
    expect('getScrapeTargets' in Object.getPrototypeOf(ctrl)).toBe(false);
    expect('handleScrapeTarget' in Object.getPrototypeOf(ctrl)).toBe(false);
    expect('deleteScrapeTarget' in Object.getPrototypeOf(ctrl)).toBe(false);
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

  it('action=approve → action.approveActions(ids, organizationId, the review it expects)', () => {
    ctrl.handleActionCommand({ action: 'approve', ids: ['a', 'b'] } as any, COMPANY);
    expect(svcs.action.approveActions).toHaveBeenCalledWith(['a', 'b'], COMPANY, {
      expectedApprovalStatus: undefined,
    });
    ctrl.handleActionCommand(
      { action: 'approve', ids: ['a'], expectedApprovalStatus: 'pending_review' } as any,
      COMPANY,
    );
    expect(svcs.action.approveActions).toHaveBeenLastCalledWith(['a'], COMPANY, {
      expectedApprovalStatus: 'pending_review',
    });
  });

  it('action=approve (ids 없음) → empty array 전달', () => {
    ctrl.handleActionCommand({ action: 'approve' } as any, COMPANY);
    expect(svcs.action.approveActions).toHaveBeenCalledWith([], COMPANY, {
      expectedApprovalStatus: undefined,
    });
  });

  it('action=reject → action.rejectActions(ids, organizationId, the review it expects)', () => {
    ctrl.handleActionCommand({ action: 'reject', ids: ['a'] } as any, COMPANY);
    expect(svcs.action.rejectActions).toHaveBeenCalledWith(['a'], COMPANY, {
      expectedApprovalStatus: undefined,
    });
    ctrl.handleActionCommand(
      { action: 'reject', ids: ['a'], expectedApprovalStatus: 'approved' } as any,
      COMPANY,
    );
    expect(svcs.action.rejectActions).toHaveBeenLastCalledWith(['a'], COMPANY, {
      expectedApprovalStatus: 'approved',
    });
  });

  it('action=markRunning → action.markRunning(id, executionTaskId, beforeJson, organizationId)', () => {
    ctrl.handleActionCommand(
      { action: 'markRunning', id: 'x', executionTaskId: 'task-x', beforeJson: { before: 1 } } as any,
      COMPANY,
    );
    expect(svcs.action.markRunning).toHaveBeenCalledWith('x', 'task-x', { before: 1 }, COMPANY);
  });

  it('action=markDone → action.markDone(id, executionTaskId, afterJson, organizationId)', () => {
    ctrl.handleActionCommand(
      { action: 'markDone', id: 'x', executionTaskId: 'task-x', afterJson: { after: 1 } } as any,
      COMPANY,
    );
    expect(svcs.action.markDone).toHaveBeenCalledWith('x', 'task-x', { after: 1 }, COMPANY);
  });

  it('action=markFailed → action.markFailed(id, executionTaskId, errorMessage, afterJson, organizationId)', () => {
    ctrl.handleActionCommand(
      {
        action: 'markFailed',
        id: 'x',
        executionTaskId: 'task-x',
        errorMessage: 'oops',
        afterJson: { after: 1 },
      } as any,
      COMPANY,
    );
    expect(svcs.action.markFailed).toHaveBeenCalledWith(
      'x',
      'task-x',
      'oops',
      { after: 1 },
      COMPANY,
    );
  });

  // Every execution report names the attempt it reports for, so a report for
  // an older attempt can never move a newer one (KID-160).
  it.each(['markRunning', 'markDone', 'markFailed'] as const)(
    'action=%s without id or executionTaskId → BadRequestException',
    (action) => {
      for (const body of [
        { action },
        { action, executionTaskId: 'task-x' },
        { action, id: 'x' },
      ]) {
        expect(() => ctrl.handleActionCommand(body as any, COMPANY)).toThrow(
          BadRequestException,
        );
      }
      expect(svcs.action[action]).not.toHaveBeenCalled();
    },
  );

  it('action=resetFailed is retired → BadRequestException', () => {
    // Approving a failed action queues a new attempt instead.
    expect(() =>
      ctrl.handleActionCommand({ action: 'resetFailed' } as any, COMPANY),
    ).toThrow(BadRequestException);
  });

  it('unknown action → BadRequestException', () => {
    expect(() =>
      ctrl.handleActionCommand({ action: 'nonexistent' } as any, COMPANY),
    ).toThrow(BadRequestException);
  });
});

describe('AdvertisingController — POST /actions body validation (KID-211)', () => {
  // The global pipe main.ts installs, so a refused body is the 400 the route answers.
  const bodyPipe = new ValidationPipe({ whitelist: true, transform: true });
  const ACTION_ID = '11111111-1111-4111-8111-111111111111';
  const TASK_ID = '22222222-2222-4222-8222-222222222222';

  async function statusOf(body: Record<string, unknown>): Promise<number> {
    try {
      await bodyPipe.transform(body, { type: 'body', metatype: AdActionCommandDto });
      return 201;
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      return (error as BadRequestException).getStatus();
    }
  }

  it('answers 400 when an approve or reject id is not a UUID', async () => {
    for (const action of ['approve', 'reject']) {
      expect(await statusOf({ action, ids: [ACTION_ID] })).toBe(201);
      expect(await statusOf({ action, ids: [ACTION_ID, 'not-a-uuid'] })).toBe(400);
    }
  });

  it('answers 400 when an execution report names an action id that is not a UUID', async () => {
    for (const action of ['markRunning', 'markDone', 'markFailed']) {
      expect(await statusOf({ action, id: ACTION_ID, executionTaskId: TASK_ID })).toBe(201);
      expect(await statusOf({ action, id: 'not-a-uuid', executionTaskId: TASK_ID })).toBe(400);
    }
  });

  it('answers 400 when an approve or reject names a review it expects other than awaiting review or approved', async () => {
    for (const action of ['approve', 'reject']) {
      for (const expectedApprovalStatus of ['pending_review', 'approved']) {
        expect(await statusOf({ action, ids: [ACTION_ID], expectedApprovalStatus })).toBe(201);
      }
      for (const expectedApprovalStatus of ['rejected', '', 'APPROVED']) {
        expect(await statusOf({ action, ids: [ACTION_ID], expectedApprovalStatus })).toBe(400);
      }
    }
  });

  it('answers 400 for more than 200 ids, the action listing page size', async () => {
    const ids = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);

    expect(await statusOf({ action: 'approve', ids: ids(200) })).toBe(201);
    expect(await statusOf({ action: 'approve', ids: ids(201) })).toBe(400);
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
