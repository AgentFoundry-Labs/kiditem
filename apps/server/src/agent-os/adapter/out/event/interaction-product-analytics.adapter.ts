import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type {
  InteractionProductAnalyticsPort,
  InteractionRunFinishedAnalyticsEvent,
  InteractionRunFinishedAnalyticsInput,
} from '../../../application/port/out/event/interaction-product-analytics.port';

const rendererKindSchema = z.enum([
  'metric_group',
  'notice',
  'resource_list',
  'comparison',
  'navigation',
  'suggested_replies',
]);

const inputSchema = z.object({
  event: z.literal('interaction_run_finished'),
  organizationId: z.string().min(1).max(128),
  sessionId: z.string().min(1).max(128),
  executionId: z.string().min(1).max(128),
  agentDefinitionKey: z.string().min(1).max(128),
  surface: z.enum(['global_panel', 'agent_os_workspace']),
  durationMs: z.number().int().min(0).max(86_400_000),
  outcome: z.enum(['completed', 'failed', 'cancelled']),
  rendererKinds: z.array(rendererKindSchema).max(6),
}).strict();

@Injectable()
export class InteractionProductAnalyticsAdapter implements InteractionProductAnalyticsPort {
  constructor(
    private readonly organizationHmacKey: string,
    private readonly emit: (event: InteractionRunFinishedAnalyticsEvent) => Promise<void>,
  ) {
    if (organizationHmacKey.length < 32) throw new Error('INTERACTION_ANALYTICS_HMAC_KEY_INVALID');
  }

  async record(raw: InteractionRunFinishedAnalyticsInput): Promise<boolean> {
    const parsed = inputSchema.safeParse(raw);
    if (!parsed.success) throw new Error('INTERACTION_ANALYTICS_INVALID');
    const { organizationId, ...metadata } = parsed.data;
    const event: InteractionRunFinishedAnalyticsEvent = {
      ...metadata,
      organizationHash: createHmac('sha256', this.organizationHmacKey)
        .update(organizationId)
        .digest('hex'),
    };
    try {
      await this.emit(event);
      return true;
    } catch {
      return false;
    }
  }
}
