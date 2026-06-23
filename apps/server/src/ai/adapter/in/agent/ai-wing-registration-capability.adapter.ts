import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import type { AgentCapabilityHandler } from '../../../../agent-os/application/port/out/capability/agent-capability-handler.port';
import { AgentCapabilityRegistry } from '../../../../agent-os/application/service/agent-capability-registry.service';
import {
  type AiWingRegistrationCapabilityPort,
  type SubmitWingThumbnailInput,
  type SubmitWingThumbnailResult,
} from '../../../application/port/in/capability/wing-registration.port';
import { ThumbnailWingService } from '../../../application/service/thumbnail-wing.service';

const WING_THUMBNAIL_SUBMIT_KEY = 'product_listing.submit_wing_thumbnail';

const WingRegistrationInputSchema = z.object({
  generationId: z.string().uuid(),
});

const WingRegistrationOutputSchema = z.object({
  success: z.boolean(),
  screenshotPath: z.string().nullable(),
});

type WingRegistrationInput = z.infer<typeof WingRegistrationInputSchema>;

@Injectable()
export class AiWingRegistrationCapabilityAdapter
  implements OnModuleInit, AiWingRegistrationCapabilityPort
{
  constructor(
    private readonly registry: AgentCapabilityRegistry,
    private readonly wing: ThumbnailWingService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.handler());
  }

  async submitWingThumbnail(
    input: SubmitWingThumbnailInput,
  ): Promise<SubmitWingThumbnailResult> {
    const result = await this.wing.registerToWing(
      input.generationId,
      input.organizationId,
    );
    if (!result.success) {
      throw new Error(result.error ?? 'Wing upload failed');
    }
    return {
      success: true,
      screenshotPath: result.screenshotPath ?? null,
    };
  }

  private handler(): AgentCapabilityHandler<WingRegistrationInput> {
    return {
      key: WING_THUMBNAIL_SUBMIT_KEY,
      ownerDomain: 'ai',
      executionKind: 'workflow',
      inputSchema: WingRegistrationInputSchema,
      outputSchema: WingRegistrationOutputSchema,
      sideEffects: ['external_write', 'browser', 'db_write'],
      approvalRisk: 'high',
      idempotencyKey: ({ organizationId, input }) =>
        [organizationId, WING_THUMBNAIL_SUBMIT_KEY, input.generationId].join(':'),
      execute: async ({ organizationId, requestedByUserId, input }) => {
        const result = await this.submitWingThumbnail({
          organizationId,
          generationId: input.generationId,
          triggeredByUserId: requestedByUserId ?? null,
        });
        const outputSummary: Record<string, unknown> = {
          success: result.success,
          screenshotPath: result.screenshotPath,
        };
        return {
          resourceType: 'thumbnail_generation',
          resourceId: input.generationId,
          outputSummary,
          artifacts: [
            {
              artifactType: 'wing_registration_submission',
              targetDomain: 'ai',
              targetModel: 'ThumbnailGeneration',
              targetId: input.generationId,
              title: 'Wing 썸네일 등록 완료',
              href: null,
              summary: {
                generationId: input.generationId,
                success: result.success,
                screenshotPath: result.screenshotPath,
              },
            },
          ],
        };
      },
    };
  }
}
