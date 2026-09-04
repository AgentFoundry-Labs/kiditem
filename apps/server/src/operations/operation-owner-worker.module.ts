import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AiProductGenerationRuntimeModule } from '../ai/ai-product-generation-runtime.module';
import { OperationAlertRuntimeModule } from '../automation/operation-alert-runtime.module';
import { CoupangRocketPurchaseOrderOperationHandler } from '../channels/adapter/in/operation/coupang-rocket-purchase-order.operation-handler';
import { CoupangShipmentSummaryOperationHandler } from '../inventory/adapter/in/operation/coupang-shipment-summary.operation-handler';
import { SellpiaInventoryOperationHandler } from '../inventory/adapter/in/operation/sellpia-inventory.operation-handler';
import { InventoryFreshnessRuntimeModule } from '../inventory/inventory-freshness-runtime.module';
import { MarketplaceOrderCollectionOperationHandler } from '../orders/adapter/in/operation/marketplace-order-collection.operation-handler';
import { ProductsListingGenerationOperationHandler } from '../products/adapter/in/operation/listing-generation.operation-handler';
import { RulesEvaluationOperationHandler } from '../rules/adapter/in/operation/rules-evaluation.operation-handler';
import { RulesOperationAlertAdapter } from '../rules/adapter/out/automation/operation-alert.adapter';
import { APPLY_RULES_EVALUATION_PORT } from '../rules/application/port/in/apply-rules-evaluation.port';
import { RULES_OPERATION_ALERT_PORT } from '../rules/application/port/out/cross-domain/operation-alert.port';
import { RulesService } from '../rules/services/rules.service';
import { SourcingOperationWorkerModule } from '../sourcing/sourcing-operation-worker.module';
import { OperationsModule } from './operations.module';

/**
 * Worker-safe owner handlers and their narrow execution dependencies. Full
 * owner modules remain out of the worker root because they own HTTP/API graphs.
 */
@Module({
  imports: [
    EventEmitterModule.forRoot(),
    OperationsModule,
    AiProductGenerationRuntimeModule,
    InventoryFreshnessRuntimeModule,
    OperationAlertRuntimeModule,
    SourcingOperationWorkerModule,
  ],
  providers: [
    CoupangRocketPurchaseOrderOperationHandler,
    CoupangShipmentSummaryOperationHandler,
    SellpiaInventoryOperationHandler,
    MarketplaceOrderCollectionOperationHandler,
    ProductsListingGenerationOperationHandler,
    RulesEvaluationOperationHandler,
    RulesOperationAlertAdapter,
    RulesService,
    { provide: APPLY_RULES_EVALUATION_PORT, useExisting: RulesService },
    { provide: RULES_OPERATION_ALERT_PORT, useExisting: RulesOperationAlertAdapter },
  ],
})
export class OperationOwnerWorkerModule {}
