import { Module } from '@nestjs/common';
import { AGENT_SCHEDULE_CONTROL_PORT } from './application/port/in/agent-schedule-control.port';
import { AgentRuntimeScheduleControlAdapter } from './adapter/out/agent-runtime/agent-schedule-control.adapter';
import { MarketplaceInstallService } from './application/service/marketplace-install.service';
import { MarketplaceController } from './adapter/in/http/marketplace.controller';
import { MarketplaceModule } from '../marketplace/marketplace.module';

/**
 * `automation/` is the owner-domain home of the Agent OS / Automation
 * runtime per `apps/server/AGENTS.md` Domain Topology Target. Inbound
 * adapters (HTTP controllers under `adapter/in/http/`) and outbound
 * adapters to the agent runtime (under `adapter/out/agent-runtime/`)
 * live here, with use-case ports and application services under
 * `application/`.
 *
 * Registered surfaces (in chronological landing order):
 * - Phase 3C-2: `AgentScheduleControlPort` + `AgentRuntimeScheduleControlAdapter`
 *   — used by `RulesController` for `rules_evaluation` schedule control.
 * - Phase 3C-3: `MarketplaceInstallService` (install/uninstall side
 *   effects) + `MarketplaceController` HTTP adapter. Catalog read still
 *   lives behind `MarketplaceService` (imported via `MarketplaceModule`)
 *   to keep simple read paths out of the application boundary.
 */
@Module({
  imports: [MarketplaceModule],
  controllers: [MarketplaceController],
  providers: [
    {
      provide: AGENT_SCHEDULE_CONTROL_PORT,
      useClass: AgentRuntimeScheduleControlAdapter,
    },
    MarketplaceInstallService,
  ],
  exports: [AGENT_SCHEDULE_CONTROL_PORT],
})
export class AutomationModule {}
