import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { SourcingOperationResultSchema } from '@kiditem/shared/sourcing';
import type {
  OperationHandler,
  OperationHandlerContext,
  OperationHandlerResult,
} from '../../../../common/operation-definition';
import {
  OPERATION_HANDLER_REGISTRY_PORT,
  type OperationHandlerRegistryPort,
} from '../../../../operations/application/port/in/operation-handler-registry.port';
import {
  OPERATION_ATTEMPT_VERIFIER_PORT,
  type OperationAttemptVerifierPort,
} from '../../../../operations/application/port/in/operation-attempt-verifier.port';
import { NaverKeywordResearchService } from '../../../application/service/naver-keyword-research.service';
import { SOURCING_KEYWORD_ANALYSIS_OPERATION } from '../../../domain/operation/sourcing.operations';

/** The sole owner of Naver keyword provider work and its persisted snapshot. */
@Injectable()
export class SourcingKeywordAnalysisOperationHandler
  implements OperationHandler, OnModuleInit
{
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    private readonly keywordResearch: NaverKeywordResearchService,
    @Inject(OPERATION_ATTEMPT_VERIFIER_PORT)
    private readonly attemptVerifier: OperationAttemptVerifierPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(SOURCING_KEYWORD_ANALYSIS_OPERATION, this);
  }

  async execute(context: OperationHandlerContext): Promise<OperationHandlerResult> {
    if (context.operationKey !== SOURCING_KEYWORD_ANALYSIS_OPERATION.key) {
      throw new Error('keyword_analysis_operation_key_invalid');
    }
    context.signal.throwIfAborted();
    await context.checkpoint({
      stage: 'collecting_source',
      progressCurrent: 0,
      progressTotal: 1,
    });
    const collected = await this.keywordResearch.collectAnalysis({
      organizationId: context.organizationId,
      input: context.input,
      signal: context.signal,
      checkpoint: () => context.checkpoint({
        stage: 'persisting_snapshot',
        progressCurrent: 0,
        progressTotal: 1,
      }),
      withinActiveOperationAttemptFence: (commit) =>
        this.attemptVerifier.withActiveDomainAttemptFence({
          organizationId: context.organizationId,
          runId: context.runId,
          expectedOperationKey: SOURCING_KEYWORD_ANALYSIS_OPERATION.key,
          attemptToken: context.attemptToken,
        }, (_attempt, transaction) => commit(transaction)),
    });
    context.signal.throwIfAborted();
    await context.checkpoint({
      stage: 'finalizing',
      progressCurrent: 1,
      progressTotal: 1,
    });

    const accepted = collected.payload.result.popular?.boards.length
      ?? collected.payload.result.related?.items.length
      ?? collected.payload.result.trends?.items.length
      ?? 0;
    return {
      kind: 'completed',
      result: SourcingOperationResultSchema.parse({
        outcome: 'complete',
        summary: {
          discovered: accepted,
          accepted,
          duplicate: 0,
          unchanged: accepted === 0 ? 1 : 0,
          failed: 0,
        },
        sources: [{
          source: 'naver_keyword_analysis',
          outcome: 'complete',
          accepted,
          failed: 0,
        }],
        snapshotGeneratedAt: collected.payload.generatedAt,
      }),
    };
  }
}
