import { Module } from '@nestjs/common';
import { AGENT_SCHEDULE_CONTROL_PORT } from './application/port/in/agent-schedule-control.port';
import { AgentRuntimeScheduleControlAdapter } from './adapter/out/agent-runtime/agent-schedule-control.adapter';

/**
 * `automation/` is the owner-domain home of the Agent OS / Automation
 * runtime per `apps/server/AGENTS.md` Domain Topology Target. This is
 * the first surface to physically land here (Phase 3C-2 of
 * `docs/superpowers/plans/2026-04-29-automation-agent-os-hard-delete.md`):
 * it exposes inbound use-case ports that other domains call into,
 * keeping incoming adapters (HTTP controllers in `rules/`, etc.) free
 * of direct `AgentRegistryService` / `HeartbeatService` injection.
 *
 * `AgentRegistryModule` is `@Global()` so the out-adapter does not need
 * to import it explicitly; consumers of this module only see the port
 * tokens.
 */
@Module({
  providers: [
    {
      provide: AGENT_SCHEDULE_CONTROL_PORT,
      useClass: AgentRuntimeScheduleControlAdapter,
    },
  ],
  exports: [AGENT_SCHEDULE_CONTROL_PORT],
})
export class AutomationModule {}
