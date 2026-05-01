import { Injectable, Logger } from '@nestjs/common';
import { WakeupService } from '../wakeup/wakeup.service';

@Injectable()
export class PostVerificationService {
  private readonly logger = new Logger(PostVerificationService.name);

  constructor(private readonly wakeupService: WakeupService) {}

  async schedule(context: {
    agentId: string;
    runId: string;
    organizationId: string;
  }): Promise<void> {
    await this.wakeupService.requestWakeup({
      agentId: context.agentId,
      organizationId: context.organizationId,
      source: 'automation',
      reason: `PostVerification for run ${context.runId}`,
      triggerDetail: `verify:${context.runId}`,
      payload: {
        _verification: true,
        _originalRunId: context.runId,
      },
    });

    this.logger.log(`PostVerification scheduled for run ${context.runId}`);
  }
}
