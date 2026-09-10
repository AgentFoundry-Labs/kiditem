import { Module } from '@nestjs/common';
import { AdvertisingModule } from '../advertising/advertising.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReadinessService } from './readiness.service';

@Module({
  imports: [PrismaModule, AdvertisingModule],
  providers: [ReadinessService],
  exports: [ReadinessService],
})
export class ReadinessStateModule {}
