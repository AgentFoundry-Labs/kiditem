import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AgentOsCapabilityModule } from '../../agent-os/agent-os-capability.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { StorageModule } from '../../common/storage/storage.module';
import { ChannelCatalogModule } from '../../channels/channel-catalog.module';
import { AiAgentRuntimeModule, AiModule, AiProductGenerationRuntimeModule } from '../ai.module';
import { AiCatalogMediaPublicationRepositoryAdapter } from '../adapter/out/repository/ai-catalog-media-publication.repository.adapter';
import { AiDirectJobRepositoryAdapter } from '../adapter/out/repository/ai-direct-job.repository.adapter';
import { CATALOG_MEDIA_PUBLICATION_PORT } from '../../channels/application/port/out/cross-domain/catalog-media-publication.port';
import { DetailPageGenerationSinkAdapter } from '../adapter/out/direct-output/detail-page-generation-sink.adapter';
import { ThumbnailGenerationSinkAdapter } from '../adapter/out/direct-output/thumbnail-generation-sink.adapter';
import { GeminiThumbnailVisionAdapter } from '../adapter/out/gemini/gemini-thumbnail-vision.adapter';
import { ThumbnailImageGenerationAdapter } from '../adapter/out/gemini/thumbnail-image-generation.adapter';
import { ThumbnailReferenceImagesService } from '../adapter/out/gemini/thumbnail-reference-images.adapter';
import { SharpGeneratedImageValidatorAdapter } from '../adapter/out/image-validation/sharp-generated-image-validator.adapter';
import { DetailPageTemplateStylesAdapter } from '../adapter/out/runtime/detail-page-template-styles.adapter';
import { ContentAssetLibraryRepositoryAdapter } from '../adapter/out/repository/content-asset-library.repository.adapter';
import { ContentWorkspaceLifecycleRepositoryAdapter } from '../adapter/out/repository/content-workspace-lifecycle.repository.adapter';
import { RegistrationContentWorkspaceRepositoryAdapter } from '../adapter/out/repository/registration-content-workspace.repository.adapter';
import { DetailPageRepositoryAdapter } from '../adapter/out/repository/detail-page.repository.adapter';
import { DetailPageGenerationRepositoryAdapter } from '../adapter/out/repository/detail-page-generation.repository.adapter';
import { DetailPageImageRepositoryAdapter } from '../adapter/out/repository/detail-page-image.repository.adapter';
import { ProductGenerationContextRepositoryAdapter } from '../adapter/out/repository/product-generation-context.repository.adapter';
import { SalesProductWorkspaceArchiveRepositoryAdapter } from '../adapter/out/repository/sales-product-workspace-archive.repository.adapter';
import { ThumbnailGenerationLedgerRepositoryAdapter } from '../adapter/out/repository/thumbnail-generation-ledger.repository.adapter';
import { RegistrableThumbnailRepositoryAdapter } from '../adapter/out/repository/registrable-thumbnail.repository.adapter';
import { RegistrableThumbnailService } from '../application/service/registrable-thumbnail.service';
import { AiGenerationCancellationService } from '../application/service/ai-generation-cancellation.service';
import { ContentAssetService } from '../application/service/content-asset.service';
import { RegistrationContentWorkspaceService } from '../application/service/registration-content-workspace.service';
import { ProductGenerationAiService } from '../application/service/product-generation-ai.service';
import { SalesProductWorkspaceArchiveService } from '../application/service/sales-product-workspace-archive.service';
import { REGISTRABLE_THUMBNAIL_PORT } from '../application/port/in/workspace/registrable-thumbnail.port';
import {
  AI_GENERATION_CANCELLATION_PORT,
  PRODUCT_GENERATION_AI_TRIGGER_PORT,
} from '../application/port/in/generation';
import { AI_WORKSPACE_ARCHIVE_PORT } from '../application/port/in/workspace';
import { REGISTRATION_CONTENT_WORKSPACE_PORT } from '../application/port/in/workspace/registration-content-workspace.port';
import { SALES_PRODUCT_CONTENT_ASSET_PORT } from '../application/port/in/workspace/sales-product-content-asset.port';
import {
  GENERATED_IMAGE_VALIDATOR_PORT,
  THUMBNAIL_IMAGE_GENERATION_PORT,
  THUMBNAIL_REFERENCE_IMAGES_PORT,
  THUMBNAIL_VISION_PROVIDER_PORT,
} from '../application/port/out/provider';
import {
  AI_DIRECT_JOB_REPOSITORY_PORT,
  CONTENT_ASSET_LIBRARY_REPOSITORY_PORT,
  CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT,
  DETAIL_PAGE_GENERATION_REPOSITORY_PORT,
  DETAIL_PAGE_REPOSITORY_PORT,
  DETAIL_PAGE_IMAGE_REPOSITORY_PORT,
  PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT,
  REGISTRATION_CONTENT_WORKSPACE_REPOSITORY_PORT,
  SALES_PRODUCT_WORKSPACE_ARCHIVE_REPOSITORY_PORT,
  THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT,
  REGISTRABLE_THUMBNAIL_REPOSITORY_PORT,
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
import { DetailPageResultRefinerService } from '../application/service/detail-page-result-refiner.service';
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

    expect(imports).toEqual([ChannelCatalogModule, AiAgentRuntimeModule]);
    expect(runtimeImports).toEqual([
      ChannelCatalogModule,
      PrismaModule,
      AgentOsCapabilityModule,
      StorageModule,
      AiProductGenerationRuntimeModule,
    ]);
    expect(Reflect.getMetadata('controllers', AiAgentRuntimeModule) ?? []).toEqual([]);
  });

  it('keeps AI direct generation independent from OperationAlert and panel runtime', () => {
    const moduleSources = readFileSync(new URL('../ai.module.ts', import.meta.url), 'utf8');
    expect(moduleSources).not.toMatch(/OperationAlert|OperationRun|Panel/);
  });

  it('re-exports the product-generation owner module instead of a port it does not provide', () => {
    const exports: unknown[] = Reflect.getMetadata(EXPORTS_KEY, AiAgentRuntimeModule) ?? [];
    expect(exports).toContain(AiProductGenerationRuntimeModule);
  });

  it('publishes the refiner consumed by API-side direct generation executors', () => {
    const exports: unknown[] = Reflect.getMetadata(EXPORTS_KEY, AiProductGenerationRuntimeModule) ?? [];
    expect(exports).toContain(DetailPageResultRefinerService);
  });

  it('binds AI-domain ports that keep PR 2A application services off Prisma', () => {
    const runtimeProviders: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AiAgentRuntimeModule) ?? [];
    const apiProviders: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AiModule) ?? [];
    const productGenerationProviders: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AiProductGenerationRuntimeModule) ?? [];

    [
      [AI_DIRECT_JOB_REPOSITORY_PORT, AiDirectJobRepositoryAdapter],
      [CONTENT_ASSET_LIBRARY_REPOSITORY_PORT, ContentAssetLibraryRepositoryAdapter],
      [CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT, ContentWorkspaceLifecycleRepositoryAdapter],
      [DETAIL_PAGE_GENERATION_REPOSITORY_PORT, DetailPageGenerationRepositoryAdapter],
      [DETAIL_PAGE_REPOSITORY_PORT, DetailPageRepositoryAdapter],
      [PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT, ProductGenerationContextRepositoryAdapter],
      [THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT, ThumbnailGenerationLedgerRepositoryAdapter],
      [GENERATED_IMAGE_VALIDATOR_PORT, SharpGeneratedImageValidatorAdapter],
      [THUMBNAIL_IMAGE_GENERATION_PORT, ThumbnailImageGenerationAdapter],
      [THUMBNAIL_REFERENCE_IMAGES_PORT, ThumbnailReferenceImagesService],
    ].forEach(([token, adapter]) => {
      expectExistingBinding(productGenerationProviders, token as symbol, adapter);
    });
    expectExistingBinding(
      runtimeProviders,
      REGISTRABLE_THUMBNAIL_REPOSITORY_PORT,
      RegistrableThumbnailRepositoryAdapter,
    );
    [
      [DETAIL_PAGE_DIRECT_OUTPUT_SINK_PORT, DetailPageGenerationSinkAdapter],
      [AI_DIRECT_JOB_WAKE_PORT, AiDirectJobWorkerService],
      [THUMBNAIL_DIRECT_OUTPUT_SINK_PORT, ThumbnailGenerationSinkAdapter],
      [DETAIL_PAGE_IMAGE_REPOSITORY_PORT, DetailPageImageRepositoryAdapter],
      [DETAIL_PAGE_TEMPLATE_STYLES_PORT, DetailPageTemplateStylesAdapter],
      [REGISTRATION_CONTENT_WORKSPACE_REPOSITORY_PORT, RegistrationContentWorkspaceRepositoryAdapter],
      [SALES_PRODUCT_WORKSPACE_ARCHIVE_REPOSITORY_PORT, SalesProductWorkspaceArchiveRepositoryAdapter],
      [THUMBNAIL_VISION_PROVIDER_PORT, GeminiThumbnailVisionAdapter],
      [CATALOG_DISPLAY_MEDIA_REPOSITORY_PORT, CatalogDisplayMediaRepositoryAdapter],
    ].forEach(([token, adapter]) => {
      expectExistingBinding(apiProviders, token as symbol, adapter);
    });
    expect(runtimeProviders).not.toContain(AiDirectJobWorkerService);
    expect(runtimeProviders).not.toContain(ProductGenerationAiService);
    expect(runtimeProviders).not.toContain(AiDirectJobWakeRegistrationService);
    expect(apiProviders).toContain(AiDirectJobWakeRegistrationService);
    expect(apiProviders).toContain(DetailPageClientRenderService);
  });

  it('exports AI owner-side incoming ports through application services', () => {
    const runtimeProviders: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AiAgentRuntimeModule) ?? [];
    const apiProviders: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AiModule) ?? [];
    const productGenerationProviders: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AiProductGenerationRuntimeModule) ?? [];
    const runtimeExports: unknown[] =
      Reflect.getMetadata(EXPORTS_KEY, AiAgentRuntimeModule) ?? [];
    const apiExports: unknown[] =
      Reflect.getMetadata(EXPORTS_KEY, AiModule) ?? [];

    expectExistingBinding(runtimeProviders, REGISTRABLE_THUMBNAIL_PORT, RegistrableThumbnailService);
    expect(runtimeExports).toContain(REGISTRABLE_THUMBNAIL_PORT);
    expectExistingBinding(
      productGenerationProviders,
      PRODUCT_GENERATION_AI_TRIGGER_PORT,
      ProductGenerationAiService,
    );
    [
      [AI_WORKSPACE_ARCHIVE_PORT, SalesProductWorkspaceArchiveService],
      [AI_GENERATION_CANCELLATION_PORT, AiGenerationCancellationService],
      [REGISTRATION_CONTENT_WORKSPACE_PORT, RegistrationContentWorkspaceService],
      [SALES_PRODUCT_CONTENT_ASSET_PORT, ContentAssetService],
      [CATALOG_MEDIA_PUBLICATION_PORT, AiCatalogMediaPublicationRepositoryAdapter],
      [CATALOG_DISPLAY_MEDIA_PORT, CatalogDisplayMediaService],
      [TEXT_JUDGEMENT_PORT, TextJudgementService],
    ].forEach(([token, adapter]) => {
      expectExistingBinding(apiProviders, token as symbol, adapter);
    });

    expect(runtimeExports).toContain(AiProductGenerationRuntimeModule);
    expect(apiExports).toEqual(expect.arrayContaining([
      // Bounded text judgement published for other owner domains (advertising
      // keyword relevance). Consumers must not reach for the provider-side
      // TEXT_COMPLETION_PORT.
      TEXT_JUDGEMENT_PORT,
      AI_WORKSPACE_ARCHIVE_PORT,
      AI_GENERATION_CANCELLATION_PORT,
      REGISTRATION_CONTENT_WORKSPACE_PORT,
      SALES_PRODUCT_CONTENT_ASSET_PORT,
      CATALOG_MEDIA_PUBLICATION_PORT,
      CATALOG_DISPLAY_MEDIA_PORT,
    ]));
  });
});
