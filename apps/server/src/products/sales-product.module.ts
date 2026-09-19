import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductRecipeMutationModule } from './product-recipe-mutation.module';
import { SalesProductLinkService } from './application/service/sales-product-link.service';
import { SalesProductController } from './adapter/in/http/sales-product.controller';
import { SalesProductRepositoryAdapter } from './adapter/out/repository/sales-product.repository.adapter';
import { SALES_PRODUCT_REPOSITORY_PORT } from './application/port/out/repository/sales-product.repository.port';
import { SabangnetProductImportService } from './application/service/sabangnet-product-import.service';
import { SalesProductService } from './application/service/sales-product.service';

/**
 * 판매상품 · 단품(ADR-0013). 몰에 보낼 상품을 한 번 편집하는 등록용 정의이고, 재고 · ABC 는 건드리지 않는다.
 * 몰 상품과 이을 때 비어 있는 채널 옵션 레시피만 레시피 owner 의 포트로 채운다. 셀피아 SKU 는 Inventory 의
 * 읽기 포트로만 본다.
 */
@Module({
  imports: [InventoryModule, ProductRecipeMutationModule],
  controllers: [SalesProductController],
  providers: [
    SalesProductService,
    SabangnetProductImportService,
    SalesProductLinkService,
    SalesProductRepositoryAdapter,
    { provide: SALES_PRODUCT_REPOSITORY_PORT, useExisting: SalesProductRepositoryAdapter },
  ],
  exports: [SalesProductService],
})
export class SalesProductModule {}
