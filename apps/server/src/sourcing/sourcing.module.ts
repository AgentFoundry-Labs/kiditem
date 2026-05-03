import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentRegistryModule } from '../agent-registry/agent-registry.module';
import { ProductsModule } from '../products/products.module';

import { SourcingController } from './adapter/in/http/sourcing.controller';
import { ProcurementController } from './adapter/in/http/procurement.controller';
import { SuppliersController } from './adapter/in/http/suppliers.controller';

import { SourcingService } from './application/service/sourcing.service';
import { ProcurementService } from './application/service/procurement.service';
import { SuppliersService } from './application/service/suppliers.service';

import { SourcingAgentGatewayAdapter } from './adapter/out/agent/sourcing-agent.gateway.adapter';
import { SOURCING_AGENT_GATEWAY_PORT } from './application/port/out/sourcing-agent.gateway.port';

/**
 * Sourcing is the canonical owner root for sourcing / procurement / suppliers.
 * Capabilities folded under this module:
 *   - sourcing extension ingest + scrape (Agent OS delegated) — `/api/sourcing/*`
 *   - purchase orders state machine — `/api/purchase-orders/*`
 *   - supplier CRUD (transitional flat) — `/api/suppliers/*`
 *
 * `supplier-payments` is a finance capability and stays out of this module.
 */
@Module({
  imports: [PrismaModule, AgentRegistryModule, ProductsModule],
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
    {
      provide: SOURCING_AGENT_GATEWAY_PORT,
      useExisting: SourcingAgentGatewayAdapter,
    },
  ],
})
export class SourcingModule {}
