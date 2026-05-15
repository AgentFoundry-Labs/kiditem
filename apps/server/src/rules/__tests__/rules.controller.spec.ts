import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { RulesModule } from '../rules.module';
import { RuleEvaluationController } from '../controllers/rule-evaluation.controller';
import { RuleSuggestionsController } from '../controllers/rule-suggestions.controller';
import { RulesManagementController } from '../controllers/rules-management.controller';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RULE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeRulesService() {
  const rulesService = {
    evaluateAll: vi.fn(),
    getEvaluationStatus: vi.fn(),
    getSummary: vi.fn(),
    findAllRules: vi.fn(),
    suggestThresholds: vi.fn(),
    updateRule: vi.fn(),
  };

  return rulesService;
}

const USER: {
  id: string;
  organizationId: string;
  membershipId: string | null;
  role: string;
  type: string;
  email: string;
} = {
  id: '00000000-0000-0000-0000-000000000099',
  organizationId: ORGANIZATION_ID,
  membershipId: null,
  role: 'admin',
  type: 'human',
  email: 'tester@example.com',
};

describe('Rules route-family controllers', () => {
  it('registers the split controllers in RulesModule', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      RulesModule,
    ) as unknown[];

    expect(controllers).toContain(RuleEvaluationController);
    expect(controllers).toContain(RulesManagementController);
    expect(controllers).toContain(RuleSuggestionsController);
  });

  it('preserves the existing route URLs by route family', () => {
    expect(controllerPath(RuleEvaluationController)).toBe('rules');
    expect(route(RuleEvaluationController, 'evaluate')).toEqual({
      method: RequestMethod.POST,
      path: 'evaluate',
    });
    expect(route(RuleEvaluationController, 'getEvaluationStatus')).toEqual({
      method: RequestMethod.GET,
      path: 'evaluate/status/:requestId',
    });

    expect(controllerPath(RulesManagementController)).toBe('rules');
    expect(route(RulesManagementController, 'summary')).toEqual({
      method: RequestMethod.GET,
      path: 'summary',
    });
    expect(route(RulesManagementController, 'findAll')).toEqual({
      method: RequestMethod.GET,
      path: '/',
    });
    expect(route(RulesManagementController, 'update')).toEqual({
      method: RequestMethod.PATCH,
      path: ':id',
    });

    expect(controllerPath(RuleSuggestionsController)).toBe('rules');
    expect(route(RuleSuggestionsController, 'suggestThresholds')).toEqual({
      method: RequestMethod.GET,
      path: 'suggest-thresholds',
    });
  });
});

describe('RuleEvaluationController evaluation routes', () => {
  it('forwards evaluate to RulesService.evaluateAll with @CurrentOrganization + actor', async () => {
    const rulesService = makeRulesService();
    const controller = new RuleEvaluationController(rulesService as never);
    rulesService.evaluateAll.mockResolvedValue({ requestId: 'request-1', status: 'pending' });

    await expect(controller.evaluate(ORGANIZATION_ID, USER)).resolves.toEqual({
      requestId: 'request-1',
      status: 'pending',
    });

    expect(rulesService.evaluateAll).toHaveBeenCalledWith(ORGANIZATION_ID, USER.id);
  });

  it('forwards getEvaluationStatus to RulesService with (organizationId, requestId)', () => {
    const rulesService = makeRulesService();
    const controller = new RuleEvaluationController(rulesService as never);

    controller.getEvaluationStatus(ORGANIZATION_ID, 'request-1');

    // The status read goes through AgentObservabilityService inside the
    // service; the controller must scope by both organizationId (IDOR-safe)
    // and the requestId path param.
    expect(rulesService.getEvaluationStatus).toHaveBeenCalledWith(ORGANIZATION_ID, 'request-1');
  });
});

describe('RulesManagementController management routes', () => {
  it('forwards summary to RulesService.getSummary with @CurrentOrganization', async () => {
    const rulesService = makeRulesService();
    const controller = new RulesManagementController(rulesService as never);
    rulesService.getSummary.mockResolvedValue({ total: 0 });

    await expect(controller.summary(ORGANIZATION_ID)).resolves.toEqual({ total: 0 });

    expect(rulesService.getSummary).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it('forwards list category query to RulesService.findAllRules', async () => {
    const rulesService = makeRulesService();
    const controller = new RulesManagementController(rulesService as never);
    rulesService.findAllRules.mockResolvedValue([]);

    await expect(
      controller.findAll(ORGANIZATION_ID, { category: 'profitability' }),
    ).resolves.toEqual([]);

    expect(rulesService.findAllRules).toHaveBeenCalledWith(ORGANIZATION_ID, 'profitability');
  });

  it('forwards id, @CurrentOrganization organizationId, and body to RulesService.updateRule', () => {
    const rulesService = makeRulesService();
    const controller = new RulesManagementController(rulesService as never);
    const body = { active: false, threshold: { min: 10 } };

    controller.update(RULE_ID, ORGANIZATION_ID, body as never);

    // Multi-tenant scope: organizationId must reach the service so it can scope the
    // tenant-scoped read before the write (apps/server/AGENTS.md 멀티테넌트 격리).
    expect(rulesService.updateRule).toHaveBeenCalledWith(RULE_ID, ORGANIZATION_ID, body);
  });
});

describe('RuleSuggestionsController suggestion routes', () => {
  it('forwards suggestThresholds to RulesService.suggestThresholds with actor', async () => {
    const rulesService = makeRulesService();
    const controller = new RuleSuggestionsController(rulesService as never);
    rulesService.suggestThresholds.mockResolvedValue({
      requestId: 'request-2',
      status: 'pending',
    });

    await expect(controller.suggestThresholds(ORGANIZATION_ID, USER)).resolves.toEqual({
      requestId: 'request-2',
      status: 'pending',
    });

    expect(rulesService.suggestThresholds).toHaveBeenCalledWith(ORGANIZATION_ID, USER.id);
  });
});

type ControllerClass = { prototype: object };

function controllerPath(controller: ControllerClass) {
  return Reflect.getMetadata(PATH_METADATA, controller);
}

function route(controller: ControllerClass, methodName: string) {
  const handler = Reflect.get(controller.prototype, methodName) as object;
  return {
    method: Reflect.getMetadata(METHOD_METADATA, handler),
    path: Reflect.getMetadata(PATH_METADATA, handler),
  };
}
