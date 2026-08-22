import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RulesService } from '../services/rules.service';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OPERATION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const RULE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeService() {
  const prisma = {
    activityEvent: { createMany: vi.fn() },
    alert: { createManyAndReturn: vi.fn() },
    masterProduct: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    businessRule: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  const operations = { start: vi.fn(), get: vi.fn() };
  const judgment = { submit: vi.fn() };
  const eventEmitter = { emit: vi.fn() };
  const operationAlerts = { start: vi.fn(), succeed: vi.fn(), fail: vi.fn() };
  return {
    service: new RulesService(
      prisma as never,
      operations as never,
      judgment as never,
      eventEmitter as never,
      operationAlerts as never,
    ),
    prisma,
    operations,
    judgment,
    operationAlerts,
  };
}

describe('RulesService boundaries', () => {
  it('fails closed when a system caller attempts deterministic evaluation', async () => {
    const { service, operations } = makeService();

    await expect(service.evaluateAll(ORGANIZATION_ID, null))
      .rejects.toThrow('RULES_EVALUATION_ACTOR_REQUIRED');
    expect(operations.start).not.toHaveBeenCalled();
  });

  it('fails closed when a system caller attempts threshold judgment', async () => {
    const { service, judgment } = makeService();

    await expect(service.suggestThresholds(ORGANIZATION_ID, null))
      .rejects.toThrow('RULES_SUGGEST_JUDGMENT_ACTOR_REQUIRED');
    expect(judgment.submit).not.toHaveBeenCalled();
  });

  it('reads evaluation status from the organization-scoped owner Operation', async () => {
    const { service, operations } = makeService();
    const operation = { id: OPERATION_ID, operationKey: 'rules.evaluate', status: 'running' };
    operations.get.mockResolvedValue(operation);

    await expect(service.getEvaluationStatus(ORGANIZATION_ID, OPERATION_ID)).resolves.toBe(operation);
    expect(operations.get).toHaveBeenCalledWith(ORGANIZATION_ID, OPERATION_ID);
  });

  it('does not expose another operation as Rules evaluation status', async () => {
    const { service, operations } = makeService();
    operations.get.mockResolvedValue({ id: OPERATION_ID, operationKey: 'orders.collect' });

    await expect(service.getEvaluationStatus(ORGANIZATION_ID, OPERATION_ID))
      .rejects.toThrow(NotFoundException);
  });

  it('preserves the rule update organization fence', async () => {
    const { service, prisma } = makeService();
    prisma.businessRule.findFirst.mockResolvedValue(null);

    await expect(service.updateRule(RULE_ID, ORGANIZATION_ID, { active: false }))
      .rejects.toThrow(NotFoundException);
    expect(prisma.businessRule.findFirst).toHaveBeenCalledWith({
      where: { id: RULE_ID, organizationId: ORGANIZATION_ID },
    });
    expect(prisma.businessRule.update).not.toHaveBeenCalled();
  });

  it('contains no non-test generic AgentRun runner or result bridge dependency', () => {
    const rulesRoot = resolve(__dirname, '..');
    for (const relativePath of [
      'services/rules.service.ts',
      'rules.module.ts',
      'controllers/rule-evaluation.controller.ts',
      'controllers/rule-suggestions.controller.ts',
      'adapter/in/operation/rules-evaluation.operation-handler.ts',
      'adapter/in/agent/rules-evaluation-capability.adapter.ts',
    ]) {
      const source = readFileSync(resolve(rulesRoot, relativePath), 'utf8');
      expect(source).not.toContain('AGENT_RUNNER_PORT');
      expect(source).not.toContain('AgentRunnerResult');
      expect(source).not.toContain('agent.run.finalized');
      expect(source).not.toContain('AgentRunRequest');
      expect(source).not.toContain('AgentRun');
    }
  });
});
