import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type {
  Sourcing1688BatchResult,
  Sourcing1688BatchUnitResult,
} from '@kiditem/shared/sourcing';
import type {
  OperationHandler,
  OperationHandlerContext,
  OperationHandlerResult,
} from '../../../../common/operation-definition';
import {
  OPERATION_HANDLER_REGISTRY_PORT,
  type OperationHandlerRegistryPort,
} from '../../../../operations/application/port/in/operation-handler-registry.port';
import { Sourcing1688ImageSearchService } from '../../../application/service/sourcing-1688-image-search.service';
import { Sourcing1688KeywordSearchService } from '../../../application/service/sourcing-1688-keyword-search.service';
import {
  SOURCING_1688_IMAGE_MATCH_OPERATION,
  SOURCING_1688_KEYWORD_BATCH_OPERATION,
} from '../../../domain/operation/sourcing.operations';

@Injectable()
export class Sourcing1688OperationHandler
implements OperationHandler, OnModuleInit {
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    private readonly keywordSearch: Sourcing1688KeywordSearchService,
    private readonly imageSearch: Sourcing1688ImageSearchService,
  ) {}

  onModuleInit(): void {
    this.registry.register(SOURCING_1688_KEYWORD_BATCH_OPERATION, this);
    this.registry.register(SOURCING_1688_IMAGE_MATCH_OPERATION, this);
  }

  async execute(context: OperationHandlerContext): Promise<OperationHandlerResult> {
    if (context.operationKey === SOURCING_1688_KEYWORD_BATCH_OPERATION.key) {
      return this.executeKeywords(context);
    }
    if (context.operationKey === SOURCING_1688_IMAGE_MATCH_OPERATION.key) {
      return this.executeImageMatches(context);
    }
    return {
      kind: 'failed',
      code: 'unsupported_operation',
      message: 'Unsupported 1688 operation.',
    };
  }

  private async executeKeywords(
    context: OperationHandlerContext,
  ): Promise<OperationHandlerResult> {
    const keywords = context.input.keywords as string[];
    const units: Sourcing1688BatchUnitResult[] = [];
    await context.checkpoint({
      stage: 'searching_1688_keywords',
      progressCurrent: 0,
      progressTotal: keywords.length,
    });
    for (const keyword of keywords) {
      context.signal.throwIfAborted();
      try {
        units.push(await this.keywordSearch.searchForOperation({
          organizationId: context.organizationId,
          operationRunId: context.runId,
          actorUserId: context.requestedByUserId,
          keyword,
          signal: context.signal,
          checkpoint: () => context.checkpoint({ stage: 'persisting_1688_keyword' }),
        }));
      } catch (error) {
        context.signal.throwIfAborted();
        units.push(failedUnit(keyword, null, error));
      }
      await context.checkpoint({
        stage: 'searching_1688_keywords',
        progressCurrent: units.length,
        progressTotal: keywords.length,
      });
    }
    if (units.every((unit) => unit.outcome === 'failed')) return allFailed();
    return completedResult(units, '1688_keyword_search');
  }

  private async executeImageMatches(
    context: OperationHandlerContext,
  ): Promise<OperationHandlerResult> {
    const targetIds = context.input.targetIds as string[];
    const resolved = await this.imageSearch.resolveTargets({
      organizationId: context.organizationId,
      targetIds,
    });
    const targetById = new Map(resolved.targets.map((target) => [target.targetId, target]));
    const missing = new Set(resolved.missingTargetIds);
    const units: Sourcing1688BatchUnitResult[] = [];
    await context.checkpoint({
      stage: 'matching_1688_images',
      progressCurrent: 0,
      progressTotal: targetIds.length,
    });
    for (const targetId of targetIds) {
      context.signal.throwIfAborted();
      const target = targetById.get(targetId);
      if (!target || missing.has(targetId)) {
        units.push({
          keyword: target?.searchQuery ?? 'unauthorized-target',
          targetId,
          outcome: 'failed',
          discovered: 0,
          accepted: 0,
          duplicate: 0,
          failed: 1,
          errorCode: 'target_not_authorized',
        });
      } else {
        try {
          units.push(await this.imageSearch.searchForOperation({
            organizationId: context.organizationId,
            operationRunId: context.runId,
            actorUserId: context.requestedByUserId,
            targetId,
            imageUrl: target.imageUrl,
            keyword: target.searchQuery,
            signal: context.signal,
            checkpoint: () => context.checkpoint({ stage: 'persisting_1688_image_match' }),
          }));
        } catch (error) {
          context.signal.throwIfAborted();
          units.push(failedUnit(target.searchQuery, targetId, error));
        }
      }
      await context.checkpoint({
        stage: 'matching_1688_images',
        progressCurrent: units.length,
        progressTotal: targetIds.length,
      });
    }
    if (units.every((unit) => unit.outcome === 'failed')) return allFailed();
    return completedResult(units, '1688_image_match');
  }
}

function failedUnit(
  keyword: string,
  targetId: string | null,
  error: unknown,
): Sourcing1688BatchUnitResult {
  return {
    keyword,
    targetId,
    outcome: 'failed',
    discovered: 0,
    accepted: 0,
    duplicate: 0,
    failed: 1,
    errorCode: errorCode(error),
  };
}

function completedResult(
  units: Sourcing1688BatchUnitResult[],
  source: string,
): OperationHandlerResult {
  const failed = units.reduce((total, unit) => total + unit.failed, 0);
  const accepted = units.reduce((total, unit) => total + unit.accepted, 0);
  const discovered = units.reduce((total, unit) => total + unit.discovered, 0);
  const duplicate = units.reduce((total, unit) => total + unit.duplicate, 0);
  const unchanged = units.filter((unit) => unit.outcome === 'no_change').length;
  const hasFailure = units.some(
    (unit) => unit.outcome === 'failed' || unit.failed > 0,
  );
  const hasChange = units.some((unit) => unit.outcome === 'complete');
  const outcome = hasFailure ? 'partial' : hasChange ? 'complete' : 'no_change';
  return {
    kind: 'completed',
    result: {
      outcome,
      summary: { discovered, accepted, duplicate, unchanged, failed },
      sources: [{
        source,
        outcome,
        accepted,
        failed,
      }],
      units,
      snapshotGeneratedAt: new Date().toISOString(),
    } satisfies Sourcing1688BatchResult,
  };
}

function allFailed(): OperationHandlerResult {
  return {
    kind: 'failed',
    code: 'all_targets_failed',
    message: 'All 1688 batch targets failed.',
  };
}

function errorCode(error: unknown): string {
  const raw = error instanceof Error ? error.name || error.message : String(error);
  const normalized = raw.toLocaleLowerCase('en-US').replace(/[^a-z0-9_-]+/gu, '_');
  return normalized.slice(0, 120) || 'provider_failed';
}
