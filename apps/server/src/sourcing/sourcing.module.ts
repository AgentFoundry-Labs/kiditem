import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentOsModule } from '../agent-os/agent-os.module';
import { AiModule } from '../ai/ai.module';
import { AutomationModule } from '../automation/automation.module';
import { ProductsModule } from '../products/products.module';

import { SourcingCandidateWorkspaceController } from './adapter/in/http/sourcing-candidate-workspace.controller';
import { SourcingExtensionIngestController } from './adapter/in/http/sourcing-extension-ingest.controller';
import { SourcingService } from './application/service/sourcing.service';
import { SourcingPromotionService } from './application/service/sourcing-promotion.service';
import { SourcingWorkspaceArchiveService } from './application/service/sourcing-workspace-archive.service';
import { ProductPreparationSelectionService } from './application/service/product-preparation-selection.service';
import { SourcingScrapeFinalizedBridge } from './application/service/sourcing-scrape-finalized.bridge';

import { SourcingAgentGatewayAdapter } from './adapter/out/agent/sourcing-agent.gateway.adapter';
import { SourcingAiWorkspaceArchiveAdapter } from './adapter/out/ai/workspace-archive.adapter';
import { SourcingOperationAlertAdapter } from './adapter/out/automation/operation-alert.adapter';
import { SourcingProductsCatalogAdapter } from './adapter/out/products/products-catalog.adapter';
import { SourcingCandidateRepositoryAdapter } from './adapter/out/repository/sourcing-candidate.repository.adapter';
import { SourcingPlaywrightRuntimeHandler } from './adapter/out/runtime/sourcing-playwright-runtime.handler';
import { SOURCING_AGENT_GATEWAY_PORT } from './application/port/out/runtime/sourcing-agent.gateway.port';
import { SOURCING_AI_WORKSPACE_ARCHIVE_PORT } from './application/port/out/cross-domain/ai-workspace-archive.port';
import { SOURCING_OPERATION_ALERT_PORT } from './application/port/out/cross-domain/operation-alert.port';
import { SOURCING_PRODUCTS_CATALOG_PORT } from './application/port/out/cross-domain/products-catalog.port';
import { SOURCING_CANDIDATE_REPOSITORY_PORT } from './application/port/out/repository/sourcing-candidate.repository.port';

/**
 * Sourcing is the canonical owner root for sourced-product discovery and the
 * candidate→master promotion handoff.
 *
 * Capabilities folded under this module:
 *   - sourcing extension ingest + scrape (Agent OS delegated) — `/api/sourcing/*`
 *   - candidate promotion/rejection — `/api/sourcing/candidates/:id/{promote,reject}`
 *
 * Supplier registry and purchase-order procurement live in `supply/` (extracted
 * during issue #192 follow-up Track A PR 1). `supplier-payments` is a finance
 * capability.
 *
 * Agent delegation goes through `AGENT_RUNNER_PORT` (exported by
 * `AgentOsModule`). `SourcingAgentGatewayAdapter` is the only seam that calls
 * the runner; `SourcingService` consumes `SOURCING_AGENT_GATEWAY_PORT`.
 *
 * Sourcing ingest writes `SourcingCandidate` + `CandidateImage` rows via
 * `SOURCING_CANDIDATE_REPOSITORY_PORT`. Candidate→Master promotion fires
 * `SOURCING_AGENT_GATEWAY_PORT.notifyPromoted` which delegates to the AI
 * domain's `POST_PROMOTION_AI_TRIGGER_PORT` (exported by `AiModule`).
 */
@Module({
  imports: [PrismaModule, AgentOsModule, AiModule, AutomationModule, ProductsModule],
  controllers: [
    SourcingExtensionIngestController,
    SourcingCandidateWorkspaceController,
  ],
  providers: [
    SourcingService,
    SourcingPromotionService,
    SourcingWorkspaceArchiveService,
    ProductPreparationSelectionService,
    SourcingScrapeFinalizedBridge,
    SourcingAgentGatewayAdapter,
    SourcingAiWorkspaceArchiveAdapter,
    SourcingOperationAlertAdapter,
    SourcingProductsCatalogAdapter,
    SourcingCandidateRepositoryAdapter,
    SourcingPlaywrightRuntimeHandler,
    {
      provide: SOURCING_AGENT_GATEWAY_PORT,
      useExisting: SourcingAgentGatewayAdapter,
    },
    {
      provide: SOURCING_OPERATION_ALERT_PORT,
      useExisting: SourcingOperationAlertAdapter,
    },
    {
      provide: SOURCING_AI_WORKSPACE_ARCHIVE_PORT,
      useExisting: SourcingAiWorkspaceArchiveAdapter,
    },
    {
      provide: SOURCING_PRODUCTS_CATALOG_PORT,
      useExisting: SourcingProductsCatalogAdapter,
    },
    {
      provide: SOURCING_CANDIDATE_REPOSITORY_PORT,
      useExisting: SourcingCandidateRepositoryAdapter,
    },
  ],
})
export class SourcingModule {}
