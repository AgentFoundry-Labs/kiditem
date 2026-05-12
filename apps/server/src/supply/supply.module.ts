// apps/server/src/supply/supply.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Supply owns supplier registry, master-supplier policy, and purchase-order
 * procurement. Extracted from sourcing/ during Track A PR 1 (issue #192
 * follow-up).
 *
 * Suppliers are organization-private. supplier-payments stays in finance/;
 * supplier-stats stays in analytics/.
 */
@Module({
  imports: [PrismaModule],
  controllers: [],
  providers: [],
})
export class SupplyModule {}
