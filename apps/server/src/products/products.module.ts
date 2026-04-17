// apps/server/src/products/products.module.ts
import { Module } from '@nestjs/common';
import { MasterCodeService } from './services/master-code.service';

@Module({
  controllers: [],
  providers: [MasterCodeService],
  exports: [],
})
export class ProductsModule {}
