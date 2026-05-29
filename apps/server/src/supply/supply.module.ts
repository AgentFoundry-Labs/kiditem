import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentOsModule } from '../agent-os/agent-os.module';

import { SupplyAgentCapabilityAdapter } from './adapter/in/agent/supply-agent-capability.adapter';
import { SuppliersController } from './adapter/in/http/suppliers.controller';
import { ProcurementController } from './adapter/in/http/procurement.controller';

import { SuppliersService } from './application/service/suppliers.service';
import { ProcurementService } from './application/service/procurement.service';
import { PurchaseOrderDraftService } from './application/service/purchase-order-draft.service';
import { OrderAgentRuntimeHandler } from './adapter/out/runtime/order-agent-runtime.handler';
import { SupplierRepositoryAdapter } from './adapter/out/repository/supplier.repository.adapter';
import { ProcurementRepositoryAdapter } from './adapter/out/repository/procurement.repository.adapter';
import { PURCHASE_ORDER_DRAFT_PORT } from './application/port/in/procurement/purchase-order-draft.port';
import { SUPPLIER_REPOSITORY_PORT } from './application/port/out/repository/supplier.repository.port';
import { PROCUREMENT_REPOSITORY_PORT } from './application/port/out/repository/procurement.repository.port';

/**
 * Supply owns supplier registry, master-supplier policy, and purchase-order
 * procurement. Extracted from sourcing/ during Track A PR 1 (issue #192
 * follow-up). Suppliers are organization-private. supplier-payments stays in
 * finance/; supplier-stats stays in analytics/.
 */
@Module({
  imports: [PrismaModule, AgentOsModule],
  controllers: [SuppliersController, ProcurementController],
  providers: [
    SuppliersService,
    ProcurementService,
    PurchaseOrderDraftService,
    SupplyAgentCapabilityAdapter,
    OrderAgentRuntimeHandler,
    SupplierRepositoryAdapter,
    ProcurementRepositoryAdapter,
    { provide: PURCHASE_ORDER_DRAFT_PORT, useExisting: PurchaseOrderDraftService },
    { provide: SUPPLIER_REPOSITORY_PORT, useExisting: SupplierRepositoryAdapter },
    { provide: PROCUREMENT_REPOSITORY_PORT, useExisting: ProcurementRepositoryAdapter },
  ],
})
export class SupplyModule {}
