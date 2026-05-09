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

const USER: { id: string; organizationId: string; membershipId: string | null; role: string; type: string; email: string } = {
  id: '00000000-0000-0000-0000-000000000099',
  organizationId: ORGANIZATION_ID,
  membershipId: null,
  role: 'admin',
  type: 'human',
  email: 'tester@example.com',
};

describe('RulesController evaluation routes', () => {
  it('forwards evaluate to RulesService.evaluateAll with @CurrentOrganization + actor', async () => {
    const { controller, rulesService } = makeController();
    rulesService.evaluateAll.mockResolvedValue({ requestId: 'request-1', status: 'pending' });

    await expect(controller.evaluate(ORGANIZATION_ID, USER)).resolves.toEqual({
      requestId: 'request-1',
      status: 'pending',
    });

    expect(rulesService.evaluateAll).toHaveBeenCalledWith(ORGANIZATION_ID, USER.id);
  });

  it('forwards getEvaluationStatus to RulesService with (organizationId, requestId)', () => {
    const { controller, rulesService } = makeController();

    controller.getEvaluationStatus(ORGANIZATION_ID, 'request-1');

    // The status read goes through AgentObservabilityService inside the
    // service; the controller must scope by both organizationId (IDOR-safe)
    // and the requestId path param.
    expect(rulesService.getEvaluationStatus).toHaveBeenCalledWith(ORGANIZATION_ID, 'request-1');
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
