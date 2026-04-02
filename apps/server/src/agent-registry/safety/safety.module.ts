import { Module } from '@nestjs/common';
import { SkillFilterService } from './skill-filter.service';
import { DenialTrackerService } from './denial-tracker.service';

@Module({
  providers: [SkillFilterService, DenialTrackerService],
  exports: [SkillFilterService, DenialTrackerService],
})
export class SafetyModule {}
