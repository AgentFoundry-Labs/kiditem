import { Module } from '@nestjs/common';
import { DashboardController } from './adapter/in/http/dashboard.controller';
import { DashboardCapabilityModule } from './dashboard-capability.module';

@Module({
  imports: [DashboardCapabilityModule],
  controllers: [DashboardController],
  exports: [DashboardCapabilityModule],
})
export class DashboardModule {}
