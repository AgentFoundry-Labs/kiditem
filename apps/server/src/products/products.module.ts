// apps/server/src/products/products.module.ts
import { Module } from '@nestjs/common';
import { MasterCodeService } from './services/master-code.service';
import { MastersService } from './services/masters.service';
import { OptionsService } from './services/options.service';
import { BundleStockService } from './services/bundle-stock.service';
import { MastersController } from './controllers/masters.controller';
import { OptionsController } from './controllers/options.controller';

@Module({
  controllers: [MastersController, OptionsController],
  providers: [MasterCodeService, MastersService, OptionsService, BundleStockService],
  exports: [MastersService, OptionsService],
})
export class ProductsModule {}
