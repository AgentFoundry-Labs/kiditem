import { SALES_PRODUCT_COUPANG_CATALOG_PORT } from "./application/port/in/sales-product/sales-product-coupang-catalog.port";
import { SALES_PRODUCT_MALL_SHEET_PORT } from "./application/port/in/sales-product/sales-product-mall-sheet.port";
import { SALES_PRODUCT_MALL_PRICE_PORT } from "./application/port/in/sales-product/sales-product-mall-price.port";
import { SALES_PRODUCT_IMAGE_PORT } from "./application/port/in/sales-product/sales-product-image.port";
import { SALES_PRODUCT_LINK_PORT } from "./application/port/in/sales-product/sales-product-link.port";
import { SABANGNET_PRODUCT_IMPORT_PORT } from "./application/port/in/collection/sabangnet-product-import.port";
import { ChannelIntegrityAdapter } from './adapter/out/integrity/channel-integrity.adapter';
import { CHANNEL_INTEGRITY_PORT } from './application/port/out/integrity/channel-integrity.port';
import { ChannelActivityAdapter } from './adapter/out/alerts/channel-activity.adapter';
import { CHANNEL_OPTION_RECIPE_PORT } from './application/port/in/channel-option-recipe.port';
import { CHANNEL_ACTIVITY_PORT } from './application/port/out/alerts/channel-activity.port';
import { PRODUCT_SOURCE_READ_PORT } from '../products/application/port/in/product-source-read.port';
import { REGISTRATION_TARGET_PORT } from './application/port/in/registration-target.port';
import { ChannelsDocumentsAdapter } from './adapter/out/documents/channel-documents.adapter';
import { CHANNEL_DOCUMENTS_PORT } from './application/port/out/documents/channel-documents.port';
import { REGISTRATION_TARGET_REPOSITORY_PORT } from './application/port/out/persistence/registration-target.repository.port';
import { RegistrationTargetUseCase } from './application/service/registration/registration-target.usecase';
import { RegistrationTargetController } from './adapter/in/web/registration-target.controller';
import { RegistrationTargetRepositoryAdapter } from './adapter/out/persistence/registration-target.repository.adapter';
import { SALES_PRODUCT_PORT } from './application/port/in/sales-product.port';
import { forwardRef, Module } from '@nestjs/common';
import { ProductCollectionRuntimeModule } from '../products/product-collection-runtime.module';
import { ChannelOptionRecipeModule } from './channel-option-recipe.module';
import { SalesProductLinkService } from './application/service/sales-product/sales-product-link.service';
import { SalesProductImageService } from './application/service/sales-product/sales-product-image.service';
import { SalesProductMallPriceService } from './application/service/sales-product/sales-product-mall-price.service';
import { SalesProductMallSheetService } from './application/service/sales-product/sales-product-mall-sheet.service';
import { SalesProductCoupangCatalogService } from './application/service/sales-product/sales-product-coupang-catalog.service';
import { MallBulkSheetFilesAdapter } from './adapter/out/storage/mall-bulk-sheet-files.adapter';
import { MALL_BULK_SHEET_FILES_PORT } from './application/port/out/storage/mall-bulk-sheet-files.port';
import { SalesProductImageMirrorAdapter } from './adapter/out/storage/sales-product-image-mirror.adapter';
import { SALES_PRODUCT_IMAGE_MIRROR_PORT } from './application/port/out/storage/sales-product-image-mirror.port';
import { SalesProductController } from './adapter/in/web/sales-product.controller';
import { SalesProductRepositoryAdapter } from './adapter/out/persistence/sales-product.repository.adapter';
import { SALES_PRODUCT_REPOSITORY_PORT } from './application/port/out/persistence/sales-product.repository.port';
import { SabangnetProductImportService } from './application/service/collection/sabangnet-product-import.service';
import { SalesProductUseCase } from './application/service/sales-product/sales-product.usecase';
import { AiModule } from '../ai/ai.module';
import { SalesProductWorkspaceArchiveAdapter } from './adapter/out/repository/sales-product-workspace-archive.adapter';
import { SALES_PRODUCT_WORKSPACE_ARCHIVE_PORT } from './application/port/out/ai/sales-product-workspace-archive.port';

/**
 * 판매상품 · 단품(ADR-0020). 몰에 보낼 상품을 한 번 편집하는 등록용 정의이고, 재고 · ABC 는 건드리지 않는다.
 * 몰 상품과 이을 때 비어 있는 채널 옵션 레시피만 레시피 owner 의 포트로 채운다. 원천 상품은 Products 의
 * 읽기 포트로만 보고, 사방넷 서버 사진은 공용 저장소(StorageModule)로 옮긴다. 몰 대량등록 엑셀은 저장소에 둔 몰
 * 양식 파일을 채워 내려줄 뿐 몰에 올리지 않는다.
 */
