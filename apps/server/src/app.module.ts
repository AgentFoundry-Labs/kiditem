import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { SupabaseAuthMiddleware } from './auth/middleware/supabase-auth.middleware';
import { OrganizationScopeGuard } from './auth/guards/organization-scope.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { StorageModule } from './common/storage/storage.module';
import { OrdersModule } from './orders/orders.module';
import { InventoryModule } from './inventory/inventory.module';
import { CategoriesModule } from './products/categories/categories.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SourcingModule } from './sourcing/sourcing.module';
import { SupplyModule } from './supply/supply.module';
import { ActivityEventsModule } from './activity-events/activity-events.module';
import { ChannelsModule } from './channels/channels.module';
import { AiModule } from './ai/ai.module';
import { FinanceModule } from './finance/finance.module';
import { RulesModule } from './rules/rules.module';
import { AgentOsModule } from './agent-os/agent-os.module';
import { AutomationModule } from './automation/automation.module';
import { OperationCancellationModule } from './operation-cancellation/operation-cancellation.module';
import { AdvertisingModule } from './advertising/advertising.module';
import { FeatureGateModule } from './feature-gate/feature-gate.module';
import { ChatModule } from './chat/chat.module';
import { UploadsModule } from './uploads/uploads.module';
import { ReadinessModule } from './readiness/readiness.module';
import { RebuildReadinessGuard } from './readiness/rebuild-readiness.guard';

@Module({
  imports: [
    // Global event bus — AppModule is the SINGLE forRoot() site.
    // Other modules inject EventEmitter2 directly (do NOT call forRoot elsewhere —
    // forRoot uses useFactory: () => new EventEmitter2(options), producing a fresh instance
    // per call that breaks cross-module @OnEvent subscribers).
    EventEmitterModule.forRoot(),
    // 120 req / 60s / IP — SSE 재연결 폭주 및 brute force 완화.
    // ThrottlerGuard 는 OrganizationScope/Roles 이후 평가되어 비인증 요청은 카운터 영향 없음.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    CommonModule,
    StorageModule,
    FeatureGateModule,
    OrdersModule,
    InventoryModule,
    CategoriesModule,
    OrganizationsModule,
    AnalyticsModule,
    SourcingModule,
    SupplyModule,
    ActivityEventsModule,
    ChannelsModule,
    AiModule,
    FinanceModule,
    RulesModule,
    AgentOsModule,
    AutomationModule,
    OperationCancellationModule,
    AdvertisingModule,
    ChatModule,
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Supabase JWT 검증 — `Authorization: Bearer` 또는 Supabase SSR auth-token 쿠키.
    // SSE (`/api/panel/*`) 는 EventSource 가 헤더를 못 보내므로 쿠키 기반으로
    // 통과한다 (frontend 가 `withCredentials: true`).
    consumer.apply(SupabaseAuthMiddleware).forRoutes('*');
  }
}
