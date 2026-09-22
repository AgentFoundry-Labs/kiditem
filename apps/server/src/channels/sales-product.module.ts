import { REGISTRATION_TARGET_PORT } from './application/port/in/registration-target.port';
import { REGISTRATION_TARGET_REPOSITORY_PORT } from './application/port/out/persistence/registration-target.repository.port';
import { RegistrationTargetUseCase } from './application/usecase/registration-target.usecase';
import { RegistrationTargetController } from './adapter/in/web/registration-target.controller';
import { RegistrationTargetRepositoryAdapter } from './adapter/out/persistence/registration-target.repository.adapter';
import { SALES_PRODUCT_PORT } from './application/port/in/sales-product.port';
import { Module } from '@nestjs/common';
import { ProductCollectionRuntimeModule } from '../products/product-collection-runtime.module';
import { ChannelOptionRecipeModule } from './channel-option-recipe.module';
import { SalesProductLinkService } from './application/usecase/sales-product-link.service';
import { SalesProductImageService } from './application/usecase/sales-product-image.service';
import { SalesProductMallPriceService } from './application/usecase/sales-product-mall-price.service';
import { SalesProductMallSheetService } from './application/usecase/sales-product-mall-sheet.service';
import { SalesProductCoupangCatalogService } from './application/usecase/sales-product-coupang-catalog.service';
import { MallBulkSheetFilesAdapter } from './adapter/out/storage/mall-bulk-sheet-files.adapter';
import { MALL_BULK_SHEET_FILES_PORT } from './application/port/out/storage/mall-bulk-sheet-files.port';
import { SalesProductImageMirrorAdapter } from './adapter/out/storage/sales-product-image-mirror.adapter';
import { SALES_PRODUCT_IMAGE_MIRROR_PORT } from './application/port/out/storage/sales-product-image-mirror.port';
import { SalesProductController } from './adapter/in/web/sales-product.controller';
import { SalesProductRepositoryAdapter } from './adapter/out/persistence/sales-product.repository.adapter';
import { SALES_PRODUCT_REPOSITORY_PORT } from './application/port/out/persistence/sales-product.repository.port';
import { SabangnetProductImportService } from './application/usecase/sabangnet-product-import.service';
import { SalesProductUseCase } from './application/usecase/sales-product.usecase';

/**
 * 판매상품 · 단품(ADR-0020). 몰에 보낼 상품을 한 번 편집하는 등록용 정의이고, 재고 · ABC 는 건드리지 않는다.
 * 몰 상품과 이을 때 비어 있는 채널 옵션 레시피만 레시피 owner 의 포트로 채운다. 원천 상품은 Products 의
 * 읽기 포트로만 보고, 사방넷 서버 사진은 공용 저장소(StorageModule)로 옮긴다. 몰 대량등록 엑셀은 저장소에 둔 몰
 * 양식 파일을 채워 내려줄 뿐 몰에 올리지 않는다.
 */
@Module({
  imports: [ProductCollectionRuntimeModule, ChannelOptionRecipeModule],
  controllers: [SalesProductController, RegistrationTargetController],
  providers: [
    RegistrationTargetUseCase,
    { provide: REGISTRATION_TARGET_PORT, useExisting: RegistrationTargetUseCase },
    RegistrationTargetRepositoryAdapter,
    { provide: REGISTRATION_TARGET_REPOSITORY_PORT, useExisting: RegistrationTargetRepositoryAdapter },
    SalesProductUseCase,
    { provide: SALES_PRODUCT_PORT, useExisting: SalesProductUseCase },
    SabangnetProductImportService,
    SalesProductLinkService,
    SalesProductImageService,
    SalesProductMallPriceService,
    SalesProductMallSheetService,
    SalesProductCoupangCatalogService,
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
