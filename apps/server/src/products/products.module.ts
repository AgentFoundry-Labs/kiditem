// apps/server/src/products/products.module.ts
import { Module } from '@nestjs/common';
import { MasterCodeService } from './services/master-code.service';
import { MastersService } from './services/masters.service';
import { MastersController } from './controllers/masters.controller';

@Module({
  controllers: [MastersController],
  providers: [MasterCodeService, MastersService],
  exports: [MastersService],
})
export class ProductsModule {}
