import { describe, expect, it, vi } from 'vitest';
import {
  ProductProfitabilityAbcOperationHandler,
  ProductProfitabilityRefreshOperationHandler,
} from '../product-profitability.operation-handler';
import {
  PRODUCT_PROFITABILITY_OPERATIONS,
  PROFITABILITY_REFRESH_STAGES,
} from '../../../../domain/operation/product-profitability.operations';

const context = {
  runId: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000002',
  operationKey: 'products.refresh_profitability_evidence',
  triggerSource: 'domain_screen' as const,
  input: {},
  requestedByUserId: '00000000-0000-4000-8000-000000000003',
  scheduleId: null,
  parentRunId: null,
  attemptToken: '00000000-0000-4000-8000-000000000004',
  signal: new AbortController().signal,
  checkpoint: vi.fn().mockResolvedValue(undefined),
  enterEphemeralFinalization: vi.fn(),
  attempts: 1,
  maxAttempts: 2,
};

describe('product profitability operation handlers', () => {
  it('locks the parent contract and its exact three owner-domain stages', () => {
    expect(PRODUCT_PROFITABILITY_OPERATIONS[0]).toMatchObject({
      key: 'products.refresh_profitability_evidence',
      engineType: 'composite',
      ownerDomain: 'products',
      scheduleSupported: false,
    });
    expect(PRODUCT_PROFITABILITY_OPERATIONS[1]).toMatchObject({
      key: 'products.recalculate_profitability_abc',
      engineType: 'domain',
      allowedTriggers: [],
      scheduleSupported: false,
    });
    expect(PROFITABILITY_REFRESH_STAGES).toEqual([
      {
        operationKey: 'inventory.refresh_sellpia_snapshot',
        input: { reason: 'manual_request', scope: 'full' },
      },
      { operationKey: 'advertising.refresh_profitability_spend', input: {} },
      { operationKey: 'products.recalculate_profitability_abc', input: {} },
    ]);
  });

  it('starts only the first incomplete stage and reuses succeeded children', async () => {
    const coordinator = {
      listChildren: vi.fn().mockResolvedValue([
        { operationKey: 'inventory.refresh_sellpia_snapshot', status: 'succeeded' },
      ]),
    };
    const handler = new ProductProfitabilityRefreshOperationHandler(
      { register: vi.fn() } as never,
      coordinator as never,
    );

    await expect(handler.execute(context)).resolves.toEqual({
      kind: 'waiting_dependency',
      child: {
        operationKey: 'advertising.refresh_profitability_spend',
        input: {},
        idempotencyKey: `profitability:${context.runId}:advertising.refresh_profitability_spend`,
      },
    });
    expect(coordinator.listChildren).toHaveBeenCalledWith({
      organizationId: context.organizationId,
      parentRunId: context.runId,
    });
  });

  it('publishes bounded stage metadata only after all children succeed', async () => {
    const children = PROFITABILITY_REFRESH_STAGES.map(({ operationKey }, index) => ({
      operationKey,
      status: 'succeeded',
      finishedAt: new Date(`2026-08-01T00:0${index}:00.000Z`),
      result: operationKey === 'products.recalculate_profitability_abc'
        ? { classifiedProductCount: 7, unclassifiedProductCount: 2 }
        : {},
    }));
    const handler = new ProductProfitabilityRefreshOperationHandler(
      { register: vi.fn() } as never,
      { listChildren: vi.fn().mockResolvedValue(children) } as never,
    );

    await expect(handler.execute(context)).resolves.toMatchObject({
      kind: 'completed',
      result: {
        classifiedProductCount: 7,
        unclassifiedProductCount: 2,
        stages: [
          { operationKey: 'inventory.refresh_sellpia_snapshot', status: 'succeeded' },
          { operationKey: 'advertising.refresh_profitability_spend', status: 'succeeded' },
          { operationKey: 'products.recalculate_profitability_abc', status: 'succeeded' },
        ],
      },
    });
  });

  it('runs ABC once in the final Products child', async () => {
    const abc = {
      recalculate: vi.fn().mockImplementation(async (_organizationId, controls) => {
        await controls.checkpoint();
        await controls.withinActiveOperationAttemptFence(async () => undefined);
        return {
          changedProductCount: 3,
          classifiedProductCount: 7,
          unclassifiedProductCount: 2,
        };
      }),
    };
    const attemptVerifier = {
      withActiveDomainAttemptFence: vi.fn(async (_input, operation) =>
        operation({}, { transaction: true })),
    };
    const handler = new ProductProfitabilityAbcOperationHandler(
      { register: vi.fn() } as never,
      abc as never,
      attemptVerifier as never,
    );

    await expect(handler.execute({
      ...context,
      operationKey: 'products.recalculate_profitability_abc',
      parentRunId: context.runId,
    })).resolves.toEqual({
      kind: 'completed',
      result: {
        changedProductCount: 3,
        classifiedProductCount: 7,
        unclassifiedProductCount: 2,
      },
    });
    expect(abc.recalculate).toHaveBeenCalledTimes(1);
    expect(abc.recalculate).toHaveBeenCalledWith(
      context.organizationId,
      expect.objectContaining({ signal: context.signal }),
    );
    expect(attemptVerifier.withActiveDomainAttemptFence).toHaveBeenCalledWith(
      {
        organizationId: context.organizationId,
        runId: context.runId,
        expectedOperationKey: 'products.recalculate_profitability_abc',
        attemptToken: context.attemptToken,
      },
      expect.any(Function),
    );
  });
});
