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
  SELLPIA_INVENTORY_FRESHNESS_PORT,
  type SellpiaInventoryFreshnessPort,
} from '../../../application/port/in/stock/sellpia-inventory-freshness.port';
import { INVENTORY_OPERATIONS } from '../../../domain/operation/inventory.operations';

@Injectable()
export class SellpiaInventoryOperationHandler
  implements OperationHandler, OnModuleInit
{
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    @Inject(SELLPIA_INVENTORY_FRESHNESS_PORT)
    private readonly freshness: SellpiaInventoryFreshnessPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(INVENTORY_OPERATIONS[0], this);
  }

  async execute(context: OperationHandlerContext): Promise<OperationHandlerResult> {
    if (!context.requestedByUserId) {
      throw new Error('inventory_operation_requested_by_user_required');
    }
    const reason = context.input.reason as
      | 'manual_request'
      | 'retry'
      | undefined;
    const scope = context.input.scope === 'full' ? 'full' : 'inventory';
    await this.freshness.requestRefresh({
      organizationId: context.organizationId,
      userId: context.requestedByUserId,
      reason: reason ?? 'manual_request',
      scope,
    });
    return { kind: 'waiting_runtime' };
  }
}
