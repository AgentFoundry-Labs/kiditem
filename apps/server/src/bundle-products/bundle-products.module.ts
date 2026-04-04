import { Module } from '@nestjs/common';
import { BundleProductsController } from './bundle-products.controller';
import { BundleProductsService } from './bundle-products.service';

@Module({
  controllers: [BundleProductsController],
  providers: [BundleProductsService],
})
export class BundleProductsModule {}
