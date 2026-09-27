import { ChannelCatalogModule } from '../channels/channel-catalog.module';
import { Module } from '@nestjs/common';
import { AdvertisingKeywordRankReadModule } from '../advertising/advertising-keyword-rank-read.module';
import { AdvertisingLedgerReadModule } from '../advertising/advertising-ledger-read.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReadinessService } from './readiness.service';

@Module({
  imports: [ChannelCatalogModule, PrismaModule, AdvertisingKeywordRankReadModule, AdvertisingLedgerReadModule],
  providers: [ReadinessService],
  exports: [ReadinessService],
})
export class ReadinessStateModule {}
