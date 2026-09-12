import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { RulesModule } from '../rules.module';
import { RuleEvaluationController } from '../controllers/rule-evaluation.controller';
import { RulesManagementController } from '../controllers/rules-management.controller';
import { PrismaModule } from '../../prisma/prisma.module';

const organizationId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const user = { id: '00000000-0000-0000-0000-000000000099' };
function service() { return { evaluateAll: vi.fn(), getSummary: vi.fn(), findAllRules: vi.fn(), updateRule: vi.fn() }; }
function route(controller: { prototype: object }, name: string) {
  const handler = Reflect.get(controller.prototype, name) as object;
  return { method: Reflect.getMetadata(METHOD_METADATA, handler), path: Reflect.getMetadata(PATH_METADATA, handler) };
}

describe('Rules retained HTTP surface', () => {
  it('wires only deterministic evaluation and management controllers', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, RulesModule) ?? [];
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, RulesModule) ?? [];
    expect(controllers).toEqual(expect.arrayContaining([RuleEvaluationController, RulesManagementController]));
    expect(imports).toContain(PrismaModule);
    expect(imports.some((module: Function) => module.name === 'OperationsModule')).toBe(false);
    expect(controllers.map((controller: Function) => controller.name)).not.toContain('RuleSuggestionsController');
  });

  it('evaluates synchronously with the authenticated organization, actor, and request key', async () => {
    expect(Reflect.getMetadata(PATH_METADATA, RuleEvaluationController)).toBe('rules');
    expect(route(RuleEvaluationController, 'evaluate')).toEqual({ method: RequestMethod.POST, path: 'evaluate' });
    expect(route(RulesManagementController, 'update')).toEqual({ method: RequestMethod.PATCH, path: ':id' });
    const mocked = service();
    mocked.evaluateAll.mockResolvedValue({ requestId: 'request-1', status: 'completed' });
    await expect(new RuleEvaluationController(mocked as never).evaluate(organizationId, user as never, 'request-1')).resolves.toEqual({ requestId: 'request-1', status: 'completed' });
    expect(mocked.evaluateAll).toHaveBeenCalledWith({
      organizationId,
      requestedByUserId: user.id,
      idempotencyKey: 'request-1',
    });
  });
});
