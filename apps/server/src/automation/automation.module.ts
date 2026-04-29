import { Module } from '@nestjs/common';
import { AGENT_SCHEDULE_CONTROL_PORT } from './application/port/in/agent-schedule-control.port';
import { AgentRuntimeScheduleControlAdapter } from './adapter/out/agent-runtime/agent-schedule-control.adapter';
import { MarketplaceInstallService } from './application/service/marketplace-install.service';
import { MarketplaceController } from './adapter/in/http/marketplace.controller';
import { PanelController } from './adapter/in/http/panel.controller';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { PrismaMarketplaceInstallStoreAdapter } from './adapter/out/prisma/marketplace-install-store.adapter';
import { MARKETPLACE_INSTALL_STORE_PORT } from './application/port/out/marketplace-install-store.port';
import { PanelService } from './adapter/out/panel-event/panel.service';
import { PanelSseService } from './adapter/out/panel-event/panel-sse.service';

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
 * - Phase 3C-3: `MarketplaceInstallService` (install/uninstall
 *   orchestration) + `PrismaMarketplaceInstallStoreAdapter` (tenant-scoped
 *   persistence) + `MarketplaceController` HTTP adapter. Catalog read still
 *   lives behind `MarketplaceService` (imported via `MarketplaceModule`) to
 *   keep simple read paths out of the application boundary.
 * - Phase 3C-4: `PanelController` HTTP adapter + `PanelService` /
 *   `PanelSseService` outgoing panel-event adapter. Panel remains a
 *   read-only projection over workflow / agent / image / alert sources.
 */
@Module({
  imports: [MarketplaceModule],
  controllers: [MarketplaceController, PanelController],
  providers: [
    {
      provide: AGENT_SCHEDULE_CONTROL_PORT,
      useClass: AgentRuntimeScheduleControlAdapter,
    },
    {
      provide: MARKETPLACE_INSTALL_STORE_PORT,
      useClass: PrismaMarketplaceInstallStoreAdapter,
    },
    MarketplaceInstallService,
    PanelService,
    PanelSseService,
  ],
  exports: [AGENT_SCHEDULE_CONTROL_PORT, PanelSseService],
})
export class AutomationModule {}
