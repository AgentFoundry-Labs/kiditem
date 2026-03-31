import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { InventoryModule } from './inventory/inventory.module';
import { CompaniesModule } from './companies/companies.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SourcingModule } from './sourcing/sourcing.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { ActivityEventsModule } from './activity-events/activity-events.module';
import { CoupangModule } from './coupang/coupang.module';
import { AiModule } from './ai/ai.module';
import { FinanceModule } from './finance/finance.module';
import { RulesModule } from './rules/rules.module';
import { AgentRegistryModule } from './agent-registry/agent-registry.module';
import { OntologyModule } from './ontology/ontology.module';
import { MarketplaceModule } from './marketplace/marketplace.module';

@Module({
  imports: [
    PrismaModule,
    ProductsModule,
    OrdersModule,
    InventoryModule,
    CompaniesModule,
    DashboardModule,
    SourcingModule,
    WorkflowsModule,
    ActivityEventsModule,
    CoupangModule,
    AiModule,
    FinanceModule,
    RulesModule,
    AgentRegistryModule,
    OntologyModule,
    MarketplaceModule,
  ],
})
export class AppModule {}
