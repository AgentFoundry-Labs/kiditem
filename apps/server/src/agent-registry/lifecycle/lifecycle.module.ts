import { Module } from '@nestjs/common';
import { RetryService } from './retry.service';
import { TranscriptService } from './transcript.service';
import { ResultCleanupService } from './result-cleanup.service';

@Module({
  providers: [RetryService, TranscriptService, ResultCleanupService],
  exports: [RetryService, TranscriptService, ResultCleanupService],
})
export class LifecycleModule {}
