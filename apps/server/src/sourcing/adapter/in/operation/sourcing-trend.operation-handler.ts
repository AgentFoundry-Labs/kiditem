import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  SourcingOperationResultSchema,
  type SourcingOperationOutcome,
  type SourcingOperationResult,
} from '@kiditem/shared/sourcing';
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
  SOURCING_SERVER_TREND_OPERATIONS,
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
const SERVER_SOURCE_ORDER = ['naver', 'shorts'] as const;
const OPERATION_KEY_BY_SOURCE = {
  naver: 'sourcing.collect_naver_trends',
  '1688': 'sourcing.collect_1688_trends',
  shorts: 'sourcing.collect_shorts_trends',
} as const satisfies Record<TrendCollectSource, string>;
const SOURCE_BY_OPERATION_KEY = new Map<string, TrendCollectSource>(
  SERVER_SOURCE_ORDER.map((source) => [OPERATION_KEY_BY_SOURCE[source], source]),
);

interface TrendSourceSummary {
  summary: SourcingOperationResult['summary'];
  sourceResult: SourcingOperationResult['sources'][number] & {
    source: TrendCollectSource;
  };
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
    for (const definition of SOURCING_SERVER_TREND_OPERATIONS) {
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
    return {
      kind: 'completed',
      result: aggregateSourceResults(summaries),
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
    const outcome: SourcingOperationOutcome = collected.ok
      ? collected.collected === 0 ? 'no_change' : 'complete'
      : 'partial';
    const failed = collected.ok ? 0 : 1;
    return {
      kind: 'completed',
      result: sourceOperationResult({
        source,
        outcome,
        accepted: collected.collected,
        failed,
        ...(failed > 0 ? { errorCode: 'trend_source_partial' } : {}),
      }),
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
      summary: {
        discovered: 0,
        accepted: 0,
        duplicate: 0,
        unchanged: 0,
        failed: 1,
      },
      sourceResult: {
        source,
        outcome: child.status === 'skipped' ? 'skipped' : 'failed',
        accepted: 0,
        failed: 1,
        errorCode: childErrorCode(child),
      },
    };
  }
  const parsed = SourcingOperationResultSchema.safeParse(child.result);
  const result = parsed.success ? parsed.data : null;
  const sourceResult = result?.sources[0];
  if (
    !result
    || result.sources.length !== 1
    || !sourceResult
    || sourceResult.source !== source
    || sourceResult.outcome !== result.outcome
    || sourceResult.accepted !== result.summary.accepted
    || sourceResult.failed !== result.summary.failed
    || (sourceResult.outcome !== 'complete'
      && sourceResult.outcome !== 'partial'
      && sourceResult.outcome !== 'no_change')
  ) {
    throw new Error('trend_child_result_invalid');
  }
  return {
    summary: result.summary,
    sourceResult: { ...sourceResult, source },
  };
}

function sourceOperationResult(input: {
  source: TrendCollectSource;
  outcome: SourcingOperationOutcome;
  accepted: number;
  failed: number;
  errorCode?: string;
}): SourcingOperationResult {
  return SourcingOperationResultSchema.parse({
    outcome: input.outcome,
    summary: {
      discovered: input.accepted,
      accepted: input.accepted,
      duplicate: 0,
      unchanged: 0,
      failed: input.failed,
    },
    sources: [{
      source: input.source,
      outcome: input.outcome,
      accepted: input.accepted,
      failed: input.failed,
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    }],
  });
}

function aggregateSourceResults(
  sources: TrendSourceSummary[],
): SourcingOperationResult {
  const summary = sources.reduce<SourcingOperationResult['summary']>(
    (total, source) => ({
      discovered: total.discovered + source.summary.discovered,
      accepted: total.accepted + source.summary.accepted,
      duplicate: total.duplicate + source.summary.duplicate,
      unchanged: total.unchanged + source.summary.unchanged,
      failed: total.failed + source.summary.failed,
    }),
    { discovered: 0, accepted: 0, duplicate: 0, unchanged: 0, failed: 0 },
  );
  const sourceResults = sources.map((source) => source.sourceResult);
  const hasIncompleteSource = sourceResults.some((source) =>
    source.outcome === 'partial'
    || source.outcome === 'failed'
    || source.outcome === 'skipped');
  const outcome: SourcingOperationOutcome = hasIncompleteSource
    ? 'partial'
    : summary.accepted === 0
      ? 'no_change'
      : 'complete';
  return SourcingOperationResultSchema.parse({
    outcome,
    summary,
    sources: sourceResults,
  });
}

function childErrorCode(child: OperationRunRecord): string {
  const candidate = child.errorCode?.trim();
  return candidate
    && candidate.length <= 120
    && /^[a-z0-9_.:-]+$/i.test(candidate)
    ? candidate
    : `trend_child_${child.status}`;
}

function isAttentionError(message: string): boolean {
  return /로그인|슬라이더|검증|USER_VALIDATE|verification/i.test(message);
}
