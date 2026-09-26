import { ProductCollectionRuntimeModule } from '../../products/product-collection-runtime.module';
import { Module } from '@nestjs/common';
import { SellpiaProductProfitabilityOperationOwner } from '../adapter/in/operation/sellpia-product-profitability-operation-owner';
import { SELLPIA_PROFITABILITY_SOURCE_READ_PORT } from '../application/port/in/sellpia-profitability-source-read.port';
import { SellpiaProfitabilityPublicationRepository } from './sellpia-profitability-publication.repository';
import { SellpiaProfitabilitySourceService } from './sellpia-profitability-source.service';

// 셀피아 상품 손익: 실행 kind `analytics.sellpia_product_profitability`(KID-361 J3)의 발행과 세대 읽기 문.
@Module({
  imports: [ProductCollectionRuntimeModule],
  providers: [
    SellpiaProfitabilitySourceService,
    SellpiaProfitabilityPublicationRepository,
    SellpiaProductProfitabilityOperationOwner,
    { provide: SELLPIA_PROFITABILITY_SOURCE_READ_PORT, useExisting: SellpiaProfitabilitySourceService },
  ],
  exports: [SellpiaProfitabilitySourceService, SELLPIA_PROFITABILITY_SOURCE_READ_PORT],
})
export class SellpiaProfitabilitySourceModule {}
