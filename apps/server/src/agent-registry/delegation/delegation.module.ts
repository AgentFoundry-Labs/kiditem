import { Module } from '@nestjs/common';
import { DelegationService } from './delegation.service';
import { SafetyModule } from '../safety/safety.module';
import { WakeupService } from '../wakeup/wakeup.service';

@Module({
  imports: [SafetyModule],
  providers: [DelegationService, WakeupService],
  exports: [DelegationService],
})
export class DelegationModule {}
