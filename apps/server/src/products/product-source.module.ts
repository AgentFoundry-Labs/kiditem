import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductCollectionRuntimeModule } from './product-collection-runtime.module';
import { ProductCollectionStatusController } from './adapter/in/web/product-collection-status.controller';
import { ProductSourceSnapshotController } from './adapter/in/web/product-source-snapshot.controller';
import { SellpiaCollectionController } from './adapter/in/web/sellpia-collection.controller';
import { ProductSourceCollectionRepositoryAdapter } from './adapter/out/persistence/product-source-collection.repository.adapter';
import { ProductSourcePublicationRepositoryAdapter } from './adapter/out/persistence/product-source-publication.repository.adapter';
import { ProductSourceSnapshotRepositoryAdapter } from './adapter/out/persistence/product-source-snapshot.repository.adapter';
import { ProductSourceSnapshotUseCase } from './application/service/product-source-snapshot.usecase';
import { ProductExportUseCase } from './application/service/product-export.usecase';
import { SellpiaCollectionUseCase } from './application/service/sellpia-collection.usecase';
import { SELLPIA_COLLECTION_PORT } from './application/port/in/sellpia-collection.port';
import { PRODUCT_SOURCE_SNAPSHOT_PORT } from './application/port/in/product-source-snapshot.port';
import { PRODUCT_EXPORT_PORT } from './application/port/in/product-export.port';
import { PRODUCT_SOURCE_COLLECTION_REPOSITORY_PORT } from './application/port/out/persistence/product-source-collection.repository.port';
import { PRODUCT_SOURCE_PUBLICATION_REPOSITORY_PORT } from './application/port/out/persistence/product-source-publication.repository.port';
import { PRODUCT_SOURCE_SNAPSHOT_REPOSITORY_PORT } from './application/port/out/persistence/product-source-snapshot.repository.port';
import {
  SELLPIA_PAYLOAD_DECODER_PORT,
} from './application/port/out/source/sellpia-payload-decoder.port';
import { SellpiaPayloadDecoderAdapter } from './adapter/out/sellpia/sellpia-payload-decoder.adapter';
import { SellpiaPayloadValidator } from './adapter/out/sellpia/sellpia-payload.validator';
import { ProductSourceXlsxExporterAdapter } from './adapter/out/documents/product-source-xlsx-exporter.adapter';
import { PRODUCT_SOURCE_EXPORT_RENDERER_PORT } from './application/port/out/documents/product-source-export-renderer.port';

/** Products-owned source collection, snapshot, freshness and export surface. */
@Module({
  imports: [ProductCollectionRuntimeModule, AlertsModule, PrismaModule],
  controllers: [
    SellpiaCollectionController,
    ProductCollectionStatusController,
    ProductSourceSnapshotController,
  ],
  providers: [
    ProductSourceCollectionRepositoryAdapter,
    ProductSourcePublicationRepositoryAdapter,
    ProductSourceSnapshotRepositoryAdapter,
    SellpiaPayloadValidator,
    SellpiaPayloadDecoderAdapter,
    SellpiaCollectionUseCase,
    ProductSourceSnapshotUseCase,
    ProductExportUseCase,
    ProductSourceXlsxExporterAdapter,
    {
      provide: PRODUCT_SOURCE_COLLECTION_REPOSITORY_PORT,
      useExisting: ProductSourceCollectionRepositoryAdapter,
    },
    {
      provide: PRODUCT_SOURCE_PUBLICATION_REPOSITORY_PORT,
      useExisting: ProductSourcePublicationRepositoryAdapter,
    },
    {
      provide: PRODUCT_SOURCE_SNAPSHOT_REPOSITORY_PORT,
      useExisting: ProductSourceSnapshotRepositoryAdapter,
    },
    {
      provide: SELLPIA_PAYLOAD_DECODER_PORT,
      useExisting: SellpiaPayloadDecoderAdapter,
    },
    {
      provide: PRODUCT_SOURCE_EXPORT_RENDERER_PORT,
      useExisting: ProductSourceXlsxExporterAdapter,
    },
    {
      provide: SELLPIA_COLLECTION_PORT,
      useExisting: SellpiaCollectionUseCase,
    },
    {
      provide: PRODUCT_SOURCE_SNAPSHOT_PORT,
      useExisting: ProductSourceSnapshotUseCase,
    },
    {
      provide: PRODUCT_EXPORT_PORT,
      useExisting: ProductExportUseCase,
    },
  ],
  exports: [
    SELLPIA_COLLECTION_PORT,
    PRODUCT_SOURCE_SNAPSHOT_PORT,
    PRODUCT_EXPORT_PORT,
    ProductCollectionRuntimeModule,
  ],
})
export class ProductSourceModule {}
