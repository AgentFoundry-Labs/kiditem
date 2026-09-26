import { ChannelCatalogModule } from '../channels/channel-catalog.module';
import { Module } from '@nestjs/common';
import { AdvertisingKeywordRankReadModule } from '../advertising/advertising-keyword-rank-read.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReadinessService } from './readiness.service';

@Module({
  imports: [ChannelCatalogModule, PrismaModule, AdvertisingKeywordRankReadModule],
  providers: [ReadinessService],
  exports: [ReadinessService],
})
export class ReadinessStateModule {}
