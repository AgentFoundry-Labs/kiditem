import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentOsModule } from '../agent-os/agent-os.module';
import { InventoryModule } from '../inventory/inventory.module';

import { SupplyAgentCapabilityAdapter } from './adapter/in/agent/supply-agent-capability.adapter';
import { SuppliersController } from './adapter/in/http/suppliers.controller';
import { ProcurementController } from './adapter/in/http/procurement.controller';

import { SuppliersService } from './application/service/suppliers.service';
import { ProcurementService } from './application/service/procurement.service';
import { PurchaseOrderDraftService } from './application/service/purchase-order-draft.service';
import { PurchaseOrderSubmissionService } from './application/service/purchase-order-submission.service';
import { Alibaba1688CheckoutRuntimeAdapter } from './adapter/out/runtime/alibaba-1688-checkout-runtime.adapter';
import { OrderAgentRuntimeHandler } from './adapter/out/runtime/order-agent-runtime.handler';
import { SupplierRepositoryAdapter } from './adapter/out/repository/supplier.repository.adapter';
import { ProcurementRepositoryAdapter } from './adapter/out/repository/procurement.repository.adapter';
import { PurchaseOrderSubmissionTransactionAdapter } from './adapter/out/transaction/purchase-order-submission.transaction.adapter';
import { PURCHASE_ORDER_DRAFT_PORT } from './application/port/in/procurement/purchase-order-draft.port';
import { PURCHASE_ORDER_SUBMISSION_PORT } from './application/port/in/procurement/purchase-order-submission.port';
import { SUPPLIER_REPOSITORY_PORT } from './application/port/out/repository/supplier.repository.port';
import { PROCUREMENT_REPOSITORY_PORT } from './application/port/out/repository/procurement.repository.port';
import { PURCHASE_ORDER_CHECKOUT_RUNTIME_PORT } from './application/port/out/runtime/purchase-order-checkout-runtime.port';
import { PURCHASE_ORDER_SUBMISSION_TRANSACTION_PORT } from './application/port/out/transaction/purchase-order-submission.transaction.port';

/**
 * Supply owns supplier registry, master-supplier policy, and purchase-order
 * procurement. Extracted from sourcing/ during Track A PR 1 (issue #192
 * follow-up). Suppliers are organization-private. supplier-payments stays in
 * finance/; supplier-stats stays in analytics/.
 */
@Module({
  imports: [PrismaModule, AgentOsModule, InventoryModule],
  controllers: [SuppliersController, ProcurementController],
  providers: [
    SuppliersService,
    ProcurementService,
    PurchaseOrderDraftService,
    PurchaseOrderSubmissionService,
    SupplyAgentCapabilityAdapter,
    Alibaba1688CheckoutRuntimeAdapter,
    OrderAgentRuntimeHandler,
    SupplierRepositoryAdapter,
    ProcurementRepositoryAdapter,
    PurchaseOrderSubmissionTransactionAdapter,
    { provide: PURCHASE_ORDER_DRAFT_PORT, useExisting: PurchaseOrderDraftService },
    {
      provide: PURCHASE_ORDER_SUBMISSION_PORT,
      useExisting: PurchaseOrderSubmissionService,
    },
    { provide: SUPPLIER_REPOSITORY_PORT, useExisting: SupplierRepositoryAdapter },
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
})
export class SupplyModule {}
