import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductCollectionRuntimeModule } from '../products/product-collection-runtime.module';
import { TransfersController } from './adapter/in/web/transfers.controller';
import { WarehousesController } from './adapter/in/web/warehouses.controller';
import { RocketWorkbookProgressRepositoryAdapter } from './adapter/out/persistence/rocket-workbook-progress.repository.adapter';
import { TransfersRepositoryAdapter } from './adapter/out/persistence/transfers.repository.adapter';
import { WarehousesRepositoryAdapter } from './adapter/out/persistence/warehouses.repository.adapter';
import { ROCKET_WORKBOOK_PROGRESS_PORT } from './application/port/in/stock/rocket-workbook-progress.port';
import { TRANSFERS_PORT, WAREHOUSES_PORT } from './application/port/in/warehouse';
import { ROCKET_WORKBOOK_PROGRESS_REPOSITORY_PORT } from './application/port/out/persistence/rocket-workbook-progress.repository.port';
import { TRANSFERS_REPOSITORY_PORT } from './application/port/out/persistence/transfers.repository.port';
import { WAREHOUSES_REPOSITORY_PORT } from './application/port/out/persistence/warehouses.repository.port';
import { RocketWorkbookProgressService } from './application/usecase/rocket-workbook-progress.service';
import { TransfersService } from './application/usecase/transfers.service';
import { WarehousesService } from './application/usecase/warehouses.service';

@Module({
  imports: [PrismaModule, ProductCollectionRuntimeModule],
  controllers: [WarehousesController, TransfersController],
  providers: [
    RocketWorkbookProgressRepositoryAdapter, WarehousesRepositoryAdapter, TransfersRepositoryAdapter,
    RocketWorkbookProgressService, WarehousesService, TransfersService,
    { provide: ROCKET_WORKBOOK_PROGRESS_REPOSITORY_PORT, useExisting: RocketWorkbookProgressRepositoryAdapter },
    { provide: TRANSFERS_REPOSITORY_PORT, useExisting: TransfersRepositoryAdapter },
    { provide: WAREHOUSES_REPOSITORY_PORT, useExisting: WarehousesRepositoryAdapter },
    { provide: ROCKET_WORKBOOK_PROGRESS_PORT, useExisting: RocketWorkbookProgressService },
    { provide: TRANSFERS_PORT, useExisting: TransfersService },
    { provide: WAREHOUSES_PORT, useExisting: WarehousesService },
  ],
  exports: [ROCKET_WORKBOOK_PROGRESS_PORT],
})
export class InventoryModule {}
