import { describe, expect, it, vi } from 'vitest';
import { OperationHandlerRegistryService } from '../../../../../operations/application/service/operation-handler-registry.service';
import { SOURCING_OPERATIONS } from '../../../../domain/operation/sourcing.operations';
import { SourcingTrendOperationHandler } from '../sourcing-trend.operation-handler';
import type { OperationHandlerContext } from '../../../../../common/operation-definition';
import type { CompositeOperationCoordinatorPort } from '../../../../../operations/application/port/in/composite-operation-coordinator.port';
import type { OperationRunRecord } from '../../../../../operations/application/port/out/repository/operation.repository.port';
import type { TrendCollectionPort } from '../../../../application/port/in/trend-collection.port';

const RUN_ID = 'b00e8d85-e8ab-447f-8558-c98c6c580d3b';
const ORGANIZATION_ID = '454de16d-b60e-41f7-9b9c-16dc2666ea05';
const ATTEMPT_TOKEN = '4e65f19e-a04f-4aac-917c-b6f973870f87';

function operationContext(
  overrides: Partial<OperationHandlerContext> = {},
): OperationHandlerContext {
  return {
    runId: RUN_ID,
    organizationId: ORGANIZATION_ID,
    operationKey: 'sourcing.collect_daily_trends',
    triggerSource: 'dashboard',
    input: { sources: ['naver', '1688', 'shorts'] },
    requestedByUserId: null,
    scheduleId: null,
    parentRunId: null,
    attemptToken: ATTEMPT_TOKEN,
    signal: new AbortController().signal,
    checkpoint: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function childRun(
  operationKey: string,
  overrides: Partial<OperationRunRecord> = {},
): OperationRunRecord {
  const now = new Date('2026-08-01T00:00:00.000Z');
  return {
    id: crypto.randomUUID(),
    organizationId: ORGANIZATION_ID,
    operationKey,
    definitionVersion: 1,
    ownerDomain: 'sourcing',
    title: operationKey,
    engineType: 'domain',
    resourceClass: operationKey.includes('naver')
      ? 'naver_api'
      : operationKey.includes('1688')
        ? 'playwright_1688'
        : 'default',
    executionTimeoutMs: 15 * 60_000,
    status: 'succeeded',
    triggerSource: 'dashboard',
    requestedByUserId: null,
    parentRunId: RUN_ID,
    scheduleId: null,
    idempotencyKey: `${RUN_ID}:${operationKey}`,
    input: {},
    result: null,
    progress: 1,
    stage: null,
    stageUpdatedAt: null,
    progressCurrent: null,
    progressTotal: null,
    deadlineAt: now,
    nativeRunType: null,
    nativeRunId: null,
    attempts: 1,
    maxAttempts: 3,
    claimedBy: null,
    attemptToken: null,
    claimedAt: null,
    leaseExpiresAt: null,
    scheduledFor: null,
    errorCode: null,
    errorMessage: null,
    startedAt: now,
    finishedAt: now,
    createdAt: now,
    updatedAt: now,
    requestedBy: null,
    ...overrides,
  };
}

function setup(input?: {
  children?: OperationRunRecord[];
  sourceResult?: {
    businessDate: string;
    source: 'naver' | '1688' | 'shorts';
    ok: boolean;
    collected: number;
    error?: string;
  };
}) {
  const registry = new OperationHandlerRegistryService();
  const collector = {
    collect: vi.fn(),
    collectSource: vi.fn().mockResolvedValue(input?.sourceResult ?? {
      businessDate: '2026-08-01',
      source: 'naver',
      ok: true,
      collected: 12,
    }),
  };
  const coordinator = {
    listChildren: vi.fn().mockResolvedValue(input?.children ?? []),
  };
  const handler = new SourcingTrendOperationHandler(
    registry,
    collector as never,
    coordinator as never,
  );
  handler.onModuleInit();
  return { registry, collector, coordinator, handler };
}

describe('SourcingTrendOperationHandler', () => {
  it('registers the composite parent and all exact source child definitions', () => {
    const { registry } = setup();

    expect([
      'sourcing.collect_daily_trends',
      'sourcing.collect_naver_trends',
      'sourcing.collect_1688_trends',
      'sourcing.collect_shorts_trends',
    ].map((key) => registry.getDefinition(key).resourceClass)).toEqual([
      'default',
      'naver_api',
      'playwright_1688',
      'default',
    ]);
  });

  it('starts every selected source lane together on the first parent execution', async () => {
    const { handler, collector } = setup();

    await expect(handler.execute(operationContext())).resolves.toEqual({
      kind: 'waiting_dependencies',
      children: [
        {
          operationKey: 'sourcing.collect_naver_trends',
          input: {},
          idempotencyKey: `${RUN_ID}:sourcing.collect_naver_trends`,
        },
        {
          operationKey: 'sourcing.collect_1688_trends',
          input: {},
          idempotencyKey: `${RUN_ID}:sourcing.collect_1688_trends`,
        },
        {
          operationKey: 'sourcing.collect_shorts_trends',
          input: {},
          idempotencyKey: `${RUN_ID}:sourcing.collect_shorts_trends`,
        },
      ],
    });
    expect(collector.collect).not.toHaveBeenCalled();
    expect(collector.collectSource).not.toHaveBeenCalled();
  });

  it('preserves the one-child dependency result for a single selected source', async () => {
    const { handler } = setup();

    await expect(handler.execute(operationContext({
      input: { sources: ['naver'] },
    }))).resolves.toEqual({
      kind: 'waiting_dependency',
      child: {
        operationKey: 'sourcing.collect_naver_trends',
        input: {},
        idempotencyKey: `${RUN_ID}:sourcing.collect_naver_trends`,
      },
    });
  });

  it('runs one source child through owner-local collectSource with signal and checkpoints', async () => {
    const { handler, collector } = setup();
    const context = operationContext({
      operationKey: 'sourcing.collect_naver_trends',
      input: {},
      parentRunId: RUN_ID,
    });

    await expect(handler.execute(context)).resolves.toEqual({
      kind: 'completed',
      result: {
        businessDate: '2026-08-01',
        source: 'naver',
        ok: true,
        collected: 12,
      },
    });
    expect(collector.collectSource).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      'naver',
      null,
      RUN_ID,
      { signal: context.signal, checkpoint: context.checkpoint },
    );
  });

  it('returns attention for a blocked 1688 child without exposing rows', async () => {
    const { handler } = setup({
      sourceResult: {
        businessDate: '2026-08-01',
        source: '1688',
        ok: false,
        collected: 0,
        error: '1688 로그인/슬라이더 검증이 필요합니다.',
      },
    });

    await expect(handler.execute(operationContext({
      operationKey: 'sourcing.collect_1688_trends',
      input: {},
      parentRunId: RUN_ID,
    }))).resolves.toEqual({
      kind: 'attention_required',
      reason: '1688 로그인/슬라이더 검증이 필요합니다.',
      result: {
        businessDate: '2026-08-01',
        source: '1688',
        ok: false,
        collected: 0,
      },
    });
  });

  it('aggregates the exact all-settled child set in fixed source order', async () => {
    const children = [
      childRun('sourcing.collect_shorts_trends', {
        status: 'failed',
        errorCode: 'operation_execution_failed',
        errorMessage: 'Operation execution failed',
      }),
      childRun('sourcing.collect_1688_trends', {
        result: {
          businessDate: '2026-08-01',
          source: '1688',
          ok: false,
          collected: 4,
          error: 'one seed failed',
        },
      }),
      childRun('sourcing.collect_naver_trends', {
        result: {
          businessDate: '2026-08-01',
          source: 'naver',
          ok: true,
          collected: 12,
        },
      }),
    ];
    const { handler } = setup({ children });

    await expect(handler.execute(operationContext())).resolves.toEqual({
      kind: 'completed',
      result: {
        businessDate: '2026-08-01',
        collected: 16,
        warningCount: 2,
        results: [
          { source: 'naver', ok: true, collected: 12 },
          { source: '1688', ok: false, collected: 4, error: 'one seed failed' },
          { source: 'shorts', ok: false, collected: 0, error: 'Operation execution failed' },
        ],
      },
    });
  });

  it('fails safely when the resumed child set does not exactly match the request', async () => {
    const { handler } = setup({
      children: [childRun('sourcing.collect_naver_trends')],
    });

    await expect(handler.execute(operationContext()))
      .rejects.toThrow('trend_child_set_invalid');
  });

  it('returns a fixed terminal failure when every child lane failed', async () => {
    const { handler } = setup({
      children: [
        childRun('sourcing.collect_naver_trends', { status: 'failed' }),
        childRun('sourcing.collect_1688_trends', { status: 'cancelled' }),
        childRun('sourcing.collect_shorts_trends', { status: 'skipped' }),
      ],
    });

    await expect(handler.execute(operationContext())).resolves.toEqual({
      kind: 'failed',
      code: 'trend_collection_failed',
      message: 'All trend source operations failed',
    });
  });
});
