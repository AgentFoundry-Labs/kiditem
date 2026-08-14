import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
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
    return {
      kind: 'completed',
      result: {
        businessDate: result.businessDate,
        windowDays: result.windowDays,
        candidateCount: result.model.stats.candidateCount,
        confidence: result.confidence,
      },
    };
  }
}

function numberInput(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
