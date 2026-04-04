import { Module } from '@nestjs/common';
import { ReturnTransfersController } from './return-transfers.controller';
import { ReturnTransfersService } from './return-transfers.service';

@Module({
  controllers: [ReturnTransfersController],
  providers: [ReturnTransfersService],
})
export class ReturnTransfersModule {}
