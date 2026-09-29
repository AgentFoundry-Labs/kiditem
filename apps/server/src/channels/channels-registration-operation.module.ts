import { Module } from '@nestjs/common';
import { REGISTRATION_TARGET_PORT } from './application/port/in/registration-target.port';
import { SALES_PRODUCT_PORT } from './application/port/in/sales-product.port';
import { ProductCollectionRuntimeModule } from '../products/product-collection-runtime.module';
import { StockoutCheckController } from './adapter/in/web/stockout-check.controller';
import { StockoutCheckService } from './application/service/listing/stockout-check.service';
import { OperationModule } from '../common/operation/operation.module';
import { OPERATION_PORT } from '../common/operation/application/port/in/operation.port';
import { StockoutCheckPersistenceAdapter } from './adapter/out/persistence/stockout-check.repository';
import { STOCKOUT_CHECK_PORT } from './application/port/in/listing/stockout-check.port';
import { STOCKOUT_CHECK_PERSISTENCE_PORT } from './application/port/out/repository/stockout-check.persistence.port';
import { SalesProductModule } from './sales-product.module';
import { ChannelCatalogModule } from './channel-catalog.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../content/ai.module';
import { ChannelsModule } from './channels.module';
import { ChannelRegistrationExecutionController } from './adapter/in/web/channel-registration-execution.controller';
import { RegistrationOperationController } from './adapter/in/web/registration-operation.controller';
import { RegistrationOperationRepositoryAdapter } from './adapter/out/persistence/registration-operation.repository';
import { RegistrationOperationService } from './application/service/registration/registration-operation.service';
import { MallAvailabilityReadService } from './application/service/registration/mall-availability-read.service';
import {
  MALL_AVAILABILITY_READ_OPERATION_PORT,
  REGISTRATION_OPERATION_PORT,
} from './application/port/in/registration-operation.port';
import { REGISTRATION_OPERATION_REPOSITORY_PORT } from './application/port/out/repository/registration-operation.repository.port';
import { MallAvailabilityReadOperationOwner, RegistrationOperationOwner } from './adapter/in/operation/registration-operation-owner';
import { ChannelsRegistrationStateModule } from './channels-registration-state.module';
import { CHANNEL_REGISTRABLE_DETAIL_PAGE_PORT } from './application/port/out/content/registrable-detail-page.port';
import { CHANNEL_REGISTRABLE_THUMBNAIL_PORT } from './application/port/out/content/registrable-thumbnail.port';
import { CHANNEL_ADAPTER_REGISTRY_PORT } from './application/port/out/channel/channel-adapter.port';
import { CHANNELS_THUMBNAIL_EXECUTION_PORT } from './application/port/in/thumbnail-execution.port';
import { ChannelIntegrityAdapter } from './adapter/out/integrity/channel-integrity.adapter';
import { CHANNEL_INTEGRITY_PORT } from './application/port/out/integrity/channel-integrity.port';

/**
 * 몰 등록 실행 kind `channels.registration` · 몰 판매 상태 읽기 kind `channels.mall_availability_read`의 owner(ADR-0014 · 0025,
 * KID-364). 실행 행은 실행 계약이 쓰고, 이 모듈은 plan · finalize와 `reconciling` 확인 · 닫기 라우트, 품절 후보 미리보기를 갖는다.
 */
@Module({
  imports: [ProductCollectionRuntimeModule, PrismaModule, ChannelsModule, AiModule, SalesProductModule, ChannelCatalogModule, ChannelsRegistrationStateModule, OperationModule],
  controllers: [StockoutCheckController, ChannelRegistrationExecutionController, RegistrationOperationController],
  providers: [
    StockoutCheckPersistenceAdapter,
    { provide: STOCKOUT_CHECK_PERSISTENCE_PORT, useExisting: StockoutCheckPersistenceAdapter },
    { provide: StockoutCheckService, useFactory: (...dependencies: ConstructorParameters<typeof StockoutCheckService>) => new StockoutCheckService(...dependencies), inject: [STOCKOUT_CHECK_PERSISTENCE_PORT, CHANNEL_ADAPTER_REGISTRY_PORT] },
    { provide: STOCKOUT_CHECK_PORT, useExisting: StockoutCheckService },
    ChannelIntegrityAdapter,
    { provide: CHANNEL_INTEGRITY_PORT, useExisting: ChannelIntegrityAdapter },
    RegistrationOperationRepositoryAdapter,
    { provide: REGISTRATION_OPERATION_REPOSITORY_PORT, useExisting: RegistrationOperationRepositoryAdapter },
    { provide: RegistrationOperationService, useFactory: (...dependencies: ConstructorParameters<typeof RegistrationOperationService>) => new RegistrationOperationService(...dependencies), inject: [REGISTRATION_OPERATION_REPOSITORY_PORT, SALES_PRODUCT_PORT, REGISTRATION_TARGET_PORT, CHANNEL_REGISTRABLE_DETAIL_PAGE_PORT, CHANNEL_REGISTRABLE_THUMBNAIL_PORT, CHANNELS_THUMBNAIL_EXECUTION_PORT, CHANNEL_ADAPTER_REGISTRY_PORT, CHANNEL_INTEGRITY_PORT, OPERATION_PORT] },
    { provide: REGISTRATION_OPERATION_PORT, useExisting: RegistrationOperationService },
    { provide: MallAvailabilityReadService, useFactory: (...dependencies: ConstructorParameters<typeof MallAvailabilityReadService>) => new MallAvailabilityReadService(...dependencies), inject: [REGISTRATION_OPERATION_REPOSITORY_PORT] },
    { provide: MALL_AVAILABILITY_READ_OPERATION_PORT, useExisting: MallAvailabilityReadService },
    RegistrationOperationOwner,
    MallAvailabilityReadOperationOwner,
  ],
  exports: [STOCKOUT_CHECK_PORT, REGISTRATION_OPERATION_PORT],
})
export class ChannelsRegistrationOperationModule {}
