import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ChannelCatalogModule } from '../channels/channel-catalog.module';
import { RocketPoCatalogService } from './application/service/rocket-po-catalog.service';
import { RocketPoCatalogRepositoryAdapter } from './adapter/out/repository/rocket-po-catalog.repository.adapter';
import { CoupangRocketPoOperationOwner } from './adapter/in/operation/coupang-rocket-po-operation-owner';
import { ROCKET_PO_CATALOG_PORT } from './application/port/in/rocket-po-catalog.port';
import { ROCKET_PO_CATALOG_REPOSITORY_PORT } from './application/port/out/repository/rocket-po-catalog.repository.port';

/**
 * Orders owns the complete PO source (operation kind `orders.coupang_rocket_po`, KID-359); Channels publishes only
 * marketplace identities in the finish transaction.
 */
@Module({
  imports: [PrismaModule, ChannelCatalogModule],
  providers: [RocketPoCatalogService, RocketPoCatalogRepositoryAdapter, CoupangRocketPoOperationOwner,
    { provide: ROCKET_PO_CATALOG_PORT, useExisting: RocketPoCatalogService },
    { provide: ROCKET_PO_CATALOG_REPOSITORY_PORT, useExisting: RocketPoCatalogRepositoryAdapter },
  ],
  exports: [ROCKET_PO_CATALOG_PORT],
})
export class RocketPoSourceModule {}
