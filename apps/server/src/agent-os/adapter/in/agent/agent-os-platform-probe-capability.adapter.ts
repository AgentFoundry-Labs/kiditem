import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { AGENT_CAPABILITY_REGISTRY_PORT, type AgentCapabilityRegistryPort } from '../../../application/port/in/capability/agent-capability-registry.port';
import type { AgentCapabilityHandler } from '../../../application/port/out/capability/agent-capability-handler.port';

@Injectable()
export class AgentOsPlatformProbeCapabilityAdapter implements OnModuleInit {
  constructor(@Inject(AGENT_CAPABILITY_REGISTRY_PORT) private readonly registry: AgentCapabilityRegistryPort) {}

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
      executeInteractive: async () => ({
        resourceType: 'agent_os_platform',
        outputSummary: { status: 'available' },
      }),
    };
  }
}
