import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ActivityEventsModule } from './activity-events/activity-events.module';
import { AdvertisingModule } from './advertising/advertising.module';
import { AgentOsInteractionHttpModule } from './agent-os/agent-os-interaction-http.module';
import { AiModule } from './ai/ai.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationScopeGuard } from './auth/guards/organization-scope.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { SessionAuthMiddleware } from './auth/middleware/session-auth.middleware';
import { AutomationModule } from './automation/automation.module';
import { ChannelsModule } from './channels/channels.module';
import { CommonModule } from './common/common.module';
import { StorageModule } from './common/storage/storage.module';
import { FeatureGateModule } from './feature-gate/feature-gate.module';
import { FinanceModule } from './finance/finance.module';
import { InventoryModule } from './inventory/inventory.module';
import { OperationCancellationModule } from './operation-cancellation/operation-cancellation.module';
import { OperationsHttpModule } from './operations/operations-http.module';
import { OrdersModule } from './orders/orders.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { ReadinessModule } from './readiness/readiness.module';
import { RebuildReadinessGuard } from './readiness/rebuild-readiness.guard';
import { RulesModule } from './rules/rules.module';
import { SourcingModule } from './sourcing/sourcing.module';
import { SupplyModule } from './supply/supply.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    CommonModule,
    StorageModule,
    FeatureGateModule,
    OrdersModule,
    InventoryModule,
    ProductsModule,
    OrganizationsModule,
    AnalyticsModule,
    SourcingModule,
    SupplyModule,
    ActivityEventsModule,
    ChannelsModule,
    AiModule,
    FinanceModule,
    RulesModule,
    AgentOsInteractionHttpModule,
    AutomationModule,
    OperationCancellationModule,
    OperationsHttpModule,
    AdvertisingModule,
    UploadsModule,
    ReadinessModule,
  ],
  providers: [
    // 가드 실행 순서 (providers 선언 순서 = 평가 순서):
    // OrganizationScope → rebuild readiness → Roles → Throttler.
    { provide: APP_GUARD, useClass: OrganizationScopeGuard },
    { provide: APP_GUARD, useClass: RebuildReadinessGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class ApiApplicationModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SessionAuthMiddleware)
      .exclude({ path: 'internal/agent-runtime/*path', method: RequestMethod.ALL })
      .forRoutes('*');
  }
}
