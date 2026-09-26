import { Module, type Provider } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductCollectionRuntimeModule } from './product-collection-runtime.module';
import { ProductCollectionStatusController } from './adapter/in/web/product-collection-status.controller';
import { ProductSourceSnapshotController } from './adapter/in/web/product-source-snapshot.controller';
import { SellpiaInventoryOperationOwner } from './adapter/in/operation/sellpia-inventory-operation-owner';
import { ProductCollectionFreshnessRepositoryAdapter } from './adapter/out/persistence/product-source-freshness.repository.adapter';
import { ProductSourcePublicationRepositoryAdapter } from './adapter/out/persistence/product-source-publication.repository.adapter';
import { ProductSourceSnapshotRepositoryAdapter } from './adapter/out/persistence/product-source-snapshot.repository.adapter';
import { ProductSourceSnapshotUseCase } from './application/service/product-source-snapshot.usecase';
import { ProductExportUseCase } from './application/service/product-export.usecase';
import { ProductCollectionFreshnessUseCase } from './application/service/product-collection-freshness.usecase';
import { SellpiaInventoryPublicationUseCase } from './application/service/sellpia-inventory-publication.usecase';
import { SELLPIA_INVENTORY_PUBLICATION_PORT } from './application/port/in/sellpia-inventory-publication.port';
import { SELLPIA_SOURCE_ACCOUNT_PORT } from './application/port/in/sellpia-source-account.port';
import { PRODUCT_COLLECTION_FRESHNESS_REPOSITORY_PORT } from './application/port/out/persistence/product-source-freshness.repository.port';
import { PRODUCT_SOURCE_SNAPSHOT_PORT } from './application/port/in/product-source-snapshot.port';
import { PRODUCT_EXPORT_PORT } from './application/port/in/product-export.port';
import { PRODUCT_SOURCE_PUBLICATION_REPOSITORY_PORT } from './application/port/out/persistence/product-source-publication.repository.port';
import { PRODUCT_SOURCE_SNAPSHOT_REPOSITORY_PORT } from './application/port/out/persistence/product-source-snapshot.repository.port';
import {
  SELLPIA_PAYLOAD_DECODER_PORT,
} from './application/port/out/source/sellpia-payload-decoder.port';
import { SellpiaPayloadDecoderAdapter } from './adapter/out/sellpia/sellpia-payload-decoder.adapter';
import { SellpiaPayloadValidator } from './adapter/out/sellpia/sellpia-payload.validator';
import { ProductSourceXlsxExporterAdapter } from './adapter/out/documents/product-source-xlsx-exporter.adapter';
import { PRODUCT_SOURCE_EXPORT_RENDERER_PORT } from './application/port/out/documents/product-source-export-renderer.port';

/**
 * 셀피아 재고 실행 kind(`products.sellpia_inventory`)의 발행 조립 — 스냅샷 복호화와 finish 트랜잭션 안 발행.
 * PG 스펙이 같은 조립으로 owner를 돌린다(계정 연결 확인은 런타임 모듈의 `SELLPIA_SOURCE_ACCOUNT_PORT`).
 */
export const sellpiaInventoryPublicationProviders: Provider[] = [
  ProductSourcePublicationRepositoryAdapter,
  SellpiaPayloadValidator,
  SellpiaPayloadDecoderAdapter,
  SellpiaInventoryPublicationUseCase,
  { provide: PRODUCT_SOURCE_PUBLICATION_REPOSITORY_PORT, useExisting: ProductSourcePublicationRepositoryAdapter },
  { provide: SELLPIA_PAYLOAD_DECODER_PORT, useExisting: SellpiaPayloadDecoderAdapter },
  { provide: SELLPIA_INVENTORY_PUBLICATION_PORT, useExisting: SellpiaInventoryPublicationUseCase },
];

/** 시험 앱용: 발행 조립 + 계정 연결 확인(런타임 모듈 없이). */
export const sellpiaInventoryOperationProviders: Provider[] = [
  ...sellpiaInventoryPublicationProviders,
  ProductCollectionFreshnessRepositoryAdapter,
  ProductCollectionFreshnessUseCase,
  { provide: PRODUCT_COLLECTION_FRESHNESS_REPOSITORY_PORT, useExisting: ProductCollectionFreshnessRepositoryAdapter },
  { provide: SELLPIA_SOURCE_ACCOUNT_PORT, useExisting: ProductCollectionFreshnessUseCase },
];

/** Products-owned source collection, snapshot, freshness and export surface. */
@Module({
  imports: [ProductCollectionRuntimeModule, PrismaModule],
  controllers: [
    ProductCollectionStatusController,
    ProductSourceSnapshotController,
  ],
  providers: [
    ...sellpiaInventoryPublicationProviders,
    SellpiaInventoryOperationOwner,
    ProductSourceSnapshotRepositoryAdapter,
    ProductSourceSnapshotUseCase,
    ProductExportUseCase,
    ProductSourceXlsxExporterAdapter,
    {
      provide: PRODUCT_SOURCE_SNAPSHOT_REPOSITORY_PORT,
      useExisting: ProductSourceSnapshotRepositoryAdapter,
    },
    {
      provide: PRODUCT_SOURCE_EXPORT_RENDERER_PORT,
      useExisting: ProductSourceXlsxExporterAdapter,
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
    PRODUCT_SOURCE_SNAPSHOT_PORT,
    PRODUCT_EXPORT_PORT,
    ProductCollectionRuntimeModule,
  ],
})
export class ProductSourceModule {}
