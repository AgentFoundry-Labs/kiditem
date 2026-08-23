import { Module } from '@nestjs/common';
import { DashboardCapabilityModule } from '../analytics/dashboard/dashboard-capability.module';
import { AgentOsPlatformProbeCapabilityAdapter } from './adapter/in/agent/agent-os-platform-probe-capability.adapter';
import { AnalyticsOverviewAgentCapabilityAdapter } from './adapter/in/agent/analytics-overview-agent-capability.adapter';
import { AGENT_CAPABILITY_REGISTRY_PORT } from './application/port/in/capability/agent-capability-registry.port';
import { AgentCapabilityRegistry } from './application/service/agent-capability-registry.service';
import { KidItemMcpToolRegistry } from './application/service/kiditem-mcp-tool-registry.service';
import { AGENT_OS_PLATFORM_PROBE_CAPABILITY_PORT } from './application/port/in/capability/platform-probe.port';

/** Controller-free capability registration and owner adapter composition. */
@Module({
  imports: [DashboardCapabilityModule],
  providers: [
    AgentCapabilityRegistry,
    KidItemMcpToolRegistry,
    AgentOsPlatformProbeCapabilityAdapter,
    AnalyticsOverviewAgentCapabilityAdapter,
    {
      provide: AGENT_CAPABILITY_REGISTRY_PORT,
      useExisting: AgentCapabilityRegistry,
    },
    { provide: AGENT_OS_PLATFORM_PROBE_CAPABILITY_PORT, useExisting: AgentOsPlatformProbeCapabilityAdapter },
  ],
  exports: [
    AgentCapabilityRegistry,
    KidItemMcpToolRegistry,
    AGENT_CAPABILITY_REGISTRY_PORT,
    AGENT_OS_PLATFORM_PROBE_CAPABILITY_PORT,
  ],
})
export class AgentOsCapabilityModule {}
