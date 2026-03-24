import { Module } from '@nestjs/common';
import { SourcingController } from './sourcing.controller';
import { SourcingService } from './sourcing.service';

@Module({
  controllers: [SourcingController],
  providers: [SourcingService],
})
export class SourcingModule {}
