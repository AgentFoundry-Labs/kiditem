import { describe, expect, it, vi } from 'vitest';
import { MallOperationOutcomeRepositoryAdapter } from './mall-operation-outcome.repository.adapter';

const ORG = '00000000-0000-4000-8000-000000000001';
const INPUT = {
  organizationId: ORG,
  actorUserId: null,
  idempotencyKey: 'key-1',
  mallKey: 'onch',
  operation: 'login_check',
  outcome: 'succeeded',
  reasonCode: null,
  message: null,
  itemCount: null,
  failedCount: null,
  warningCount: null,
};

describe('MallOperationOutcomeRepositoryAdapter', () => {
  it('returns the existing row for a repeated idempotency key without writing again', async () => {
    const existing = { id: 'row-1' };
    const prisma = {
      mallOperationOutcome: {
        findFirst: vi.fn(async (_args: { where: Record<string, unknown> }) => existing),
        create: vi.fn(),
      },
    };
    const adapter = new MallOperationOutcomeRepositoryAdapter(prisma as never);

    await expect(adapter.record(INPUT)).resolves.toBe(existing);
    expect(prisma.mallOperationOutcome.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG, idempotencyKey: 'key-1' } }),
    );
    expect(prisma.mallOperationOutcome.create).not.toHaveBeenCalled();
  });

  it('writes a new row under the organization', async () => {
    const prisma = {
      mallOperationOutcome: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async (_args: { data: Record<string, unknown> }) => ({ id: 'row-2' })),
      },
    };
    const adapter = new MallOperationOutcomeRepositoryAdapter(prisma as never);

    await adapter.record(INPUT);
    expect(prisma.mallOperationOutcome.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: ORG, idempotencyKey: 'key-1' }) }),
    );
  });

  /** 요약 읽기는 조직으로 울타리를 친다. */
  it('⭐ fences the summary read by organization', async () => {
    const prisma = {
      mallOperationOutcome: {
        findMany: vi.fn(async (_args: { where: { organizationId: string } }) => []),
        groupBy: vi.fn(async (_args: { where: { organizationId: string } }) => []),
      },
    };
    const adapter = new MallOperationOutcomeRepositoryAdapter(prisma as never);

    await adapter.readSummary({ organizationId: ORG, since: new Date('2026-09-05T00:00:00.000Z') });

    expect(prisma.mallOperationOutcome.findMany.mock.calls[0]?.[0].where.organizationId).toBe(ORG);
    expect(prisma.mallOperationOutcome.groupBy.mock.calls[0]?.[0].where.organizationId).toBe(ORG);
  });
});
