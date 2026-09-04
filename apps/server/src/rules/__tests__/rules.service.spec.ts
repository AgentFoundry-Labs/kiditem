import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RulesService } from '../services/rules.service';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RULE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeService() {
  const prisma = {
    activityEvent: { createMany: vi.fn() },
    alert: { createMany: vi.fn() },
    masterProduct: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    businessRule: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    service: new RulesService(prisma as never),
    prisma,
  };
}

describe('RulesService boundaries', () => {
  it('fails closed when a system caller attempts deterministic evaluation', async () => {
    const { service, prisma } = makeService();

    await expect(service.evaluateAll({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: null,
      idempotencyKey: 'request-1',
    }))
      .rejects.toThrow('RULES_EVALUATION_ACTOR_REQUIRED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
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

});
