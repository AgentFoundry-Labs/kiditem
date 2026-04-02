import { Module } from '@nestjs/common';
import { ActionCapService } from './action-cap.service';
import { DryRunGateService } from './dry-run-gate.service';
import { SnapshotService } from './snapshot.service';
import { PostVerificationService } from './post-verification.service';
import { SafetyPipelineService } from './safety-pipeline.service';

@Module({
  providers: [
    ActionCapService,
    DryRunGateService,
    SnapshotService,
    PostVerificationService,
    SafetyPipelineService,
  ],
  exports: [SafetyPipelineService, DryRunGateService, SnapshotService],
})
export class BusinessSafetyModule {}
