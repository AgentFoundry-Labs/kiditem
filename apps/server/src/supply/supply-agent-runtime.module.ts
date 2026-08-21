import { Module } from '@nestjs/common';
import { AgentOsCapabilityModule } from '../agent-os/agent-os-capability.module';
import { AgentOsSessionModule } from '../agent-os/agent-os-session.module';
import { InventoryFreshnessRuntimeModule } from '../inventory/inventory-freshness-runtime.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SupplyAgentCapabilityAdapter } from './adapter/in/agent/supply-agent-capability.adapter';
import { ProcurementRepositoryAdapter } from './adapter/out/repository/procurement.repository.adapter';
import { Alibaba1688CheckoutRuntimeAdapter } from './adapter/out/runtime/alibaba-1688-checkout-runtime.adapter';
import { OrderAgentRuntimeHandler } from './adapter/out/runtime/order-agent-runtime.handler';
import { PurchaseOrderSubmissionTransactionAdapter } from './adapter/out/transaction/purchase-order-submission.transaction.adapter';
import { PURCHASE_ORDER_DRAFT_PORT } from './application/port/in/procurement/purchase-order-draft.port';
import { PURCHASE_ORDER_SUBMISSION_PORT } from './application/port/in/procurement/purchase-order-submission.port';
import { PROCUREMENT_REPOSITORY_PORT } from './application/port/out/repository/procurement.repository.port';
import { PURCHASE_ORDER_CHECKOUT_RUNTIME_PORT } from './application/port/out/runtime/purchase-order-checkout-runtime.port';
import { PURCHASE_ORDER_SUBMISSION_TRANSACTION_PORT } from './application/port/out/transaction/purchase-order-submission.transaction.port';
import { ProcurementService } from './application/service/procurement.service';
import { PurchaseOrderDraftService } from './application/service/purchase-order-draft.service';
import { PurchaseOrderSubmissionService } from './application/service/purchase-order-submission.service';

@Module({
  imports: [
    PrismaModule,
    AgentOsCapabilityModule,
    AgentOsSessionModule,
    InventoryFreshnessRuntimeModule,
  ],
  providers: [
    ProcurementService,
    PurchaseOrderDraftService,
    PurchaseOrderSubmissionService,
    SupplyAgentCapabilityAdapter,
    Alibaba1688CheckoutRuntimeAdapter,
    OrderAgentRuntimeHandler,
    ProcurementRepositoryAdapter,
    PurchaseOrderSubmissionTransactionAdapter,
    { provide: PURCHASE_ORDER_DRAFT_PORT, useExisting: PurchaseOrderDraftService },
    {
      provide: PURCHASE_ORDER_SUBMISSION_PORT,
      useExisting: PurchaseOrderSubmissionService,
    },
    { provide: PROCUREMENT_REPOSITORY_PORT, useExisting: ProcurementRepositoryAdapter },
    {
      provide: PURCHASE_ORDER_CHECKOUT_RUNTIME_PORT,
      useExisting: Alibaba1688CheckoutRuntimeAdapter,
    },
    {
      provide: PURCHASE_ORDER_SUBMISSION_TRANSACTION_PORT,
      useExisting: PurchaseOrderSubmissionTransactionAdapter,
    },
  ],
  exports: [
    ProcurementService,
    PURCHASE_ORDER_DRAFT_PORT,
    PURCHASE_ORDER_SUBMISSION_PORT,
  ],
})
export class SupplyAgentRuntimeModule {}
