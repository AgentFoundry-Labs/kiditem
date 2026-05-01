import { Injectable } from '@nestjs/common';
import { AgentRegistryService } from '../../../../agent-registry/agent-registry.service';
import { HeartbeatService } from '../../../../agent-registry/heartbeat/heartbeat.service';
import {
  AgentScheduleControlPort,
  AgentScheduleSnapshot,
  TenantOwnedAgentRequiredError,
} from '../../../application/port/in/agent-schedule-control.port';

/**
 * Out-adapter that fulfils `AgentScheduleControlPort` against the live
 * Agent OS runtime: it persists the schedule on the tenant-owned
 * `AgentDefinition` row via `AgentRegistryService.update` and triggers
 * `HeartbeatService.syncTimers` so the cron timers reflect the new
 * value immediately.
 *
 * Tenant-isolation contract:
 * - `findByType` resolves the catalog row by unique `type`; that row
 *   may be a global template (`organizationId = null`) shared across
 *   tenants.
 * - For both reads and writes, this adapter compares
 *   `agent.organizationId === organizationId`. A non-tenant-owned row is treated
 *   as "no schedule for this tenant" on read, and as a hard rejection
 *   on write. This mirrors the rule documented in
 *   `apps/server/src/rules/AGENTS.md`: tenants must not mutate the
 *   global catalog row from the schedule UI.
 */
@Injectable()
export class AgentRuntimeScheduleControlAdapter
  implements AgentScheduleControlPort
{
  constructor(
    private readonly agentRegistry: AgentRegistryService,
    private readonly heartbeat: HeartbeatService,
  ) {}

  async getSchedule(
    agentType: string,
    organizationId: string,
  ): Promise<AgentScheduleSnapshot> {
    const agent = await this.agentRegistry.findByType(agentType);
    if (agent.organizationId !== organizationId) {
      return { schedule: 'disabled' };
    }
    return { schedule: agent.schedule ?? 'disabled' };
  }

  async setSchedule(
    agentType: string,
    organizationId: string,
    schedule: string | null,
  ): Promise<AgentScheduleSnapshot> {
    const agent = await this.agentRegistry.findByType(agentType);
    if (agent.organizationId !== organizationId) {
      throw new TenantOwnedAgentRequiredError(agentType);
    }
    await this.agentRegistry.update(agent.id, organizationId, { schedule });
    await this.heartbeat.syncTimers();
    return { schedule: schedule ?? 'disabled' };
  }
}
