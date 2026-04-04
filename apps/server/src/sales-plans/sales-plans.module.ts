import { Module } from '@nestjs/common';
import { SalesPlansController } from './sales-plans.controller';
import { SalesPlansService } from './sales-plans.service';

@Module({
  controllers: [SalesPlansController],
  providers: [SalesPlansService],
})
export class SalesPlansModule {}
