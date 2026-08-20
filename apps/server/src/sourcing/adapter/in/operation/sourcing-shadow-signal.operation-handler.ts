import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { SourcingOperationResultSchema, type SourcingOperationOutcome } from '@kiditem/shared/sourcing';
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
import { SourcingShadowSignalService } from '../../../application/service/sourcing-shadow-signal.service';
import { SOURCING_SHADOW_SIGNAL_OPERATION } from '../../../domain/operation/sourcing.operations';

/** The only incoming owner allowed to collect and publish shadow snapshots. */
@Injectable()
export class SourcingShadowSignalOperationHandler
  implements OperationHandler, OnModuleInit
{
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    private readonly shadowSignals: SourcingShadowSignalService,
    @Inject(OPERATION_ATTEMPT_VERIFIER_PORT)
    private readonly attemptVerifier: OperationAttemptVerifierPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(SOURCING_SHADOW_SIGNAL_OPERATION, this);
  }

  async execute(context: OperationHandlerContext): Promise<OperationHandlerResult> {
    if (context.operationKey !== SOURCING_SHADOW_SIGNAL_OPERATION.key) {
      throw new Error('market_shadow_operation_key_invalid');
    }
    context.signal.throwIfAborted();
    await context.checkpoint({
      stage: 'collecting_source',
      progressCurrent: 0,
      progressTotal: 1,
    });
    const collected = await this.shadowSignals.collect(
      context.organizationId,
      new Date(),
      {
        signal: context.signal,
        checkpoint: () => context.checkpoint({
          stage: 'persisting_snapshot',
          progressCurrent: 0,
          progressTotal: 1,
        }),
        withinActiveOperationAttemptFence: (callback) =>
          this.attemptVerifier.withActiveDomainAttemptFence({
            organizationId: context.organizationId,
            runId: context.runId,
            expectedOperationKey: SOURCING_SHADOW_SIGNAL_OPERATION.key,
            attemptToken: context.attemptToken,
          }, (_attempt, transaction) => callback(transaction)),
      },
    );
    context.signal.throwIfAborted();
    await context.checkpoint({
      stage: 'finalizing',
      progressCurrent: 1,
      progressTotal: 1,
    });

    const status = shadowStatus(collected.snapshot.payload);
    const outcome: SourcingOperationOutcome = collected.claimed
      ? status === 'partial' || status === 'failed'
        ? 'partial'
        : 'complete'
      : 'no_change';
    const accepted = collected.claimed ? 1 : 0;
    const failed = status === 'failed' ? 1 : 0;
    return {
      kind: 'completed',
      result: SourcingOperationResultSchema.parse({
        outcome,
        summary: {
          discovered: accepted,
          accepted,
          duplicate: 0,
          unchanged: collected.claimed ? 0 : 1,
          failed,
        },
        sources: [{
          source: 'market_shadow_signals',
          outcome,
          accepted,
          failed,
          ...(failed > 0 ? { errorCode: 'market_shadow_collection_failed' } : {}),
        }],
        snapshotGeneratedAt: snapshotGeneratedAt(collected.snapshot.payload),
      }),
    };
  }
}

function shadowStatus(payload: Record<string, unknown>): string {
  const result = payload.result;
  return result && typeof result === 'object' && !Array.isArray(result)
    && typeof (result as Record<string, unknown>).status === 'string'
    ? (result as Record<string, unknown>).status as string
    : 'complete';
}

function snapshotGeneratedAt(payload: Record<string, unknown>): string | undefined {
  const meta = payload.meta;
  return meta && typeof meta === 'object' && !Array.isArray(meta)
    && typeof (meta as Record<string, unknown>).generatedAt === 'string'
    ? (meta as Record<string, unknown>).generatedAt as string
    : undefined;
}
