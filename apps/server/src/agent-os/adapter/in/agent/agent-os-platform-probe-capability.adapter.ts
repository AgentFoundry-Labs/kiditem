import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { AgentCapabilityRegistry } from '../../../application/service/agent-capability-registry.service';
import type { AgentCapabilityHandler } from '../../../application/port/out/capability/agent-capability-handler.port';

@Injectable()
export class AgentOsPlatformProbeCapabilityAdapter implements OnModuleInit {
  constructor(private readonly registry: AgentCapabilityRegistry) {}

  onModuleInit(): void {
    this.registry.register(this.handler());
  }

  private handler(): AgentCapabilityHandler {
    return {
      key: 'agent_os.platform_probe',
      ownerDomain: 'agent_os',
      executionKind: 'tool',
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ status: z.literal('available') }).strict(),
      sideEffects: ['read'],
      approvalRisk: 'none',
      idempotencyKey: () => null,
      execute: async () => ({
        resourceType: 'agent_os_platform',
        outputSummary: { status: 'available' },
      }),
    };
  }
}
