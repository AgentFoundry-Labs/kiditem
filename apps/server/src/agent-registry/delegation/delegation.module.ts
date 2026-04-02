import { Module } from '@nestjs/common';
import { DelegationService } from './delegation.service';
import { SafetyModule } from '../safety/safety.module';

@Module({
  imports: [SafetyModule],
  providers: [DelegationService],
  exports: [DelegationService],
})
export class DelegationModule {}
