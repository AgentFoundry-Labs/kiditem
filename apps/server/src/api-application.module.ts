import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AiUsageContextInterceptor } from './ai/adapter/in/http/ai-usage-context.interceptor';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdvertisingModule } from './advertising/advertising.module';
import { AgentOsInteractionHttpModule } from './agent-os/agent-os-interaction-http.module';
import { AgentOsRuntimeHttpModule } from './agent-os/agent-os-runtime-http.module';
import { AiModule } from './ai/ai.module';
import { AlertsModule } from './alerts/alerts.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationScopeGuard } from './auth/guards/organization-scope.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { SessionAuthMiddleware } from './auth/middleware/session-auth.middleware';
import { ChannelsModule } from './channels/channels.module';
import { CommonModule } from './common/common.module';
import { StorageModule } from './common/storage/storage.module';
import { FeatureGateModule } from './feature-gate/feature-gate.module';
import { FinanceModule } from './finance/finance.module';
import { InventoryModule } from './inventory/inventory.module';
import { OrdersModule } from './orders/orders.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { ReadinessModule } from './readiness/readiness.module';
import { RebuildReadinessGuard } from './readiness/rebuild-readiness.guard';
import { SourcingModule } from './sourcing/sourcing.module';
import { SupplyModule } from './supply/supply.module';
import { UploadsModule } from './uploads/uploads.module';

/** 분당 요청 한도. 기본 600, `API_THROTTLE_LIMIT_PER_MINUTE` 로 조정한다. */
function apiThrottleLimitPerMinute(): number {
  const raw = Number.parseInt(process.env.API_THROTTLE_LIMIT_PER_MINUTE ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 600;
}

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    // 한 브라우저가 1분에 보낼 수 있는 요청 수. 몰 27곳 전체수집 한 바퀴는 몰마다 수집 시작 ·
    // 비밀번호 조회 · 변환 · 확장의 서버 제출이 겹쳐 분당 120건을 넘었고, 그 뒤 몰들이 줄줄이
    // `Too Many Requests` 로 실패했다(2026-09-16 라이브). 사내 단일 조직이 쓰는 API라 한도를
    // 올려 두고, 폭주만 막는다. 값은 `API_THROTTLE_LIMIT_PER_MINUTE` 로 바꿀 수 있다.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: apiThrottleLimitPerMinute() }]),
    PrismaModule,
    AlertsModule,
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
    ChannelsModule,
    AiModule,
    FinanceModule,
    AgentOsInteractionHttpModule,
    AgentOsRuntimeHttpModule,
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
    // Guards have resolved the organization by the time interceptors run.
    { provide: APP_INTERCEPTOR, useClass: AiUsageContextInterceptor },
  ],
})
export class ApiApplicationModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SessionAuthMiddleware).forRoutes('*');
  }
}
