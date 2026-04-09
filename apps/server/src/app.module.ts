import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { InventoryModule } from './inventory/inventory.module';
import { CompaniesModule } from './companies/companies.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SourcingModule } from './sourcing/sourcing.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { ActivityEventsModule } from './activity-events/activity-events.module';
import { ChannelsModule } from './channels/channels.module';
import { AiModule } from './ai/ai.module';
import { FinanceModule } from './finance/finance.module';
import { RulesModule } from './rules/rules.module';
import { AgentRegistryModule } from './agent-registry/agent-registry.module';
import { OntologyModule } from './ontology/ontology.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { AdvertisingModule } from './advertising/advertising.module';
import { ProcurementModule } from './procurement/procurement.module';
import { FeatureGateModule } from './feature-gate/feature-gate.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { OptionMastersModule } from './option-masters/option-masters.module';
import { CategoriesModule } from './categories/categories.module';
import { ManualLedgerModule } from './manual-ledger/manual-ledger.module';
import { StockAuditsModule } from './stock-audits/stock-audits.module';
import { StockTransfersModule } from './stock-transfers/stock-transfers.module';
import { ProductMemosModule } from './product-memos/product-memos.module';
import { ReturnTransfersModule } from './return-transfers/return-transfers.module';
import { BundleProductsModule } from './bundle-products/bundle-products.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { SupplierStatsModule } from './supplier-stats/supplier-stats.module';
import { SupplierPaymentsModule } from './supplier-payments/supplier-payments.module';
import { SettlementsModule } from './settlements/settlements.module';
import { PickingModule } from './picking/picking.module';
import { ProcessingCostsModule } from './processing-costs/processing-costs.module';
import { SalesPlansModule } from './sales-plans/sales-plans.module';
import { StatisticsModule } from './statistics/statistics.module';
import { ChatModule } from './chat/chat.module';
import { UploadsModule } from './uploads/uploads.module';
import { TrafficModule } from './traffic/traffic.module';
import { ActionTaskModule } from './action-task/action-task.module';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    FeatureGateModule,
    ProductsModule,
    OrdersModule,
    InventoryModule,
    CompaniesModule,
    DashboardModule,
    SourcingModule,
    WorkflowsModule,
    ActivityEventsModule,
    ChannelsModule,
    AiModule,
    FinanceModule,
    RulesModule,
    AgentRegistryModule,
    OntologyModule,
    MarketplaceModule,
    AdvertisingModule,
    ProcurementModule,
    WarehousesModule,
    OptionMastersModule,
    CategoriesModule,
    ManualLedgerModule,
    StockAuditsModule,
    StockTransfersModule,
    ProductMemosModule,
    ReturnTransfersModule,
    BundleProductsModule,
    SuppliersModule,
    SupplierStatsModule,
    SupplierPaymentsModule,
    SettlementsModule,
    PickingModule,
    ProcessingCostsModule,
    SalesPlansModule,
    StatisticsModule,
    ChatModule,
    UploadsModule,
    TrafficModule,
    ActionTaskModule,
  ],
})
export class AppModule {}
