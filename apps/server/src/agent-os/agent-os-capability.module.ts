import { Module } from '@nestjs/common';
import { AgentCapabilityRegistry } from './application/service/agent-capability-registry.service';
import { AgentOsPlatformProbeCapabilityAdapter } from './adapter/in/agent/agent-os-platform-probe-capability.adapter';
import { AGENT_OS_PLATFORM_PROBE_CAPABILITY_PORT } from './application/port/in/capability/platform-probe.port';

/** Controller-free capability registration and owner adapter composition. */
@Module({
  providers: [AgentCapabilityRegistry, AgentOsPlatformProbeCapabilityAdapter, { provide: AGENT_OS_PLATFORM_PROBE_CAPABILITY_PORT, useExisting: AgentOsPlatformProbeCapabilityAdapter }],
  exports: [AgentCapabilityRegistry, AGENT_OS_PLATFORM_PROBE_CAPABILITY_PORT],
})
export class AgentOsCapabilityModule {}
