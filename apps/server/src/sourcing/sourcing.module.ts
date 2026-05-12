import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentOsModule } from '../agent-os/agent-os.module';
import { AiModule } from '../ai/ai.module';
import { AutomationModule } from '../automation/automation.module';
import { ProductsModule } from '../products/products.module';

import { SourcingController } from './adapter/in/http/sourcing.controller';
import { ProcurementController } from './adapter/in/http/procurement.controller';
import { SourcingService } from './application/service/sourcing.service';
import { SourcingPromotionService } from './application/service/sourcing-promotion.service';
import { ProcurementService } from './application/service/procurement.service';

import { SourcingAgentGatewayAdapter } from './adapter/out/agent/sourcing-agent.gateway.adapter';
import { SourcingProductsCatalogAdapter } from './adapter/out/products/products-catalog.adapter';
import { SourcingCandidateRepositoryAdapter } from './adapter/out/repository/sourcing-candidate.repository.adapter';
import { SOURCING_AGENT_GATEWAY_PORT } from './application/port/out/sourcing-agent.gateway.port';
import { SOURCING_PRODUCTS_CATALOG_PORT } from './application/port/out/products-catalog.port';
import { SOURCING_CANDIDATE_REPOSITORY_PORT } from './application/port/out/sourcing-candidate.repository.port';

/**
 * Sourcing is the canonical owner root for sourcing / procurement / suppliers.
 * Capabilities folded under this module:
 *   - sourcing extension ingest + scrape (Agent OS delegated) — `/api/sourcing/*`
 *   - purchase orders state machine — `/api/purchase-orders/*`
 *   - supplier CRUD (transitional flat) — `/api/suppliers/*`
 *
 * Agent delegation goes through `AGENT_RUNNER_PORT` (exported by
 * `AgentOsModule`). `SourcingAgentGatewayAdapter` is the only seam that calls
 * the runner; `SourcingService` consumes `SOURCING_AGENT_GATEWAY_PORT`.
 *
 * Sourcing ingest writes `SourcingCandidate` + `CandidateImage` rows via
 * `SOURCING_CANDIDATE_REPOSITORY_PORT`. Candidate→Master promotion (Task 3)
 * fires `SOURCING_AGENT_GATEWAY_PORT.notifyPromoted` which delegates to the
 * AI domain's `POST_PROMOTION_AI_TRIGGER_PORT` (exported by `AiModule`).
 *
 * `supplier-payments` is a finance capability and stays out of this module.
 */
@Module({
  imports: [PrismaModule, AgentOsModule, AiModule, AutomationModule, ProductsModule],
  controllers: [
    SourcingController,
    ProcurementController,
  ],
  providers: [
    SourcingService,
    SourcingPromotionService,
    ProcurementService,
    SourcingAgentGatewayAdapter,
    SourcingProductsCatalogAdapter,
    SourcingCandidateRepositoryAdapter,
    {
      provide: SOURCING_AGENT_GATEWAY_PORT,
      useExisting: SourcingAgentGatewayAdapter,
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
