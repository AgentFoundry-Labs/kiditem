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
import { ORDERS_OPERATIONS } from '../../../domain/operation/orders.operations';

/**
 * The browser extension owns marketplace sessions and export capture. This
 * handler only gives the run to that exact browser runtime operation; it never
 * reimplements marketplace logic in a dashboard route.
 */
@Injectable()
export class MarketplaceOrderCollectionOperationHandler
  implements OperationHandler, OnModuleInit
{
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(ORDERS_OPERATIONS[0], this);
  }

  async execute(
    _context: OperationHandlerContext,
  ): Promise<OperationHandlerResult> {
    return { kind: 'waiting_runtime' };
  }
}
