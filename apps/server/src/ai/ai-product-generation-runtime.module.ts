import { Module } from '@nestjs/common';
import { StorageModule } from '../common/storage/storage.module';
import { StorageService } from '../common/storage/storage.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ThumbnailImageFetcherService } from './adapter/out/image-fetch/thumbnail-image-fetcher.adapter';
import { SharpGeneratedImageValidatorAdapter } from './adapter/out/image-validation/sharp-generated-image-validator.adapter';
import { ThumbnailImageGenerationAdapter } from './adapter/out/gemini/thumbnail-image-generation.adapter';
import { ThumbnailReferenceImagesService } from './adapter/out/gemini/thumbnail-reference-images.adapter';
import { AiDirectJobRepositoryAdapter } from './adapter/out/repository/ai-direct-job.repository.adapter';
import { ContentAssetLibraryRepositoryAdapter } from './adapter/out/repository/content-asset-library.repository.adapter';
import { ContentWorkspaceLifecycleRepositoryAdapter } from './adapter/out/repository/content-workspace-lifecycle.repository.adapter';
import { DetailPageGenerationRepositoryAdapter } from './adapter/out/repository/detail-page-generation.repository.adapter';
import { DetailPageQueryRepositoryAdapter } from './adapter/out/repository/detail-page-query.repository.adapter';
import { ProductGenerationContextRepositoryAdapter } from './adapter/out/repository/product-generation-context.repository.adapter';
import { ThumbnailGenerationEventAdapter } from './adapter/out/repository/thumbnail-generation-event.adapter';
import { ThumbnailGenerationLedgerRepositoryAdapter } from './adapter/out/repository/thumbnail-generation-ledger.repository.adapter';
import { PRODUCT_GENERATION_AI_TRIGGER_PORT } from './application/port/in/generation/product-generation-ai-trigger.port';
import { THUMBNAIL_GENERATION_EVENT_PORT } from './application/port/out/event/thumbnail-generation-event.port';
import { GENERATED_IMAGE_VALIDATOR_PORT } from './application/port/out/provider/generated-image-validator.port';
import { IMAGE_FETCH_PORT } from './application/port/out/provider/image-fetch.port';
import { THUMBNAIL_IMAGE_GENERATION_PORT } from './application/port/out/provider/thumbnail-image-generation.port';
import { THUMBNAIL_REFERENCE_IMAGES_PORT } from './application/port/out/provider/thumbnail-reference-images.port';
import { AI_DIRECT_JOB_REPOSITORY_PORT } from './application/port/out/repository/ai-direct-job.repository.port';
import { CONTENT_ASSET_LIBRARY_REPOSITORY_PORT } from './application/port/out/repository/content-asset-library.repository.port';
import { CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT } from './application/port/out/repository/content-workspace-lifecycle.repository.port';
import { DETAIL_PAGE_GENERATION_REPOSITORY_PORT } from './application/port/out/repository/detail-page-generation.repository.port';
import { DETAIL_PAGE_QUERY_REPOSITORY_PORT } from './application/port/out/repository/detail-page-query.repository.port';
import { PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT } from './application/port/out/repository/product-generation-context.repository.port';
import { THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT } from './application/port/out/repository/thumbnail-generation-ledger.repository.port';
import { AI_DIRECT_JOB_RUNTIME_CONFIG, resolveAiDirectJobRuntimeConfig } from './application/service/ai-direct-job.config';
import { ContentWorkspaceService } from './application/service/content-workspace.service';
import { BoldVerticalRefinerService } from './application/service/bold-vertical-refiner.service';
import { DetailPageDirectGenerationJobService } from './application/service/detail-page-direct-generation-job.service';
import { DetailPageGenerationService } from './application/service/detail-page-generation.service';
import { DetailPageQueryService } from './application/service/detail-page-query.service';
import { DetailPageResultRefinerService } from './application/service/detail-page-result-refiner.service';
import { KidsPlayfulRefinerService } from './application/service/kids-playful-refiner.service';
import { ProductGenerationAiService } from './application/service/product-generation-ai.service';
import { ThumbnailDirectGenerationJobService } from './application/service/thumbnail-direct-generation-job.service';
import { ThumbnailEditorAiService } from './application/service/thumbnail-editor-ai.service';
import { ThumbnailGenerationJobService } from './application/service/thumbnail-generation-job.service';
import { ThumbnailGenerationLifecycleService } from './application/service/thumbnail-generation-lifecycle.service';
import { IMAGE_STORAGE_PORT } from './application/port/out/storage/image-storage.port';

