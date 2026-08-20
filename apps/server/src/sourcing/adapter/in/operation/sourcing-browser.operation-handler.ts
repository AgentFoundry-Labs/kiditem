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
  SOURCING_1688_TREND_OPERATION,
  SOURCING_KEYWORD_SUGGESTION_OPERATION,
  SOURCING_LIVE_COMMERCE_URL_OPERATION,
  SOURCING_TIKTOK_CC_TREND_OPERATION,
  SOURCING_WING_CATALOG_OPERATION,
} from '../../../domain/operation/sourcing.operations';

@Injectable()
export class SourcingBrowserOperationHandler
  implements OperationHandler, OnModuleInit
{
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(SOURCING_WING_CATALOG_OPERATION, this);
    this.registry.register(SOURCING_KEYWORD_SUGGESTION_OPERATION, this);
    this.registry.register(SOURCING_1688_TREND_OPERATION, this);
    this.registry.register(SOURCING_TIKTOK_CC_TREND_OPERATION, this);
    this.registry.register(SOURCING_LIVE_COMMERCE_URL_OPERATION, this);
  }

  async execute(
    _context: OperationHandlerContext,
  ): Promise<OperationHandlerResult> {
    return { kind: 'waiting_runtime' };
  }
}
