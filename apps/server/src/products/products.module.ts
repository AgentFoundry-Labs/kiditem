// apps/server/src/products/products.module.ts
import { Module } from '@nestjs/common';
import { MasterCodeService } from './services/master-code.service';
import { MastersService } from './services/masters.service';
import { OptionsService } from './services/options.service';
import { BundleStockService } from './services/bundle-stock.service';
import { BundleComponentsService } from './services/bundle-components.service';
import { MastersController } from './controllers/masters.controller';
import { OptionsController } from './controllers/options.controller';
import { BundleComponentsController } from './controllers/bundle-components.controller';

@Module({
  controllers: [MastersController, OptionsController, BundleComponentsController],
  providers: [
    MasterCodeService, MastersService, OptionsService,
    BundleStockService, BundleComponentsService,
  ],
  exports: [MastersService, OptionsService, BundleComponentsService],
})
export class ProductsModule {}