/**
 * Controller-free owner composition for the listing product-generation path.
 * It deliberately excludes Agent OS API/HTTP and the direct-job worker; callers
 * receive only the owner trigger port and enqueue durable jobs for API workers.
 */
@Module({
  imports: [PrismaModule, StorageModule],
  providers: [
    ProductGenerationAiService,
    ContentWorkspaceService,
    DetailPageGenerationService,
    DetailPageQueryService,
    DetailPageResultRefinerService,
    BoldVerticalRefinerService,
    KidsPlayfulRefinerService,
    DetailPageDirectGenerationJobService,
    ThumbnailEditorAiService,
    ThumbnailGenerationJobService,
    ThumbnailGenerationLifecycleService,
    ThumbnailDirectGenerationJobService,
    AiDirectJobRepositoryAdapter,
    ContentAssetLibraryRepositoryAdapter,
    ContentWorkspaceLifecycleRepositoryAdapter,
    DetailPageGenerationRepositoryAdapter,
    DetailPageQueryRepositoryAdapter,
    ProductGenerationContextRepositoryAdapter,
    ThumbnailGenerationEventAdapter,
    ThumbnailGenerationLedgerRepositoryAdapter,
    ThumbnailImageFetcherService,
    SharpGeneratedImageValidatorAdapter,
    ThumbnailImageGenerationAdapter,
    ThumbnailReferenceImagesService,
    { provide: AI_DIRECT_JOB_RUNTIME_CONFIG, useFactory: resolveAiDirectJobRuntimeConfig },
    { provide: AI_DIRECT_JOB_REPOSITORY_PORT, useExisting: AiDirectJobRepositoryAdapter },
    { provide: CONTENT_ASSET_LIBRARY_REPOSITORY_PORT, useExisting: ContentAssetLibraryRepositoryAdapter },
    { provide: CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT, useExisting: ContentWorkspaceLifecycleRepositoryAdapter },
    { provide: DETAIL_PAGE_GENERATION_REPOSITORY_PORT, useExisting: DetailPageGenerationRepositoryAdapter },
    { provide: DETAIL_PAGE_QUERY_REPOSITORY_PORT, useExisting: DetailPageQueryRepositoryAdapter },
    { provide: GENERATED_IMAGE_VALIDATOR_PORT, useExisting: SharpGeneratedImageValidatorAdapter },
    { provide: IMAGE_FETCH_PORT, useExisting: ThumbnailImageFetcherService },
    { provide: IMAGE_STORAGE_PORT, useExisting: StorageService },
    { provide: PRODUCT_GENERATION_AI_TRIGGER_PORT, useExisting: ProductGenerationAiService },
    { provide: PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT, useExisting: ProductGenerationContextRepositoryAdapter },
    { provide: THUMBNAIL_GENERATION_EVENT_PORT, useExisting: ThumbnailGenerationEventAdapter },
    { provide: THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT, useExisting: ThumbnailGenerationLedgerRepositoryAdapter },
    { provide: THUMBNAIL_IMAGE_GENERATION_PORT, useExisting: ThumbnailImageGenerationAdapter },
    { provide: THUMBNAIL_REFERENCE_IMAGES_PORT, useExisting: ThumbnailReferenceImagesService },
  ],
  exports: [
    PRODUCT_GENERATION_AI_TRIGGER_PORT,
    AI_DIRECT_JOB_REPOSITORY_PORT,
    AI_DIRECT_JOB_RUNTIME_CONFIG,
    CONTENT_ASSET_LIBRARY_REPOSITORY_PORT,
    CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT,
    DETAIL_PAGE_GENERATION_REPOSITORY_PORT,
    DETAIL_PAGE_QUERY_REPOSITORY_PORT,
    GENERATED_IMAGE_VALIDATOR_PORT,
    IMAGE_FETCH_PORT,
    IMAGE_STORAGE_PORT,
    PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT,
    THUMBNAIL_GENERATION_EVENT_PORT,
    THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT,
    THUMBNAIL_IMAGE_GENERATION_PORT,
    THUMBNAIL_REFERENCE_IMAGES_PORT,
    ContentWorkspaceService,
    DetailPageDirectGenerationJobService,
    DetailPageGenerationService,
    DetailPageQueryService,
    DetailPageResultRefinerService,
    ThumbnailDirectGenerationJobService,
    ThumbnailEditorAiService,
    ThumbnailGenerationJobService,
    ThumbnailGenerationLifecycleService,
  ],
})
export class AiProductGenerationRuntimeModule {}
