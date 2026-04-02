import { Module } from '@nestjs/common';
import { RetryService } from './retry.service';
import { TranscriptService } from './transcript.service';

@Module({
  providers: [RetryService, TranscriptService],
  exports: [RetryService, TranscriptService],
})
export class LifecycleModule {}
