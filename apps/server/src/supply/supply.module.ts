import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';

import { SuppliersController } from './adapter/in/http/suppliers.controller';
import { SuppliersService } from './application/service/suppliers.service';

/**
 * Supply owns supplier registry, master-supplier policy, and purchase-order
 * procurement. Extracted from sourcing/ during Track A PR 1 (issue #192
 * follow-up). Suppliers are organization-private. supplier-payments stays in
 * finance/; supplier-stats stays in analytics/.
 */
@Module({
  imports: [PrismaModule],
  controllers: [SuppliersController],
  providers: [SuppliersService],
})
export class SupplyModule {}
