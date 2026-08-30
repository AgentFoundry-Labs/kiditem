import { Module } from '@nestjs/common';
import { SellpiaMasterProductProfitFactReader } from '../analytics/sellpia-product-sales/sellpia-master-product-profit-fact.reader';
import { MASTER_PRODUCT_PROFIT_FACT_READ_PORT } from '../analytics/application/port/in/master-product-profit-fact-read.port';
import { AdvertisingProfitabilityReadModule } from '../advertising/advertising-profitability-read.module';
import { MASTER_PRODUCT_PROFITABILITY_READ_PORT } from '../finance/application/port/in/master-product-profitability-read.port';
import { MasterProductProfitabilityReadService } from '../finance/application/service/master-product-profitability-read.service';
import { OperationsModule } from '../operations/operations.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  ProductProfitabilityAbcOperationHandler,
  ProductProfitabilityRefreshOperationHandler,
} from './adapter/in/operation/product-profitability.operation-handler';
import { MasterProductAbcRepositoryAdapter } from './adapter/out/repository/master-product-abc.repository.adapter';
import { MASTER_PRODUCT_ABC_REPOSITORY_PORT } from './application/port/out/repository/master-product-abc.repository.port';
import { MasterProductAbcService } from './application/service/master-product-abc.service';

/**
 * Controller-free execution composition for Products profitability Operations.
 * It imports only the published Advertising read port, not Finance or Products
 * API modules.
 */
@Module({
  imports: [PrismaModule, AdvertisingProfitabilityReadModule, OperationsModule],
  providers: [
    ProductProfitabilityRefreshOperationHandler,
    ProductProfitabilityAbcOperationHandler,
    MasterProductAbcService,
    MasterProductAbcRepositoryAdapter,
    MasterProductProfitabilityReadService,
    SellpiaMasterProductProfitFactReader,
    { provide: MASTER_PRODUCT_ABC_REPOSITORY_PORT, useExisting: MasterProductAbcRepositoryAdapter },
    { provide: MASTER_PRODUCT_PROFITABILITY_READ_PORT, useExisting: MasterProductProfitabilityReadService },
    { provide: MASTER_PRODUCT_PROFIT_FACT_READ_PORT, useExisting: SellpiaMasterProductProfitFactReader },
  ],
})
export class ProductsOperationWorkerModule {}
