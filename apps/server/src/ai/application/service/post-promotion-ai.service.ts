import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
} from '../../../agent-os/application/port/in/agent-runner.port';
import type { PostPromotionAiTriggerPort } from '../port/in/post-promotion-ai-trigger.port';

const DEFAULT_DETAIL_PAGE_PAYLOAD = {
  templateId: 'kids-playful' as const,
  mode: 'full' as const,
};

@Injectable()
export class PostPromotionAiService implements PostPromotionAiTriggerPort {
  private readonly logger = new Logger(PostPromotionAiService.name);

  constructor(
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
  ) {}

  async fireForMaster(masterId: string, organizationId: string): Promise<void> {
    // Fire detail-page agent
    try {
      await this.agentRunner.runByType('detail_page_generate', {
        organizationId,
        sourceType: 'post_promotion.detail_page',
        sourceResourceType: 'master_product',
        sourceResourceId: masterId,
        reason: `post-promotion detail page for master ${masterId}`,
        payload: {
          masterId,
          templateId: DEFAULT_DETAIL_PAGE_PAYLOAD.templateId,
          mode: DEFAULT_DETAIL_PAGE_PAYLOAD.mode,
        },
      });
    } catch (err) {
      this.logger.error(
        `detail_page_generate enqueue failed for master=${masterId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    // Fire thumbnail agent
    try {
      await this.agentRunner.runByType('thumbnail_generate', {
        organizationId,
        sourceType: 'post_promotion.thumbnail',
        sourceResourceType: 'master_product',
        sourceResourceId: masterId,
        reason: `post-promotion thumbnail for master ${masterId}`,
        payload: { masterId },
      });
    } catch (err) {
      this.logger.error(
        `thumbnail_generate enqueue failed for master=${masterId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
