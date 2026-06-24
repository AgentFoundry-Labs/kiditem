import { describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityRegistry } from '../../../../agent-os/application/service/agent-capability-registry.service';
import { ThumbnailWingService } from '../../../../application/service/thumbnail-wing.service';
import { AiWingRegistrationCapabilityAdapter } from '../ai-wing-registration-capability.adapter';

const GENERATION_ID = '0187e942-9098-7382-9a22-c5b821f2f5d1';

describe('AiWingRegistrationCapabilityAdapter', () => {
  it('registers approval-gated Wing thumbnail submission as an AI-owned capability', async () => {
    const register = vi.fn();
    const registry = { register } as unknown as AgentCapabilityRegistry;
    const wing = {
      registerToWing: vi.fn().mockResolvedValue({
        success: true,
        screenshotPath: '/tmp/wing-upload.png',
      }),
    } as unknown as ThumbnailWingService;
    const adapter = new AiWingRegistrationCapabilityAdapter(registry, wing);

    adapter.onModuleInit();

    expect(register).toHaveBeenCalledTimes(1);
    const handler = register.mock.calls[0][0];
    expect(handler).toMatchObject({
      key: 'product_listing.submit_wing_thumbnail',
      ownerDomain: 'ai',
      executionKind: 'workflow',
      sideEffects: ['external_write', 'browser', 'db_write'],
      approvalRisk: 'high',
    });
    expect(
      handler.idempotencyKey({
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        agentInstanceId: 'agent-1',
        agentType: 'sourcing',
        requestId: 'request-1',
        runId: 'run-1',
        input: { generationId: GENERATION_ID },
      }),
    ).toBe(`org-1:product_listing.submit_wing_thumbnail:${GENERATION_ID}`);

    const result = await handler.execute({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      agentInstanceId: 'agent-1',
      agentType: 'sourcing',
      requestId: 'request-1',
      runId: 'run-1',
      requestedByUserId: 'user-1',
      input: { generationId: GENERATION_ID },
    });

    expect(wing.registerToWing).toHaveBeenCalledWith(GENERATION_ID, 'org-1');
    expect(result).toEqual({
      resourceType: 'thumbnail_generation',
      resourceId: GENERATION_ID,
      outputSummary: {
        success: true,
        screenshotPath: '/tmp/wing-upload.png',
      },
      artifacts: [
        {
          artifactType: 'wing_registration_submission',
          targetDomain: 'ai',
          targetModel: 'ThumbnailGeneration',
          targetId: GENERATION_ID,
          title: 'Wing 썸네일 등록 완료',
          href: null,
          summary: {
            generationId: GENERATION_ID,
            success: true,
            screenshotPath: '/tmp/wing-upload.png',
          },
        },
      ],
    });
  });

  it('marks unsuccessful Wing automation as a capability failure', async () => {
    const register = vi.fn();
    const registry = { register } as unknown as AgentCapabilityRegistry;
    const wing = {
      registerToWing: vi.fn().mockResolvedValue({
        success: false,
        screenshotPath: null,
        error: 'Wing upload failed',
      }),
    } as unknown as ThumbnailWingService;
    const adapter = new AiWingRegistrationCapabilityAdapter(registry, wing);
    adapter.onModuleInit();

    const handler = register.mock.calls[0][0];

    await expect(
      handler.execute({
        organizationId: 'org-1',
        agentInstanceId: 'agent-1',
        agentType: 'sourcing',
        input: { generationId: GENERATION_ID },
      }),
    ).rejects.toThrow('Wing upload failed');
  });
});
