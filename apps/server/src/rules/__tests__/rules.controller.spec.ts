import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RulesController } from '../controllers/rules.controller';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RULE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeController() {
  const rulesService = {
    evaluateAll: vi.fn(),
    getEvaluationStatus: vi.fn(),
    getSummary: vi.fn(),
    findAllRules: vi.fn(),
    suggestThresholds: vi.fn(),
    updateRule: vi.fn(),
  };

  return {
    controller: new RulesController(rulesService as never),
    rulesService,
  };
}

describe('RulesController evaluation routes', () => {
  it('forwards evaluate to RulesService.evaluateAll with @CurrentOrganization scope', async () => {
    const { controller, rulesService } = makeController();
    rulesService.evaluateAll.mockResolvedValue({ requestId: 'request-1', status: 'pending' });

    await expect(controller.evaluate(ORGANIZATION_ID)).resolves.toEqual({
      requestId: 'request-1',
      status: 'pending',
    });

    expect(rulesService.evaluateAll).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it('forwards getEvaluationStatus to RulesService with (organizationId, requestId)', () => {
    const { controller, rulesService } = makeController();

    controller.getEvaluationStatus(ORGANIZATION_ID, 'request-1');

    // The status read goes through AgentObservabilityService inside the
    // service; the controller must scope by both organizationId (IDOR-safe)
    // and the v2 requestId path param.
    expect(rulesService.getEvaluationStatus).toHaveBeenCalledWith(ORGANIZATION_ID, 'request-1');
  });
});

describe('RulesController schedule routes — Agent OS v2 migration stub', () => {
  // TODO(agent-os v2): rewrite for new contracts.
  // Legacy `AgentScheduleControlPort` (and its tenant-owned `rules_evaluation`
  // cron contract) was deleted with `agent-registry`. Until Agent OS v2 ships
  // the replacement schedule surface (`AgentInstance.runtimeConfig` /
  // `AgentRunRequest.scheduledFor`), the rules controller returns 503.
  it('GET /schedule throws ServiceUnavailable while v2 migration is in flight', () => {
    const { controller } = makeController();

    expect(() => controller.getSchedule()).toThrow(ServiceUnavailableException);
  });

  it('PATCH /schedule throws ServiceUnavailable while v2 migration is in flight', () => {
    const { controller } = makeController();

    expect(() => controller.updateSchedule({ schedule: '0 9 * * *' } as never)).toThrow(
      ServiceUnavailableException,
    );
  });
});

describe('RulesController.update — tenant scope', () => {
  it('forwards id, @CurrentOrganization organizationId, and body to RulesService.updateRule', () => {
    const { controller, rulesService } = makeController();
    const body = { active: false, threshold: { min: 10 } };

    controller.update(RULE_ID, ORGANIZATION_ID, body as never);

    // Multi-tenant scope: organizationId must reach the service so it can scope the
    // tenant-scoped read before the write (apps/server/AGENTS.md 멀티테넌트 격리).
    expect(rulesService.updateRule).toHaveBeenCalledWith(RULE_ID, ORGANIZATION_ID, body);
  });
});
