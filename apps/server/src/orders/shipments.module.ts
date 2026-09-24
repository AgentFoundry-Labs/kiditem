import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CoupangShipmentsController } from './adapter/in/web/shipments/coupang-shipments.controller';
import { CoupangShipmentDateSummaryRepositoryAdapter } from './adapter/out/persistence/shipments/coupang-shipment-date-summary.repository.adapter';
import { LocalCoupangShipmentFilesAdapter } from './adapter/out/storage/shipments/local-coupang-shipment-files.adapter';
import { COUPANG_SHIPMENTS_PORT } from './application/port/in/shipments/coupang-shipments.port';
import { COUPANG_SHIPMENT_DATE_SUMMARY_REPOSITORY_PORT } from './application/port/out/persistence/shipments/coupang-shipment-date-summary.repository.port';
import { COUPANG_SHIPMENT_FILE_STORAGE_PORT } from './application/port/out/storage/shipments/coupang-shipment-file-storage.port';
import { CoupangShipmentsService } from './application/service/shipments/coupang-shipments.service';

@Module({
  imports: [AlertsModule, PrismaModule],
  controllers: [CoupangShipmentsController],
  providers: [
    CoupangShipmentsService,
    CoupangShipmentDateSummaryRepositoryAdapter,
    LocalCoupangShipmentFilesAdapter,
    { provide: COUPANG_SHIPMENTS_PORT, useExisting: CoupangShipmentsService },
    { provide: COUPANG_SHIPMENT_DATE_SUMMARY_REPOSITORY_PORT, useExisting: CoupangShipmentDateSummaryRepositoryAdapter },
    { provide: COUPANG_SHIPMENT_FILE_STORAGE_PORT, useExisting: LocalCoupangShipmentFilesAdapter },
  ],
})
export class ShipmentsModule {}
