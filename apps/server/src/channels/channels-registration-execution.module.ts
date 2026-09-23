import { REGISTRATION_TARGET_PORT } from './application/port/in/registration-target.port';
import { SALES_PRODUCT_PORT } from './application/port/in/sales-product.port';
import { REGISTRATION_DRAFT_PORT } from './application/port/out/persistence/registration-draft.port';
import { CHANNEL_REGISTRATION_PORT } from './application/port/in/registration/channel-registration.port';
import { ProductCollectionRuntimeModule } from '../products/product-collection-runtime.module';
import { StockoutCheckController } from './adapter/in/web/stockout-check.controller';
import { StockoutCheckService } from './application/service/listing/stockout-check.service';
import { StockoutCheckPersistenceAdapter } from './adapter/out/persistence/stockout-check.persistence.adapter';
import { STOCKOUT_CHECK_PORT } from './application/port/in/listing/stockout-check.port';
import { STOCKOUT_CHECK_PERSISTENCE_PORT } from './application/port/out/persistence/stockout-check.persistence.port';
import { Module } from '@nestjs/common';
import { SalesProductModule } from './sales-product.module';
import { ChannelCatalogModule } from './channel-catalog.module';
import { RegistrationTargetExecutionController } from './adapter/in/web/registration-target-execution.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../content/ai.module';
import { ChannelsModule } from './channels.module';
import { ChannelRegistrationExecutionController } from './adapter/in/web/channel-registration-execution.controller';
import { RegistrationExecutionRepositoryAdapter } from './adapter/out/repository/registration-execution.repository.adapter';
import { RegistrationExecutionService } from './application/service/registration/registration-execution.service';
import { REGISTRATION_EXECUTION_PORT } from './application/port/in/capability/registration-execution.port';
import { REGISTRATION_EXECUTION_REPOSITORY_PORT } from './application/port/out/repository/registration-execution.repository.port';
import { RegistrationDraftAdapter } from './adapter/out/persistence/registration-draft.adapter';
import { RegistrationStateRepositoryAdapter } from './adapter/out/persistence/registration-state.repository.adapter';
import { REGISTRATION_STATE_PORT } from './application/port/in/registration-state.port';
import { CHANNEL_REGISTRABLE_DETAIL_PAGE_PORT } from './application/port/out/content/registrable-detail-page.port';
import { CHANNEL_ADAPTER_REGISTRY_PORT } from './application/port/out/channel/channel-adapter.port';

/**
 * 등록 실행 울타리([ADR-0014](../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 *
 * 계정 · 리스팅 · 영수증을 가진 `ChannelsModule` 과 초안을 가진 Sourcing 사이에
 * 따로 서 있다. 이 모듈만 실행 행을 쓴다.
 *
 * 예전 channels-registration-preparation.module.ts(수집후보 기원 등록의 호환 진입점)를
 * 합쳤다 — 등록 실행 서비스가 이미 그 모듈을 가져왔었다.
 */
@Module({
  imports: [ProductCollectionRuntimeModule, PrismaModule, ChannelsModule, AiModule, SalesProductModule, ChannelCatalogModule],
  controllers: [StockoutCheckController, ChannelRegistrationExecutionController, RegistrationTargetExecutionController],
  providers: [
    StockoutCheckPersistenceAdapter,
    { provide: STOCKOUT_CHECK_PERSISTENCE_PORT, useExisting: StockoutCheckPersistenceAdapter },
    { provide: StockoutCheckService, useFactory: (...dependencies: ConstructorParameters<typeof StockoutCheckService>) => new StockoutCheckService(...dependencies), inject: [STOCKOUT_CHECK_PERSISTENCE_PORT, REGISTRATION_EXECUTION_REPOSITORY_PORT, CHANNEL_ADAPTER_REGISTRY_PORT] },
    { provide: STOCKOUT_CHECK_PORT, useExisting: StockoutCheckService },
    RegistrationExecutionRepositoryAdapter,
    { provide: RegistrationExecutionService, useFactory: (...dependencies: ConstructorParameters<typeof RegistrationExecutionService>) => new RegistrationExecutionService(...dependencies), inject: [REGISTRATION_EXECUTION_REPOSITORY_PORT, CHANNEL_REGISTRATION_PORT, REGISTRATION_DRAFT_PORT, SALES_PRODUCT_PORT, REGISTRATION_TARGET_PORT, STOCKOUT_CHECK_PORT, CHANNEL_REGISTRABLE_DETAIL_PAGE_PORT] },
    {
      provide: REGISTRATION_EXECUTION_REPOSITORY_PORT,
      useExisting: RegistrationExecutionRepositoryAdapter,
    },
    { provide: REGISTRATION_EXECUTION_PORT, useExisting: RegistrationExecutionService },
    // 예전 channels-registration-preparation.module.ts.
    RegistrationDraftAdapter,
    RegistrationStateRepositoryAdapter,
    { provide: REGISTRATION_DRAFT_PORT, useExisting: RegistrationDraftAdapter },
    { provide: REGISTRATION_STATE_PORT, useExisting: RegistrationStateRepositoryAdapter },
  ],
  exports: [STOCKOUT_CHECK_PORT, REGISTRATION_EXECUTION_PORT, REGISTRATION_EXECUTION_REPOSITORY_PORT, REGISTRATION_DRAFT_PORT, REGISTRATION_STATE_PORT],
})
export class ChannelsRegistrationExecutionModule {}
