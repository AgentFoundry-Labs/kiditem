import { describe, expect, it, vi } from 'vitest';
import type { Prisma, AdAction } from '@prisma/client';
import { AdActionRepositoryAdapter } from '../ad-action.repository.adapter';
import type { ActionCandidate } from '../../../../domain/ad-action-rules';

type StoredAdAction = AdAction & {
  payload: Prisma.JsonValue | null;
};

function pauseCandidate(
  overrides: Partial<ActionCandidate> = {},
): ActionCandidate {
  return {
    adTargetDailyId: '11111111-1111-4111-8111-111111111111',
    listingId: '22222222-2222-4222-8222-222222222222',
    actionType: 'pause_keyword',
    targetType: 'keyword',
    externalId: null,
    targetLabel: '콩순이 비눗방울',
    reason: '상품과 무관한 캐릭터 키워드',
    priority: 'high',
    currentValue: null,
    proposedValue: null,
    payload: { source: 'keyword_relevance' },
    ...overrides,
  };
}

function createHarness() {
  const rows: StoredAdAction[] = [];
  let idSeq = 0;
  let queue = Promise.resolve();

  const tx = {
    $queryRaw: vi.fn(async () => []),
    adAction: {
      findMany: vi.fn(async (args: { where: any; select: any }) =>
        rows
          .filter((row) => matchesWhere(row, args.where))
          .map((row) => ({
            externalId: row.externalId,
            targetLabel: row.targetLabel,
          }))),
      create: vi.fn(async ({ data }: { data: any }) => {
        const row = {
          id: `action-${++idSeq}`,
          ...data,
          approvalStatus: 'pending_review',
          executeStatus: 'queued',
          beforeJson: null,
          afterJson: null,
          errorMessage: null,
          approvedAt: null,
          executedAt: null,
          createdAt: new Date(),
        } as StoredAdAction;
        rows.push(row);
        return row;
      }),
    },
  };

  const prisma = {
    $transaction: vi.fn((arg: unknown) => {
      if (typeof arg !== 'function') return Promise.all(arg as Promise<unknown>[]);
      const run = queue.then(() => (arg as (tx: typeof tx) => Promise<unknown>)(tx));
      queue = run.then(() => undefined, () => undefined);
      return run;
    }),
  };

  return { prisma, rows, tx };
}

describe('AdActionRepositoryAdapter.createAdActionsFromCandidates', () => {
  it('does not create another open pause_keyword action on a serial rerun', async () => {
    const { prisma, rows, tx } = createHarness();
    const adapter = new AdActionRepositoryAdapter(prisma as never, {} as never);
    const candidate = pauseCandidate();

    const first = await adapter.createAdActionsFromCandidates('org-1', [candidate]);
    const second = await adapter.createAdActionsFromCandidates('org-1', [candidate]);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('serializes concurrent pause_keyword inserts for the same organization', async () => {
    const { prisma, rows } = createHarness();
    const adapter = new AdActionRepositoryAdapter(prisma as never, {} as never);
    const candidate = pauseCandidate({ externalId: 'keyword-1' });

    const results = await Promise.all([
      adapter.createAdActionsFromCandidates('org-1', [candidate]),
      adapter.createAdActionsFromCandidates('org-1', [candidate]),
    ]);

    expect(results.flat()).toHaveLength(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.externalId).toBe('keyword-1');
  });

  it('keeps only one pause_keyword candidate when a run emits duplicates itself', async () => {
    const { prisma, rows } = createHarness();
    const adapter = new AdActionRepositoryAdapter(prisma as never, {} as never);

    const created = await adapter.createAdActionsFromCandidates('org-1', [
      pauseCandidate(),
      pauseCandidate({ reason: '같은 키워드가 다시 들어옴' }),
    ]);

    expect(created).toHaveLength(1);
    expect(rows).toHaveLength(1);
  });
});

function matchesWhere(row: StoredAdAction, where: any): boolean {
  const approvalStatuses = where.approvalStatus?.in ?? [];
  const executeStatuses = where.executeStatus?.in ?? [];
  const candidatePairs = where.OR ?? [];

  return row.organizationId === where.organizationId
    && row.actionType === where.actionType
    && row.targetType === where.targetType
    && approvalStatuses.includes(row.approvalStatus)
    && executeStatuses.includes(row.executeStatus)
    && candidatePairs.some((candidate: { externalId: string | null; targetLabel: string }) =>
      row.externalId === candidate.externalId
      && row.targetLabel === candidate.targetLabel);
}
