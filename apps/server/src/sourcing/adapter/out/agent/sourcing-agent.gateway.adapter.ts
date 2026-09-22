import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_GENERATION_AI_TRIGGER_PORT,
  type ProductGenerationAiTriggerPort,
} from '../../../../content/application/port/in/generation/product-generation-ai-trigger.port';
import type {
  SourcingAgentGatewayPort,
  SourcingRegisterUploadedDetailPageRequest,
  SourcingRegisterUploadedDetailPageResult,
  SourcingStartProductGenerationRequest,
  SourcingStartProductGenerationResult,
} from '../../../application/port/out/runtime/sourcing-agent.gateway.port';

@Injectable()
export class SourcingAgentGatewayAdapter implements SourcingAgentGatewayPort {
  constructor(
    @Inject(PRODUCT_GENERATION_AI_TRIGGER_PORT)
    private readonly productGenerationAi: ProductGenerationAiTriggerPort,
  ) {}

  startProductGeneration(
    request: SourcingStartProductGenerationRequest,
  ): Promise<SourcingStartProductGenerationResult> {
    return this.productGenerationAi.startForSalesProduct(request);
  }

  registerUploadedDetailPage(
    request: SourcingRegisterUploadedDetailPageRequest,
  ): Promise<SourcingRegisterUploadedDetailPageResult> {
    return this.productGenerationAi.registerUploadedDetailPage(request);
  }
}
