import { Module } from '@nestjs/common';
import { AutomationModule } from '../../automation/automation.module';
import { TrafficController } from './traffic.controller';
import { TrafficService } from './traffic.service';

@Module({
  imports: [AutomationModule],
  controllers: [TrafficController],
  providers: [TrafficService],
})
export class TrafficModule {}