@Module({
  // AI 는 판매상품 초안을 읽고(작업공간 소유자 확인) Channels 는 초안을 내릴 때 AI 작업공간을
  // 보관한다 — 두 owner 가 서로의 공개 계약만 부르는 양방향 의존이라 forwardRef 로 푼다.
  imports: [ProductCollectionRuntimeModule, ChannelOptionRecipeModule, forwardRef(() => AiModule)],
  controllers: [SalesProductController, RegistrationTargetController],
  providers: [
    { provide: SALES_PRODUCT_COUPANG_CATALOG_PORT, useExisting: SalesProductCoupangCatalogService },
    { provide: SALES_PRODUCT_MALL_SHEET_PORT, useExisting: SalesProductMallSheetService },
    { provide: SALES_PRODUCT_MALL_PRICE_PORT, useExisting: SalesProductMallPriceService },
    { provide: SALES_PRODUCT_IMAGE_PORT, useExisting: SalesProductImageService },
    { provide: SALES_PRODUCT_LINK_PORT, useExisting: SalesProductLinkService },
    { provide: SABANGNET_PRODUCT_IMPORT_PORT, useExisting: SabangnetProductImportService },
    ChannelIntegrityAdapter,
    { provide: CHANNEL_INTEGRITY_PORT, useExisting: ChannelIntegrityAdapter },
    ChannelActivityAdapter,
    { provide: CHANNEL_ACTIVITY_PORT, useExisting: ChannelActivityAdapter },
    ChannelsDocumentsAdapter,
    { provide: CHANNEL_DOCUMENTS_PORT, useExisting: ChannelsDocumentsAdapter },
    { provide: RegistrationTargetUseCase, useFactory: (...dependencies: ConstructorParameters<typeof RegistrationTargetUseCase>) => new RegistrationTargetUseCase(...dependencies), inject: [REGISTRATION_TARGET_REPOSITORY_PORT] },
    { provide: REGISTRATION_TARGET_PORT, useExisting: RegistrationTargetUseCase },
    RegistrationTargetRepositoryAdapter,
    { provide: REGISTRATION_TARGET_REPOSITORY_PORT, useExisting: RegistrationTargetRepositoryAdapter },
    SalesProductWorkspaceArchiveAdapter,
    { provide: SALES_PRODUCT_WORKSPACE_ARCHIVE_PORT, useExisting: SalesProductWorkspaceArchiveAdapter },
    { provide: SalesProductUseCase, useFactory: (...dependencies: ConstructorParameters<typeof SalesProductUseCase>) => new SalesProductUseCase(...dependencies), inject: [SALES_PRODUCT_REPOSITORY_PORT, SALES_PRODUCT_WORKSPACE_ARCHIVE_PORT] },
    { provide: SALES_PRODUCT_PORT, useExisting: SalesProductUseCase },
    { provide: SabangnetProductImportService, useFactory: (...dependencies: ConstructorParameters<typeof SabangnetProductImportService>) => new SabangnetProductImportService(...dependencies), inject: [SALES_PRODUCT_REPOSITORY_PORT, PRODUCT_SOURCE_READ_PORT, SALES_PRODUCT_LINK_PORT, SALES_PRODUCT_IMAGE_MIRROR_PORT, CHANNEL_DOCUMENTS_PORT, CHANNEL_ACTIVITY_PORT, CHANNEL_INTEGRITY_PORT] },
    { provide: SalesProductLinkService, useFactory: (...dependencies: ConstructorParameters<typeof SalesProductLinkService>) => new SalesProductLinkService(...dependencies), inject: [SALES_PRODUCT_REPOSITORY_PORT, CHANNEL_OPTION_RECIPE_PORT, CHANNEL_ACTIVITY_PORT] },
    { provide: SalesProductImageService, useFactory: (...dependencies: ConstructorParameters<typeof SalesProductImageService>) => new SalesProductImageService(...dependencies), inject: [SALES_PRODUCT_REPOSITORY_PORT, SALES_PRODUCT_IMAGE_MIRROR_PORT, CHANNEL_ACTIVITY_PORT, CHANNEL_INTEGRITY_PORT] },
    { provide: SalesProductMallPriceService, useFactory: (...dependencies: ConstructorParameters<typeof SalesProductMallPriceService>) => new SalesProductMallPriceService(...dependencies), inject: [SALES_PRODUCT_REPOSITORY_PORT, CHANNEL_ACTIVITY_PORT] },
    { provide: SalesProductMallSheetService, useFactory: (...dependencies: ConstructorParameters<typeof SalesProductMallSheetService>) => new SalesProductMallSheetService(...dependencies), inject: [SALES_PRODUCT_REPOSITORY_PORT, MALL_BULK_SHEET_FILES_PORT, CHANNEL_ACTIVITY_PORT] },
    { provide: SalesProductCoupangCatalogService, useFactory: (...dependencies: ConstructorParameters<typeof SalesProductCoupangCatalogService>) => new SalesProductCoupangCatalogService(...dependencies), inject: [SALES_PRODUCT_REPOSITORY_PORT, CHANNEL_DOCUMENTS_PORT] },
    SalesProductRepositoryAdapter,
    { provide: SALES_PRODUCT_REPOSITORY_PORT, useExisting: SalesProductRepositoryAdapter },
    SalesProductImageMirrorAdapter,
    { provide: SALES_PRODUCT_IMAGE_MIRROR_PORT, useExisting: SalesProductImageMirrorAdapter },
    MallBulkSheetFilesAdapter,
    { provide: MALL_BULK_SHEET_FILES_PORT, useExisting: MallBulkSheetFilesAdapter },
  ],
  exports: [SALES_PRODUCT_PORT, REGISTRATION_TARGET_PORT],
})
export class SalesProductModule {}
