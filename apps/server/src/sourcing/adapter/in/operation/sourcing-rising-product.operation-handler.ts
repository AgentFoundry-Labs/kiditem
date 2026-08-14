import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  SourcingOperationResultSchema,
  type SourcingOperationOutcome,
} from '@kiditem/shared/sourcing';
import {
  OPERATION_HANDLER_REGISTRY_PORT,
  type OperationHandlerRegistryPort,
} from '../../../../operations/application/port/in/operation-handler-registry.port';
import { SourcingRisingProductService } from '../../../application/service/sourcing-rising-product.service';
import { SOURCING_RISING_PRODUCT_OPERATION } from '../../../domain/operation/sourcing.operations';
import type {
  OperationHandler,
  OperationHandlerContext,
  OperationHandlerResult,
} from '../../../../common/operation-definition';

const NORMAL_EMPTY_RESULT_GAP = 'no_rising_candidates';

@Injectable()
export class SourcingRisingProductOperationHandler
  implements OperationHandler, OnModuleInit
{
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    private readonly risingProducts: SourcingRisingProductService,
  ) {}

  onModuleInit(): void {
    this.registry.register(SOURCING_RISING_PRODUCT_OPERATION, this);
  }

  async execute(
    context: OperationHandlerContext,
  ): Promise<OperationHandlerResult> {
    context.signal.throwIfAborted();
    const result = await this.risingProducts.detect(
      {
        organizationId: context.organizationId,
        windowDays: numberInput(context.input.windowDays),
        limit: numberInput(context.input.limit),
      },
      { signal: context.signal, checkpoint: context.checkpoint },
    );
    context.signal.throwIfAborted();
    const candidateCount = result.model.stats.candidateCount;
    const failed = result.dataGaps.reduce(
      (count, gap) => gap === NORMAL_EMPTY_RESULT_GAP ? count : count + 1,
      0,
    );
    const outcome: SourcingOperationOutcome = failed > 0
      ? 'partial'
      : candidateCount === 0
        ? 'no_change'
        : 'complete';
    return {
      kind: 'completed',
      result: SourcingOperationResultSchema.parse({
        outcome,
        summary: {
          discovered: candidateCount,
          accepted: candidateCount,
          duplicate: 0,
          unchanged: 0,
          failed,
        },
        sources: [{
          source: 'rising_products',
          outcome,
          accepted: candidateCount,
          failed,
          ...(failed > 0 ? { errorCode: 'rising_data_gaps' } : {}),
        }],
        snapshotGeneratedAt: result.generatedAt,
      }),
    };
  }
}

function numberInput(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
