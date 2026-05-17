import { Module } from '@nestjs/common';
import { AutomationModule } from '../../automation/automation.module';
import { TrafficController } from './traffic.controller';
import { TrafficService } from './traffic.service';
import { TrafficOperationAlertAdapter } from './adapter/out/automation/operation-alert.adapter';
import { TRAFFIC_OPERATION_ALERT_PORT } from './application/port/out/operation-alert.port';

@Module({
  imports: [AutomationModule],
  controllers: [TrafficController],
  providers: [
    TrafficService,
    TrafficOperationAlertAdapter,
    { provide: TRAFFIC_OPERATION_ALERT_PORT, useExisting: TrafficOperationAlertAdapter },
  ],
})
export class TrafficModule {}
