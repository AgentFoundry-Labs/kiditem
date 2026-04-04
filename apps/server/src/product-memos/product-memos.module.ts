import { Module } from '@nestjs/common';
import { ProductMemosController } from './product-memos.controller';
import { ProductMemosService } from './product-memos.service';

@Module({
  controllers: [ProductMemosController],
  providers: [ProductMemosService],
})
export class ProductMemosModule {}
