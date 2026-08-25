import { Inject, Injectable } from '@nestjs/common';
import { defineCapabilityComposition } from '../../../../common/capability-composition';
import { AGENT_OS_CAPABILITIES } from '../../../domain/capability/agent-os.capabilities';
import {
  AGENT_OS_PLATFORM_PROBE_CAPABILITY_PORT,
  type AgentOsPlatformProbeCapabilityPort,
} from '../../../application/port/in/capability/platform-probe.port';
import type { AgentOsCapabilityCompositionPort } from '../../../application/port/in/capability/agent-os-capability-composition.port';

/** Agent OS composes its own platform probe instead of special-casing it in a root registrar. */
@Injectable()
export class AgentOsCapabilityCompositionAdapter
  implements AgentOsCapabilityCompositionPort
{
  readonly compositions;

  constructor(
    @Inject(AGENT_OS_PLATFORM_PROBE_CAPABILITY_PORT)
    private readonly platform: AgentOsPlatformProbeCapabilityPort,
  ) {
    this.compositions = [
      defineCapabilityComposition(AGENT_OS_CAPABILITIES[0], this.platform, {
        capabilityKey: 'agent_os.platform_probe',
        ownerInputPort: 'agent_os.platformProbe',
        invoke: async () => this.platform.platformProbe(),
      }),
    ];
  }
}
