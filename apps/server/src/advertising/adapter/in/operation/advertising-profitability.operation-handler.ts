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
import { ADVERTISING_OPERATIONS } from '../../../domain/operation/advertising.operations';

@Injectable()
export class AdvertisingProfitabilityOperationHandler
implements OperationHandler, OnModuleInit {
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(ADVERTISING_OPERATIONS[0], this);
  }

  async execute(_context: OperationHandlerContext): Promise<OperationHandlerResult> {
    return { kind: 'waiting_runtime' };
  }
}
