import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type {
  OperationHandler,
  OperationHandlerContext,
  OperationHandlerResult,
} from '../../../../common/operation-definition';
import {
  PRODUCT_GENERATION_AI_TRIGGER_PORT,
  type ProductGenerationAiTriggerPort,
} from '../../../../ai/application/port/in/generation/product-generation-ai-trigger.port';
import {
  OPERATION_HANDLER_REGISTRY_PORT,
  type OperationHandlerRegistryPort,
} from '../../../../operations/application/port/in/operation-handler-registry.port';
import {
  PRODUCTS_LISTING_GENERATION_OPERATIONS,
  ProductsListingGenerationOperationInputSchema,
} from '../../../domain/operation/listing-generation.operations';

@Injectable()
export class ProductsListingGenerationOperationHandler
  implements OperationHandler, OnModuleInit
{
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    @Inject(PRODUCT_GENERATION_AI_TRIGGER_PORT)
    private readonly productGeneration: ProductGenerationAiTriggerPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(PRODUCTS_LISTING_GENERATION_OPERATIONS[0], this);
  }

  async execute(context: OperationHandlerContext): Promise<OperationHandlerResult> {
    const input = ProductsListingGenerationOperationInputSchema.parse(context.input);
    const result = await this.productGeneration.startForCandidate({
      ...input,
      organizationId: context.organizationId,
      triggeredByUserId: context.requestedByUserId,
    });
    return {
      kind: 'completed',
      result: {
        candidateId: result.candidateId,
        href: result.href,
      },
    };
  }
}
