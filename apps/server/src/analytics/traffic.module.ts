import { Module } from '@nestjs/common';
import { AdvertisingModule } from '../advertising/advertising.module';
import { TrafficController } from './adapter/in/http/traffic/traffic.controller';
import { TrafficService } from './application/service/traffic/traffic.service';

@Module({
  imports: [AdvertisingModule],
  controllers: [TrafficController],
  providers: [TrafficService],
})
export class TrafficModule {}
