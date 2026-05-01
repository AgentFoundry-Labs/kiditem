/**
 * Inbound use-case port: control the cron schedule of a tenant-owned
 * agent definition managed by the Agent OS runtime.
 *
 * Callers (e.g. `RulesController`) depend on this interface, not on
 * `AgentRegistryService` / `HeartbeatService` directly. The adapter that
 * fulfils the port lives in `automation/adapter/out/agent-runtime/`; it
 * is the single seam that knows how the schedule is persisted and how
 * the live cron timers are reloaded.
 *
 * Contract guarantees:
 * - Tenant scope is enforced inside the port. The adapter rejects any
 *   write against a global / cross-tenant agent definition by throwing
 *   `TenantOwnedAgentRequiredError`. Callers must never assume they can
 *   bypass this by reading raw agent state.
 * - `null` (or the literal sentinel `'disabled'` after caller-side
 *   translation) disables the schedule. Any other value MUST be a valid
 *   cron expression accepted by the runtime; the adapter does not
 *   validate cron grammar — that responsibility stays with the runtime
 *   timer reload step.
 */
export interface AgentScheduleSnapshot {
  /**
   * Active cron expression, or the literal `'disabled'` when no
   * tenant-owned schedule is set for this agent type.
   */
  schedule: string;
}

export interface AgentScheduleControlPort {
  /**
   * Read the current schedule for the tenant's instance of `agentType`.
   * Returns `'disabled'` when the resolved definition is not
   * tenant-owned (e.g. the global catalog template) — the tenant simply
   * has not opted into a schedule.
   */
  getSchedule(agentType: string, organizationId: string): Promise<AgentScheduleSnapshot>;

  /**
   * Set the schedule on the tenant-owned definition of `agentType`.
   * Pass `null` to disable. The adapter resyncs heartbeat timers after
   * a successful write.
   *
   * @throws TenantOwnedAgentRequiredError when no tenant-owned
   *   definition exists for `agentType`.
   */
  setSchedule(
    agentType: string,
    organizationId: string,
    schedule: string | null,
  ): Promise<AgentScheduleSnapshot>;
}

/**
 * Domain error raised when a schedule mutation is attempted against an
 * agent definition that is not owned by the caller's tenant. Incoming
 * adapters (HTTP controllers, etc.) translate this into the protocol's
 * client-error response (`BadRequestException` over HTTP).
 */
export class TenantOwnedAgentRequiredError extends Error {
  readonly code = 'tenant_owned_agent_required';

  constructor(public readonly agentType: string) {
    super(
      `Tenant-owned '${agentType}' agent definition is required for schedule control`,
    );
    this.name = 'TenantOwnedAgentRequiredError';
  }
}

export const AGENT_SCHEDULE_CONTROL_PORT = Symbol('AgentScheduleControlPort');
