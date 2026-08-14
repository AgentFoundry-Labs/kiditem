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
import { LiveCommerceService } from '../../../application/service/live-commerce.service';
import { SOURCING_TAOBAO_LIVE_OPERATION } from '../../../domain/operation/sourcing.operations';

/**
 * The official Taobao provider is a server-owned sourcing lane. Browser
 * collection has distinct operation definitions and never enters this handler.
 */
@Injectable()
export class SourcingLiveCommerceOperationHandler
  implements OperationHandler, OnModuleInit
{
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    private readonly liveCommerce: LiveCommerceService,
  ) {}

  onModuleInit(): void {
    this.registry.register(SOURCING_TAOBAO_LIVE_OPERATION, this);
  }

  async execute(context: OperationHandlerContext): Promise<OperationHandlerResult> {
    if (context.operationKey !== SOURCING_TAOBAO_LIVE_OPERATION.key) {
      throw new Error('live_commerce_operation_key_invalid');
    }
    context.signal.throwIfAborted();
    await context.checkpoint({ stage: 'collecting_source', progressCurrent: 0, progressTotal: 1 });
    const input = normalizeTaobaoInput(context.input);
    const collected = await this.liveCommerce.collectTaobao(
      context.organizationId,
      input,
      `operation:${context.runId}`,
      {
        signal: context.signal,
        checkpoint: () => context.checkpoint({
          stage: 'persisting',
          progressCurrent: 0,
          progressTotal: 1,
        }),
      },
    );
    context.signal.throwIfAborted();
    await context.checkpoint({ stage: 'finalizing', progressCurrent: 1, progressTotal: 1 });
    const accepted = collected.broadcastCount + collected.productCount;
    const failed = collected.warnings.length > 0 ? 1 : 0;
    const outcome = failed > 0 ? 'partial' : accepted === 0 ? 'no_change' : 'complete';
    return {
      kind: 'completed',
      result: SourcingOperationResultSchema.parse({
        outcome,
        summary: {
          discovered: accepted,
          accepted,
          duplicate: 0,
          unchanged: 0,
          failed,
        },
        sources: [{
          source: 'taobao_live',
          outcome,
          accepted,
          failed,
          ...(failed > 0 ? { errorCode: 'taobao_live_warning' } : {}),
        }],
      }),
    };
  }
}

function normalizeTaobaoInput(value: unknown): {
  liveIds: string[];
  queryDate: string | undefined;
} {
  const input = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  return {
    liveIds: Array.isArray(input.liveIds)
      ? input.liveIds.filter((item): item is string => typeof item === 'string')
      : [],
    queryDate: typeof input.queryDate === 'string'
      ? input.queryDate.trim().replaceAll('-', '')
      : undefined,
  };
}
