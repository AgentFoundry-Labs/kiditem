import { Module } from '@nestjs/common';
import { AgentCapabilityRegistry } from './application/service/agent-capability-registry.service';
import { AgentOsPlatformProbeCapabilityAdapter } from './adapter/in/agent/agent-os-platform-probe-capability.adapter';
import { AgentOsCapabilityCompositionAdapter } from './adapter/in/agent/agent-os-capability-composition.adapter';
import { AGENT_OS_PLATFORM_PROBE_CAPABILITY_PORT } from './application/port/in/capability/platform-probe.port';
import { AGENT_OS_CAPABILITY_COMPOSITION_PORT } from './application/port/in/capability/agent-os-capability-composition.port';

/** Controller-free capability registration and owner adapter composition. */
@Module({
  providers: [AgentCapabilityRegistry, AgentOsPlatformProbeCapabilityAdapter, AgentOsCapabilityCompositionAdapter, { provide: AGENT_OS_PLATFORM_PROBE_CAPABILITY_PORT, useExisting: AgentOsPlatformProbeCapabilityAdapter }, { provide: AGENT_OS_CAPABILITY_COMPOSITION_PORT, useExisting: AgentOsCapabilityCompositionAdapter }],
  exports: [AgentCapabilityRegistry, AGENT_OS_PLATFORM_PROBE_CAPABILITY_PORT, AGENT_OS_CAPABILITY_COMPOSITION_PORT],
})
export class AgentOsCapabilityModule {}
