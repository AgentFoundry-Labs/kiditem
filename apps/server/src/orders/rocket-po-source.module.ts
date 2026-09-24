import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AlertsModule } from '../alerts/alerts.module';
import { ChannelCatalogModule } from '../channels/channel-catalog.module';
import { RocketPoCatalogService } from './application/service/rocket-po-catalog.service';
import { RocketPoCatalogRepositoryAdapter } from './adapter/out/repository/rocket-po-catalog.repository.adapter';
import { RocketPoSourceController } from './adapter/in/web/rocket-po-source.controller';
import { ROCKET_PO_CATALOG_PORT } from './application/port/in/rocket-po-catalog.port';
import { ROCKET_PO_CATALOG_REPOSITORY_PORT } from './application/port/out/repository/rocket-po-catalog.repository.port';

/** Orders owns the complete PO source; Channels publishes only marketplace identities in that transaction. */
@Module({
  imports: [PrismaModule, AlertsModule, ChannelCatalogModule],
  controllers: [RocketPoSourceController],
  providers: [RocketPoCatalogService, RocketPoCatalogRepositoryAdapter,
    { provide: ROCKET_PO_CATALOG_PORT, useExisting: RocketPoCatalogService },
    { provide: ROCKET_PO_CATALOG_REPOSITORY_PORT, useExisting: RocketPoCatalogRepositoryAdapter },
  ],
  exports: [ROCKET_PO_CATALOG_PORT],
})
export class RocketPoSourceModule {}
