import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentOsModule } from '../agent-os/agent-os.module';
import { AutomationModule } from '../automation/automation.module';
import { ProductsModule } from '../products/products.module';

import { SourcingController } from './adapter/in/http/sourcing.controller';
import { ProcurementController } from './adapter/in/http/procurement.controller';
import { SuppliersController } from './adapter/in/http/suppliers.controller';

import { SourcingService } from './application/service/sourcing.service';
import { ProcurementService } from './application/service/procurement.service';
import { SuppliersService } from './application/service/suppliers.service';

import { SourcingAgentGatewayAdapter } from './adapter/out/agent/sourcing-agent.gateway.adapter';
import { SourcingProductsCatalogAdapter } from './adapter/out/products/products-catalog.adapter';
import { SOURCING_AGENT_GATEWAY_PORT } from './application/port/out/sourcing-agent.gateway.port';
import { SOURCING_PRODUCTS_CATALOG_PORT } from './application/port/out/products-catalog.port';

/**
 * Sourcing is the canonical owner root for sourcing / procurement / suppliers.
 * Capabilities folded under this module:
 *   - sourcing extension ingest + scrape (Agent OS v2 delegated) — `/api/sourcing/*`
 *   - purchase orders state machine — `/api/purchase-orders/*`
 *   - supplier CRUD (transitional flat) — `/api/suppliers/*`
 *
 * Agent delegation goes through `AGENT_RUNNER_PORT` (exported by
 * `AgentOsModule`). `SourcingAgentGatewayAdapter` is the only seam that calls
 * the runner; `SourcingService` consumes `SOURCING_AGENT_GATEWAY_PORT`.
 *
 * `supplier-payments` is a finance capability and stays out of this module.
 */
@Module({
  imports: [PrismaModule, AgentOsModule, AutomationModule, ProductsModule],
  controllers: [
    SourcingController,
    ProcurementController,
    SuppliersController,
  ],
  providers: [
    SourcingService,
    ProcurementService,
    SuppliersService,
    SourcingAgentGatewayAdapter,
    SourcingProductsCatalogAdapter,
    {
      provide: SOURCING_AGENT_GATEWAY_PORT,
      useExisting: SourcingAgentGatewayAdapter,
    },
    {
      provide: SOURCING_PRODUCTS_CATALOG_PORT,
      useExisting: SourcingProductsCatalogAdapter,
    },
  ],
})
export class SourcingModule {}
