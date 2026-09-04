import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  OPERATION_HANDLER_REGISTRY_PORT,
  type OperationHandlerRegistryPort,
} from '../../../../operations/application/port/in/operation-handler-registry.port';
import { ADVERTISING_COMPETITOR_CATALOG_OPERATION } from '../../../domain/operation/advertising.operations';
import type {
  OperationHandler,
  OperationHandlerContext,
  OperationHandlerResult,
} from '../../../../common/operation-definition';

@Injectable()
export class AdvertisingCompetitorCatalogOperationHandler
implements OperationHandler, OnModuleInit {
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(ADVERTISING_COMPETITOR_CATALOG_OPERATION, this);
  }

  async execute(_context: OperationHandlerContext): Promise<OperationHandlerResult> {
    return { kind: 'waiting_runtime' };
  }
}
