import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AgentOsModule } from '../../agent-os/agent-os.module';
import { OperationAlertRuntimeModule } from '../../automation/operation-alert-runtime.module';
import { StorageModule } from '../../common/storage/storage.module';
import { AiAgentRuntimeModule, AiModule } from '../ai.module';
import { AiWingRegistrationCapabilityAdapter } from '../adapter/in/agent/ai-wing-registration-capability.adapter';
import { AiCatalogMediaPublicationRepositoryAdapter } from '../adapter/out/repository/ai-catalog-media-publication.repository.adapter';
import { AiDirectJobRepositoryAdapter } from '../adapter/out/repository/ai-direct-job.repository.adapter';
import { CATALOG_MEDIA_PUBLICATION_PORT } from '../../channels/application/port/out/cross-domain/catalog-media-publication.port';
import { DetailPageContentGenerationSinkAdapter } from '../adapter/out/direct-output/detail-page-content-generation-sink.adapter';
import { ThumbnailGenerationSinkAdapter } from '../adapter/out/direct-output/thumbnail-generation-sink.adapter';
import { AiOperationAlertAdapter } from '../adapter/out/automation/operation-alert.adapter';
import { GeminiThumbnailVisionAdapter } from '../adapter/out/gemini/gemini-thumbnail-vision.adapter';
import { ThumbnailImageGenerationAdapter } from '../adapter/out/gemini/thumbnail-image-generation.adapter';
import { ThumbnailReferenceImagesService } from '../adapter/out/gemini/thumbnail-reference-images.adapter';
import { SharpGeneratedImageValidatorAdapter } from '../adapter/out/image-validation/sharp-generated-image-validator.adapter';
import { DetailPageTemplateStylesAdapter } from '../adapter/out/runtime/detail-page-template-styles.adapter';
import { ContentArchiveRepositoryAdapter } from '../adapter/out/repository/content-archive.repository.adapter';
import { ContentAssetLibraryRepositoryAdapter } from '../adapter/out/repository/content-asset-library.repository.adapter';
import { ContentWorkspaceLifecycleRepositoryAdapter } from '../adapter/out/repository/content-workspace-lifecycle.repository.adapter';
import { ContentWorkspaceThumbnailSelectionRepositoryAdapter } from '../adapter/out/repository/content-workspace-thumbnail-selection.repository.adapter';
import { RegistrationContentWorkspaceRepositoryAdapter } from '../adapter/out/repository/registration-content-workspace.repository.adapter';
import { DetailPageGenerationRepositoryAdapter } from '../adapter/out/repository/detail-page-generation.repository.adapter';
import { DetailPageQueryRepositoryAdapter } from '../adapter/out/repository/detail-page-query.repository.adapter';
import { DetailPageImageRepositoryAdapter } from '../adapter/out/repository/detail-page-image.repository.adapter';
import { ProductGenerationChildLedgerRepositoryAdapter } from '../adapter/out/repository/product-generation-child-ledger.repository.adapter';
import { ProductGenerationContextRepositoryAdapter } from '../adapter/out/repository/product-generation-context.repository.adapter';
import { SourcingWorkspaceArchiveRepositoryAdapter } from '../adapter/out/repository/sourcing-workspace-archive.repository.adapter';
import { ThumbnailAnalysisRepositoryAdapter } from '../adapter/out/repository/thumbnail-analysis.repository.adapter';
import { ThumbnailGenerationLedgerRepositoryAdapter } from '../adapter/out/repository/thumbnail-generation-ledger.repository.adapter';
import { ThumbnailTrackingRepositoryAdapter } from '../adapter/out/repository/thumbnail-tracking.repository.adapter';
import { ThumbnailWingRepositoryAdapter } from '../adapter/out/repository/thumbnail-wing.repository.adapter';
import { AiGenerationCancellationService } from '../application/service/ai-generation-cancellation.service';
import { ContentAssetService } from '../application/service/content-asset.service';
import { ContentWorkspaceThumbnailSelectionService } from '../application/service/content-workspace-thumbnail-selection.service';
import { RegistrationContentWorkspaceService } from '../application/service/registration-content-workspace.service';
import { ProductGenerationAiService } from '../application/service/product-generation-ai.service';
import { SourcingWorkspaceArchiveService } from '../application/service/sourcing-workspace-archive.service';
import {
  AI_WING_REGISTRATION_CAPABILITY_PORT,
} from '../application/port/in/capability/wing-registration.port';
import {
  AI_GENERATION_CANCELLATION_PORT,
  PRODUCT_GENERATION_AI_TRIGGER_PORT,
} from '../application/port/in/generation';
import { AI_WORKSPACE_ARCHIVE_PORT } from '../application/port/in/workspace';
import { REGISTRATION_CONTENT_WORKSPACE_PORT } from '../application/port/in/workspace/registration-content-workspace.port';
import { CANDIDATE_CONTENT_ASSET_PORT } from '../application/port/in/workspace/candidate-content-asset.port';
import { AI_OPERATION_ALERT_PORT } from '../application/port/out/cross-domain';
import {
  GENERATED_IMAGE_VALIDATOR_PORT,
  THUMBNAIL_IMAGE_GENERATION_PORT,
  THUMBNAIL_REFERENCE_IMAGES_PORT,
  THUMBNAIL_VISION_PROVIDER_PORT,
} from '../application/port/out/provider';
import {
  AI_DIRECT_JOB_REPOSITORY_PORT,
  CONTENT_ARCHIVE_REPOSITORY_PORT,
  CONTENT_ASSET_LIBRARY_REPOSITORY_PORT,
  CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT,
  CONTENT_WORKSPACE_THUMBNAIL_SELECTION_REPOSITORY_PORT,
  DETAIL_PAGE_GENERATION_REPOSITORY_PORT,
  DETAIL_PAGE_IMAGE_REPOSITORY_PORT,
  DETAIL_PAGE_QUERY_REPOSITORY_PORT,
  PRODUCT_GENERATION_CHILD_LEDGER_REPOSITORY_PORT,
  PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT,
  REGISTRATION_CONTENT_WORKSPACE_REPOSITORY_PORT,
  SOURCING_WORKSPACE_ARCHIVE_REPOSITORY_PORT,
  THUMBNAIL_ANALYSIS_REPOSITORY_PORT,
  THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT,
  THUMBNAIL_TRACKING_REPOSITORY_PORT,
  THUMBNAIL_WING_REPOSITORY_PORT,
} from '../application/port/out/repository';
import {
  DETAIL_PAGE_DIRECT_OUTPUT_SINK_PORT,
  THUMBNAIL_DIRECT_OUTPUT_SINK_PORT,
} from '../application/port/out/sink';
import {
  AI_DIRECT_JOB_WAKE_PORT,
  DETAIL_PAGE_TEMPLATE_STYLES_PORT,
} from '../application/port/out/runtime';
import { AiDirectJobWorkerService } from '../application/service/ai-direct-job-worker.service';
import { AiDirectJobWakeRegistrationService } from '../application/service/ai-direct-job-wake-registration.service';
import { DetailPageClientRenderService } from '../application/service/detail-page-client-render.service';
import { CatalogDisplayMediaService } from '../application/service/catalog-display-media.service';
import { CatalogDisplayMediaRepositoryAdapter } from '../adapter/out/repository/catalog-display-media.repository.adapter';
import {
  CATALOG_DISPLAY_MEDIA_PORT,
} from '../application/port/in/workspace/catalog-display-media.port';
import {
  CATALOG_DISPLAY_MEDIA_REPOSITORY_PORT,
} from '../application/port/out/repository/catalog-display-media.repository.port';
import { TEXT_JUDGEMENT_PORT } from '../application/port/in/capability/text-judgement.port';
import { TextJudgementService } from '../application/service/text-judgement.service';

