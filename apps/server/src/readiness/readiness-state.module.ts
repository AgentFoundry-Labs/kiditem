import { ChannelCatalogModule } from '../channels/channel-catalog.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReadinessService } from './readiness.service';

@Module({
  imports: [ChannelCatalogModule, PrismaModule],
  providers: [ReadinessService],
  exports: [ReadinessService],
})
export class ReadinessStateModule {}
