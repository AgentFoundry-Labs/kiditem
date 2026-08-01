import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
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
  TREND_COLLECTION_PORT,
  type TrendCollectionPort,
} from '../../../application/port/in/trend-collection.port';
import { SOURCING_OPERATIONS } from '../../../domain/operation/sourcing.operations';

@Injectable()
export class SourcingTrendOperationHandler
  implements OperationHandler, OnModuleInit
{
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    @Inject(TREND_COLLECTION_PORT)
    private readonly trendCollection: TrendCollectionPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(SOURCING_OPERATIONS[0], this);
  }

  async execute(
    context: OperationHandlerContext,
  ): Promise<OperationHandlerResult> {
    const sources = context.input.sources as
      | Array<'naver' | '1688' | 'shorts'>
      | undefined;
    const collected = await this.trendCollection.collect(
      context.organizationId,
      sources,
    );
    const warningCount = collected.results.filter((result) => !result.ok).length;
    if (warningCount === collected.results.length) {
      throw new Error('trend_collection_failed');
    }

    return {
      kind: 'completed',
      result: {
        businessDate: collected.businessDate,
        collected: collected.results.reduce((total, result) => total + result.collected, 0),
        warningCount,
        results: collected.results.map((result) => ({
          source: result.source,
          ok: result.ok,
          collected: result.collected,
          ...(result.error ? { error: result.error.slice(0, 2_000) } : {}),
        })),
      },
    };
  }
}
