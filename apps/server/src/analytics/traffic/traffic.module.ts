import { ChannelCatalogModule } from '../../channels/channel-catalog.module';
import { Module } from '@nestjs/common';
import { AdvertisingModule } from '../../advertising/advertising.module';
import { TrafficController } from './traffic.controller';
import { TrafficService } from './traffic.service';

@Module({
  imports: [ChannelCatalogModule, AdvertisingModule],
  controllers: [TrafficController],
  providers: [TrafficService],
})
export class TrafficModule {}
