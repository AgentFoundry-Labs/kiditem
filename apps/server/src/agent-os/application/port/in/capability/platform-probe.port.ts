export const AGENT_OS_PLATFORM_PROBE_CAPABILITY_PORT = Symbol(
  'AGENT_OS_PLATFORM_PROBE_CAPABILITY_PORT',
);

export interface AgentOsPlatformProbeCapabilityPort {
  platformProbe(): Promise<{ status: 'available' }>;
}
