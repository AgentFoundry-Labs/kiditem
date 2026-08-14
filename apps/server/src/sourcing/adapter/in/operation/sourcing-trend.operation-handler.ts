import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  COMPOSITE_OPERATION_COORDINATOR_PORT,
  type CompositeOperationCoordinatorPort,
} from '../../../../operations/application/port/in/composite-operation-coordinator.port';
import {
  OPERATION_HANDLER_REGISTRY_PORT,
  type OperationHandlerRegistryPort,
} from '../../../../operations/application/port/in/operation-handler-registry.port';
import {
  TREND_COLLECTION_PORT,
  type TrendCollectionPort,
} from '../../../application/port/in/trend-collection.port';
import {
  SOURCING_TREND_OPERATIONS,
} from '../../../domain/operation/sourcing.operations';
import type { TrendCollectSource } from '../../../application/service/trend-collect.service';
import type { OperationRunRecord } from '../../../../operations/application/port/out/repository/operation.repository.port';
import type {
  OperationHandler,
  OperationHandlerContext,
  OperationHandlerResult,
  StartChildOperation,
} from '../../../../common/operation-definition';

const SOURCE_ORDER = ['naver', '1688', 'shorts'] as const;
const OPERATION_KEY_BY_SOURCE = {
  naver: 'sourcing.collect_naver_trends',
  '1688': 'sourcing.collect_1688_trends',
  shorts: 'sourcing.collect_shorts_trends',
} as const satisfies Record<TrendCollectSource, string>;
const SOURCE_BY_OPERATION_KEY = new Map<string, TrendCollectSource>(
  SOURCE_ORDER.map((source) => [OPERATION_KEY_BY_SOURCE[source], source]),
);

interface TrendSourceSummary {
  source: TrendCollectSource;
  businessDate: string | null;
  ok: boolean;
  collected: number;
  error?: string;
}

@Injectable()
export class SourcingTrendOperationHandler
  implements OperationHandler, OnModuleInit
{
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    @Inject(TREND_COLLECTION_PORT)
    private readonly trendCollection: TrendCollectionPort,
    @Inject(COMPOSITE_OPERATION_COORDINATOR_PORT)
    private readonly compositeCoordinator: CompositeOperationCoordinatorPort,
  ) {}

  onModuleInit(): void {
    for (const definition of SOURCING_TREND_OPERATIONS) {
      this.registry.register(definition, this);
    }
  }

  async execute(
    context: OperationHandlerContext,
  ): Promise<OperationHandlerResult> {
    const source = SOURCE_BY_OPERATION_KEY.get(context.operationKey);
    if (source) return this.collectSource(context, source);
    if (context.operationKey !== 'sourcing.collect_daily_trends') {
      throw new Error('trend_operation_key_invalid');
    }
    return this.coordinateParent(context);
  }

  private async coordinateParent(
    context: OperationHandlerContext,
  ): Promise<OperationHandlerResult> {
    const sources = normalizeSources(context.input.sources);
    const children = await this.compositeCoordinator.listChildren({
      organizationId: context.organizationId,
      parentRunId: context.runId,
    });
    if (children.length === 0) {
      const planned = sources.map((source) => childFor(context.runId, source));
      return planned.length === 1
        ? { kind: 'waiting_dependency', child: planned[0] }
        : { kind: 'waiting_dependencies', children: planned };
    }

    assertExactChildSet(children, sources);
    const summaries = sources.map((source) => {
      const operationKey = OPERATION_KEY_BY_SOURCE[source];
      const child = children.find((candidate) => candidate.operationKey === operationKey);
      if (!child) throw new Error('trend_child_set_invalid');
      return summarizeChild(child, source);
    });
    const succeeded = children.filter((child) => child.status === 'succeeded').length;
    if (succeeded === 0) {
      return {
        kind: 'failed',
        code: 'trend_collection_failed',
        message: 'All trend source operations failed',
      };
    }

    const businessDate = summaries.find((summary) => summary.businessDate)?.businessDate;
    if (!businessDate) throw new Error('trend_child_result_invalid');
    return {
      kind: 'completed',
      result: {
        businessDate,
        collected: summaries.reduce((total, summary) => total + summary.collected, 0),
        warningCount: summaries.filter((summary) => !summary.ok).length,
        results: summaries.map((summary) => ({
          source: summary.source,
          ok: summary.ok,
          collected: summary.collected,
          ...(summary.error ? { error: summary.error } : {}),
        })),
      },
    };
  }

  private async collectSource(
    context: OperationHandlerContext,
    source: TrendCollectSource,
  ): Promise<OperationHandlerResult> {
    const collected = await this.trendCollection.collectSource(
      context.organizationId,
      source,
      context.requestedByUserId,
      context.runId,
      { signal: context.signal, checkpoint: context.checkpoint },
    );
    const safeError = collected.error?.slice(0, 2_000);
    if (!collected.ok && collected.collected === 0) {
      if (source === '1688' && safeError && isAttentionError(safeError)) {
        return {
          kind: 'attention_required',
          reason: safeError,
          result: {
            businessDate: collected.businessDate,
            source,
            ok: false,
            collected: 0,
          },
        };
      }
      throw new Error(`trend_source_collection_failed:${source}`);
    }
    return {
      kind: 'completed',
      result: {
        businessDate: collected.businessDate,
        source,
        ok: collected.ok,
        collected: collected.collected,
        ...(safeError ? { error: safeError } : {}),
      },
    };
  }
}

function childFor(parentRunId: string, source: TrendCollectSource): StartChildOperation {
  const operationKey = OPERATION_KEY_BY_SOURCE[source];
  return {
    operationKey,
    input: {},
    idempotencyKey: `${parentRunId}:${operationKey}`,
  };
}

function normalizeSources(value: unknown): TrendCollectSource[] {
  if (!Array.isArray(value) || value.length === 0) return [...SOURCE_ORDER];
  const requested = new Set(value);
  return SOURCE_ORDER.filter((source) => requested.has(source));
}

function assertExactChildSet(
  children: OperationRunRecord[],
  sources: TrendCollectSource[],
): void {
  const expected = sources.map((source) => OPERATION_KEY_BY_SOURCE[source]).sort();
  const actual = children.map((child) => child.operationKey).sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error('trend_child_set_invalid');
  }
}

function summarizeChild(
  child: OperationRunRecord,
  source: TrendCollectSource,
): TrendSourceSummary {
  if (child.status !== 'succeeded') {
    return {
      source,
      businessDate: null,
      ok: false,
      collected: 0,
      error: (child.errorMessage ?? `Child operation ${child.status}`).slice(0, 2_000),
    };
  }
  const result = child.result;
  if (
    !result
    || result.source !== source
    || typeof result.businessDate !== 'string'
    || typeof result.ok !== 'boolean'
    || typeof result.collected !== 'number'
    || !Number.isSafeInteger(result.collected)
    || result.collected < 0
  ) {
    throw new Error('trend_child_result_invalid');
  }
  const error = typeof result.error === 'string' && result.error.trim()
    ? result.error.slice(0, 2_000)
    : undefined;
  return {
    source,
    businessDate: result.businessDate,
    ok: result.ok,
    collected: result.collected,
    ...(error ? { error } : {}),
  };
}

function isAttentionError(message: string): boolean {
  return /로그인|슬라이더|검증|USER_VALIDATE|verification/i.test(message);
}
