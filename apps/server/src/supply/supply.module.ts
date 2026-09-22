import { RocketPoSourceModule } from '../orders/rocket-po-source.module';
import { ChannelCatalogModule } from '../channels/channel-catalog.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductSourceModule } from '../products/product-source.module';
import { ChannelsModule } from '../channels/channels.module';
import { SupplyAgentRuntimeModule } from './supply-agent-runtime.module';
import { SuppliersController } from './adapter/in/http/suppliers.controller';
import { ProcurementController } from './adapter/in/http/procurement.controller';
import { ProcurementTestIntentsController } from './adapter/in/http/procurement-test-intents.controller';
import { SupplierOfferSnapshotsController } from './adapter/in/http/supplier-offer-snapshots.controller';
import { SuppliersService } from './application/service/suppliers.service';
import { SupplySourcingProcurementService } from './application/service/supply-sourcing-procurement.service';
import { RocketPurchasePreviewService } from './application/service/rocket-purchase-preview.service';
import { RocketWorkbookExportService } from './application/service/rocket-purchase-confirmation.service';
import { RocketFinalOrderReconciliationService } from './application/service/rocket-final-order-reconciliation.service';
import { SupplierRepositoryAdapter } from './adapter/out/repository/supplier.repository.adapter';
import { SupplySourcingProcurementRepositoryAdapter } from './adapter/out/repository/supply-sourcing-procurement.repository.adapter';
import { RocketPurchaseConfirmationTransactionAdapter } from './adapter/out/transaction/rocket-purchase-confirmation.transaction.adapter';
import { RocketFinalOrderReconciliationTransactionAdapter } from './adapter/out/transaction/rocket-final-order-reconciliation.transaction.adapter';
import { SUPPLIER_REPOSITORY_PORT } from './application/port/out/repository/supplier.repository.port';
import { SUPPLY_SOURCING_PROCUREMENT_REPOSITORY_PORT } from './application/port/out/repository/supply-sourcing-procurement.repository.port';
import { SUPPLY_SOURCING_PROCUREMENT_PORT } from './application/port/in/procurement/supply-sourcing-procurement.port';
import { ROCKET_PURCHASE_PREVIEW_PORT } from './application/port/in/procurement/rocket-purchase-preview.port';
import { ROCKET_WORKBOOK_EXPORT_PORT } from './application/port/in/procurement/rocket-purchase-confirmation.port';
import { ROCKET_WORKBOOK_EXPORT_TRANSACTION_PORT } from './application/port/out/transaction/rocket-purchase-confirmation.transaction.port';
import { ROCKET_FINAL_ORDER_RECONCILIATION_PORT } from './application/port/in/procurement/rocket-final-order-reconciliation.port';
import { ROCKET_FINAL_ORDER_RECONCILIATION_TRANSACTION_PORT } from './application/port/out/transaction/rocket-final-order-reconciliation.transaction.port';

/**
 * Supply owns supplier registry, master-supplier policy, and purchase-order
 * procurement. Extracted from sourcing/ during Track A PR 1 (issue #192
 * follow-up). Suppliers are organization-private. supplier-payments stays in
 * finance/; supplier-stats stays in analytics/.
 */
@Module({
  imports: [RocketPoSourceModule, ChannelCatalogModule, PrismaModule, SupplyAgentRuntimeModule, InventoryModule, ProductSourceModule, ChannelsModule],
  controllers: [
    SuppliersController,
    ProcurementController,
    SupplierOfferSnapshotsController,
    ProcurementTestIntentsController,
  ],
  providers: [
    SuppliersService,
    SupplySourcingProcurementService,
    RocketPurchasePreviewService,
    RocketWorkbookExportService,
    RocketFinalOrderReconciliationService,
    SupplierRepositoryAdapter,
    SupplySourcingProcurementRepositoryAdapter,
    RocketPurchaseConfirmationTransactionAdapter,
    RocketFinalOrderReconciliationTransactionAdapter,
    { provide: SUPPLIER_REPOSITORY_PORT, useExisting: SupplierRepositoryAdapter },
    {
      provide: SUPPLY_SOURCING_PROCUREMENT_REPOSITORY_PORT,
      useExisting: SupplySourcingProcurementRepositoryAdapter,
    },
    {
      provide: SUPPLY_SOURCING_PROCUREMENT_PORT,
      useExisting: SupplySourcingProcurementService,
    },
    {
      provide: ROCKET_PURCHASE_PREVIEW_PORT,
      useExisting: RocketPurchasePreviewService,
    },
    {
      provide: ROCKET_WORKBOOK_EXPORT_PORT,
      useExisting: RocketWorkbookExportService,
    },
    {
      provide: ROCKET_WORKBOOK_EXPORT_TRANSACTION_PORT,
      useExisting: RocketPurchaseConfirmationTransactionAdapter,
    },
    {
      provide: ROCKET_FINAL_ORDER_RECONCILIATION_TRANSACTION_PORT,
      useExisting: RocketFinalOrderReconciliationTransactionAdapter,
    },
    {
      provide: ROCKET_FINAL_ORDER_RECONCILIATION_PORT,
      useExisting: RocketFinalOrderReconciliationService,
    },
  ],
  exports: [
    SupplyAgentRuntimeModule,
    ROCKET_FINAL_ORDER_RECONCILIATION_PORT,
    SUPPLY_SOURCING_PROCUREMENT_PORT,
  ],
})
export class SupplyModule {}
