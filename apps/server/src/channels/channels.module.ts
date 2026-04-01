import { Module } from '@nestjs/common';
import { ChannelSyncController } from './controllers/channel-sync.controller';
import { ChannelSyncService } from './services/channel-sync.service';
import { ChannelDashboardController } from './controllers/channel-dashboard.controller';
import { ChannelDashboardService } from './services/channel-dashboard.service';

@Module({
  controllers: [ChannelSyncController, ChannelDashboardController],
  providers: [ChannelSyncService, ChannelDashboardService],
})
export class ChannelsModule {}