const IMPORTS_KEY = 'imports';
const PROVIDERS_KEY = 'providers';
const EXPORTS_KEY = 'exports';

function expectExistingBinding(providers: unknown[], token: symbol, adapter: unknown) {
  const binding = providers.find(
    (provider): provider is { provide: symbol; useExisting: unknown } =>
      typeof provider === 'object' &&
      provider !== null &&
      (provider as { provide?: unknown }).provide === token,
  );

  expect(binding).toBeDefined();
  expect(binding!.useExisting).toBe(adapter);
  expect(providers).toContain(adapter);
}

describe('AiModule hexagonal wiring contract', () => {
  it('imports owner modules only at the Nest module boundary', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, AiModule) ?? [];
    const runtimeImports: unknown[] =
      Reflect.getMetadata(IMPORTS_KEY, AiAgentRuntimeModule) ?? [];

    expect(imports).toEqual([AiAgentRuntimeModule]);
    expect(runtimeImports).toEqual([
      OperationAlertRuntimeModule,
      AgentOsModule,
      StorageModule,
    ]);
    expect(Reflect.getMetadata('controllers', AiAgentRuntimeModule) ?? []).toEqual([]);
  });

  it('binds AI-domain ports that keep PR 2A application services off Prisma', () => {
    const runtimeProviders: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AiAgentRuntimeModule) ?? [];
    const apiProviders: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AiModule) ?? [];

    [
      [AI_DIRECT_JOB_REPOSITORY_PORT, AiDirectJobRepositoryAdapter],
      [AI_OPERATION_ALERT_PORT, AiOperationAlertAdapter],
      [CONTENT_ASSET_LIBRARY_REPOSITORY_PORT, ContentAssetLibraryRepositoryAdapter],
      [CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT, ContentWorkspaceLifecycleRepositoryAdapter],
      [DETAIL_PAGE_GENERATION_REPOSITORY_PORT, DetailPageGenerationRepositoryAdapter],
      [DETAIL_PAGE_QUERY_REPOSITORY_PORT, DetailPageQueryRepositoryAdapter],
      [PRODUCT_GENERATION_CHILD_LEDGER_REPOSITORY_PORT, ProductGenerationChildLedgerRepositoryAdapter],
      [PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT, ProductGenerationContextRepositoryAdapter],
      [THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT, ThumbnailGenerationLedgerRepositoryAdapter],
      [GENERATED_IMAGE_VALIDATOR_PORT, SharpGeneratedImageValidatorAdapter],
      [THUMBNAIL_IMAGE_GENERATION_PORT, ThumbnailImageGenerationAdapter],
      [THUMBNAIL_REFERENCE_IMAGES_PORT, ThumbnailReferenceImagesService],
      [THUMBNAIL_WING_REPOSITORY_PORT, ThumbnailWingRepositoryAdapter],
    ].forEach(([token, adapter]) => {
      expectExistingBinding(runtimeProviders, token as symbol, adapter);
    });
    [
      [DETAIL_PAGE_DIRECT_OUTPUT_SINK_PORT, DetailPageContentGenerationSinkAdapter],
      [AI_DIRECT_JOB_WAKE_PORT, AiDirectJobWorkerService],
      [THUMBNAIL_DIRECT_OUTPUT_SINK_PORT, ThumbnailGenerationSinkAdapter],
      [CONTENT_ARCHIVE_REPOSITORY_PORT, ContentArchiveRepositoryAdapter],
      [CONTENT_WORKSPACE_THUMBNAIL_SELECTION_REPOSITORY_PORT, ContentWorkspaceThumbnailSelectionRepositoryAdapter],
      [DETAIL_PAGE_IMAGE_REPOSITORY_PORT, DetailPageImageRepositoryAdapter],
      [DETAIL_PAGE_TEMPLATE_STYLES_PORT, DetailPageTemplateStylesAdapter],
      [REGISTRATION_CONTENT_WORKSPACE_REPOSITORY_PORT, RegistrationContentWorkspaceRepositoryAdapter],
      [SOURCING_WORKSPACE_ARCHIVE_REPOSITORY_PORT, SourcingWorkspaceArchiveRepositoryAdapter],
      [THUMBNAIL_ANALYSIS_REPOSITORY_PORT, ThumbnailAnalysisRepositoryAdapter],
      [THUMBNAIL_TRACKING_REPOSITORY_PORT, ThumbnailTrackingRepositoryAdapter],
      [THUMBNAIL_VISION_PROVIDER_PORT, GeminiThumbnailVisionAdapter],
      [CATALOG_DISPLAY_MEDIA_REPOSITORY_PORT, CatalogDisplayMediaRepositoryAdapter],
    ].forEach(([token, adapter]) => {
      expectExistingBinding(apiProviders, token as symbol, adapter);
    });
    expect(runtimeProviders).not.toContain(AiDirectJobWorkerService);
    expect(runtimeProviders).not.toContain(AiDirectJobWakeRegistrationService);
    expect(apiProviders).toContain(AiDirectJobWakeRegistrationService);
    expect(apiProviders).toContain(ContentWorkspaceThumbnailSelectionService);
    expect(apiProviders).toContain(DetailPageClientRenderService);
  });

  it('exports AI owner-side incoming ports through application services', () => {
    const runtimeProviders: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AiAgentRuntimeModule) ?? [];
    const apiProviders: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AiModule) ?? [];
    const runtimeExports: unknown[] =
      Reflect.getMetadata(EXPORTS_KEY, AiAgentRuntimeModule) ?? [];
    const apiExports: unknown[] =
      Reflect.getMetadata(EXPORTS_KEY, AiModule) ?? [];

    [
      [AI_WING_REGISTRATION_CAPABILITY_PORT, AiWingRegistrationCapabilityAdapter],
      [PRODUCT_GENERATION_AI_TRIGGER_PORT, ProductGenerationAiService],
    ].forEach(([token, adapter]) => {
      expectExistingBinding(runtimeProviders, token as symbol, adapter);
    });
    [
      [AI_WORKSPACE_ARCHIVE_PORT, SourcingWorkspaceArchiveService],
      [AI_GENERATION_CANCELLATION_PORT, AiGenerationCancellationService],
      [REGISTRATION_CONTENT_WORKSPACE_PORT, RegistrationContentWorkspaceService],
      [CANDIDATE_CONTENT_ASSET_PORT, ContentAssetService],
      [CATALOG_MEDIA_PUBLICATION_PORT, AiCatalogMediaPublicationRepositoryAdapter],
      [CATALOG_DISPLAY_MEDIA_PORT, CatalogDisplayMediaService],
      [TEXT_JUDGEMENT_PORT, TextJudgementService],
    ].forEach(([token, adapter]) => {
      expectExistingBinding(apiProviders, token as symbol, adapter);
    });

    expect(runtimeExports).toContain(PRODUCT_GENERATION_AI_TRIGGER_PORT);
    expect(apiExports).toEqual(expect.arrayContaining([
      // Bounded text judgement published for other owner domains (advertising
      // keyword relevance). Consumers must not reach for the provider-side
      // TEXT_COMPLETION_PORT.
      TEXT_JUDGEMENT_PORT,
      AI_WORKSPACE_ARCHIVE_PORT,
      AI_GENERATION_CANCELLATION_PORT,
      REGISTRATION_CONTENT_WORKSPACE_PORT,
      CANDIDATE_CONTENT_ASSET_PORT,
      CATALOG_MEDIA_PUBLICATION_PORT,
      CATALOG_DISPLAY_MEDIA_PORT,
    ]));
  });
});
