import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DetailPageDirectGenerationJobService } from './detail-page-direct-generation-job.service';
import { ThumbnailDirectGenerationJobService } from './thumbnail-direct-generation-job.service';
import { AiDirectJobWorkerService } from './ai-direct-job-worker.service';

@Injectable()
export class AiDirectJobWakeRegistrationService implements OnModuleInit {
  constructor(
    private readonly worker: AiDirectJobWorkerService,
    private readonly detailJobs: DetailPageDirectGenerationJobService,
    private readonly thumbnailJobs: ThumbnailDirectGenerationJobService,
  ) {}

  onModuleInit(): void {
    this.detailJobs.attachWakePort(this.worker);
    this.thumbnailJobs.attachWakePort(this.worker);
  }
}
