import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { DevAuthMiddleware } from './auth/middleware/dev-auth.middleware';
import { CompanyScopeGuard } from './auth/guards/company-scope.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { StorageModule } from './common/storage/storage.module';
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
    // 120 req / 60s / IP — SSE 재연결 폭주 및 brute force 완화.
    // ThrottlerGuard 는 CompanyScope/Roles 이후 평가되어 비인증 요청은 카운터 영향 없음.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    CommonModule,
    StorageModule,
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
  providers: [
    // 가드 실행 순서 (providers 선언 순서 = 평가 순서):
    // CompanyScope → Roles → Throttler. 비인증 요청은 먼저 401 로 탈락해 Throttler 카운터에 영향 없음.
    { provide: APP_GUARD, useClass: CompanyScopeGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // SSE (`/api/agent-registry/events`) 도 DevAuth 통과 필요 — 쿼리 파라미터 fallback 사용 (dev 전용).
    consumer.apply(DevAuthMiddleware).forRoutes('*');
  }
}
