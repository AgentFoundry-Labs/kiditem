import { Module } from '@nestjs/common';
import { CoupangSyncController } from './coupang-sync.controller';
import { CoupangSyncService } from './coupang-sync.service';

@Module({
  controllers: [CoupangSyncController],
  providers: [CoupangSyncService],
})
export class CoupangSyncModule {}
