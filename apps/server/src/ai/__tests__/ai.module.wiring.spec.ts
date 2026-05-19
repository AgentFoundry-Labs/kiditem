import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AgentOsModule } from '../../agent-os/agent-os.module';
import { AutomationModule } from '../../automation/automation.module';
import { ChannelsModule } from '../../channels/channels.module';
import { AiModule } from '../ai.module';
import { DetailPageContentGenerationSinkAdapter } from '../adapter/out/agent-output/detail-page-content-generation-sink.adapter';
import { ThumbnailGenerationSinkAdapter } from '../adapter/out/agent-output/thumbnail-generation-sink.adapter';
import { AiOperationAlertAdapter } from '../adapter/out/automation/operation-alert.adapter';
import { GeminiThumbnailVisionAdapter } from '../adapter/out/gemini/gemini-thumbnail-vision.adapter';
import { ThumbnailImageGenerationAdapter } from '../adapter/out/gemini/thumbnail-image-generation.adapter';
import { ThumbnailReferenceImagesService } from '../adapter/out/gemini/thumbnail-reference-images.adapter';
import { ContentArchiveRepositoryAdapter } from '../adapter/out/repository/content-archive.repository.adapter';
import { ContentAssetLibraryRepositoryAdapter } from '../adapter/out/repository/content-asset-library.repository.adapter';
import { ContentWorkspaceAttachmentRepositoryAdapter } from '../adapter/out/repository/content-workspace-attachment.repository.adapter';
import { ContentWorkspaceLifecycleRepositoryAdapter } from '../adapter/out/repository/content-workspace-lifecycle.repository.adapter';
import { DetailPageGenerationRepositoryAdapter } from '../adapter/out/repository/detail-page-generation.repository.adapter';
import { DetailPageQueryRepositoryAdapter } from '../adapter/out/repository/detail-page-query.repository.adapter';
import { DetailPageReconcileRepositoryAdapter } from '../adapter/out/repository/detail-page-reconcile.repository.adapter';
import { PostPromotionGenerationRepositoryAdapter } from '../adapter/out/repository/post-promotion-generation.repository.adapter';
import { ProductGenerationChildLedgerRepositoryAdapter } from '../adapter/out/repository/product-generation-child-ledger.repository.adapter';
import { ProductGenerationContextRepositoryAdapter } from '../adapter/out/repository/product-generation-context.repository.adapter';
import { ProductWorkspaceGroupRepositoryAdapter } from '../adapter/out/repository/product-workspace-group.repository.adapter';
import { SourcingWorkspaceArchiveRepositoryAdapter } from '../adapter/out/repository/sourcing-workspace-archive.repository.adapter';
import { ThumbnailAnalysisRepositoryAdapter } from '../adapter/out/repository/thumbnail-analysis.repository.adapter';
import { ThumbnailGenerationLedgerRepositoryAdapter } from '../adapter/out/repository/thumbnail-generation-ledger.repository.adapter';
import { ThumbnailTrackingRepositoryAdapter } from '../adapter/out/repository/thumbnail-tracking.repository.adapter';
import { ThumbnailWingRepositoryAdapter } from '../adapter/out/repository/thumbnail-wing.repository.adapter';
import { AiGenerationCancellationService } from '../application/service/ai-generation-cancellation.service';
import { PostPromotionAiService } from '../application/service/post-promotion-ai.service';
import { ProductGenerationAiService } from '../application/service/product-generation-ai.service';
import { SourcingWorkspaceArchiveService } from '../application/service/sourcing-workspace-archive.service';
import {
  AI_GENERATION_CANCELLATION_PORT,
  POST_PROMOTION_AI_TRIGGER_PORT,
  PRODUCT_GENERATION_AI_TRIGGER_PORT,
} from '../application/port/in/generation';
import { AI_WORKSPACE_ARCHIVE_PORT } from '../application/port/in/workspace';
import { AI_OPERATION_ALERT_PORT } from '../application/port/out/cross-domain';
import {
  THUMBNAIL_IMAGE_GENERATION_PORT,
  THUMBNAIL_REFERENCE_IMAGES_PORT,
  THUMBNAIL_VISION_PROVIDER_PORT,
} from '../application/port/out/provider';
import {
  CONTENT_ARCHIVE_REPOSITORY_PORT,
  CONTENT_ASSET_LIBRARY_REPOSITORY_PORT,
  CONTENT_WORKSPACE_ATTACHMENT_REPOSITORY_PORT,
  CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT,
  DETAIL_PAGE_GENERATION_REPOSITORY_PORT,
  DETAIL_PAGE_QUERY_REPOSITORY_PORT,
  DETAIL_PAGE_RECONCILE_REPOSITORY_PORT,
  POST_PROMOTION_GENERATION_REPOSITORY_PORT,
  PRODUCT_GENERATION_CHILD_LEDGER_REPOSITORY_PORT,
  PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT,
  PRODUCT_WORKSPACE_GROUP_REPOSITORY_PORT,
  SOURCING_WORKSPACE_ARCHIVE_REPOSITORY_PORT,
  THUMBNAIL_ANALYSIS_REPOSITORY_PORT,
  THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT,
  THUMBNAIL_TRACKING_REPOSITORY_PORT,
  THUMBNAIL_WING_REPOSITORY_PORT,
} from '../application/port/out/repository';
import {
  DETAIL_PAGE_AGENT_OUTPUT_SINK_PORT,
  THUMBNAIL_AGENT_OUTPUT_SINK_PORT,
} from '../application/port/out/sink';

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

    expect(imports).toEqual([ChannelsModule, AgentOsModule, AutomationModule]);
  });

  it('binds AI-domain ports that keep PR 2A application services off Prisma', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, AiModule) ?? [];

    [
      [DETAIL_PAGE_AGENT_OUTPUT_SINK_PORT, DetailPageContentGenerationSinkAdapter],
      [THUMBNAIL_AGENT_OUTPUT_SINK_PORT, ThumbnailGenerationSinkAdapter],
      [AI_OPERATION_ALERT_PORT, AiOperationAlertAdapter],
      [CONTENT_ARCHIVE_REPOSITORY_PORT, ContentArchiveRepositoryAdapter],
      [CONTENT_ASSET_LIBRARY_REPOSITORY_PORT, ContentAssetLibraryRepositoryAdapter],
      [CONTENT_WORKSPACE_ATTACHMENT_REPOSITORY_PORT, ContentWorkspaceAttachmentRepositoryAdapter],
      [CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT, ContentWorkspaceLifecycleRepositoryAdapter],
      [DETAIL_PAGE_GENERATION_REPOSITORY_PORT, DetailPageGenerationRepositoryAdapter],
      [DETAIL_PAGE_QUERY_REPOSITORY_PORT, DetailPageQueryRepositoryAdapter],
      [DETAIL_PAGE_RECONCILE_REPOSITORY_PORT, DetailPageReconcileRepositoryAdapter],
      [POST_PROMOTION_GENERATION_REPOSITORY_PORT, PostPromotionGenerationRepositoryAdapter],
      [PRODUCT_GENERATION_CHILD_LEDGER_REPOSITORY_PORT, ProductGenerationChildLedgerRepositoryAdapter],
      [PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT, ProductGenerationContextRepositoryAdapter],
      [PRODUCT_WORKSPACE_GROUP_REPOSITORY_PORT, ProductWorkspaceGroupRepositoryAdapter],
      [SOURCING_WORKSPACE_ARCHIVE_REPOSITORY_PORT, SourcingWorkspaceArchiveRepositoryAdapter],
      [THUMBNAIL_ANALYSIS_REPOSITORY_PORT, ThumbnailAnalysisRepositoryAdapter],
      [THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT, ThumbnailGenerationLedgerRepositoryAdapter],
      [THUMBNAIL_IMAGE_GENERATION_PORT, ThumbnailImageGenerationAdapter],
      [THUMBNAIL_REFERENCE_IMAGES_PORT, ThumbnailReferenceImagesService],
      [THUMBNAIL_TRACKING_REPOSITORY_PORT, ThumbnailTrackingRepositoryAdapter],
      [THUMBNAIL_VISION_PROVIDER_PORT, GeminiThumbnailVisionAdapter],
      [THUMBNAIL_WING_REPOSITORY_PORT, ThumbnailWingRepositoryAdapter],
    ].forEach(([token, adapter]) => {
      expectExistingBinding(providers, token as symbol, adapter);
    });
  });

  it('exports AI owner-side incoming ports through application services', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, AiModule) ?? [];
    const exports: unknown[] = Reflect.getMetadata(EXPORTS_KEY, AiModule) ?? [];

    [
      [POST_PROMOTION_AI_TRIGGER_PORT, PostPromotionAiService],
      [PRODUCT_GENERATION_AI_TRIGGER_PORT, ProductGenerationAiService],
      [AI_WORKSPACE_ARCHIVE_PORT, SourcingWorkspaceArchiveService],
      [AI_GENERATION_CANCELLATION_PORT, AiGenerationCancellationService],
    ].forEach(([token, adapter]) => {
      expectExistingBinding(providers, token as symbol, adapter);
    });

    expect(exports).toEqual([
      POST_PROMOTION_AI_TRIGGER_PORT,
      PRODUCT_GENERATION_AI_TRIGGER_PORT,
      AI_WORKSPACE_ARCHIVE_PORT,
      AI_GENERATION_CANCELLATION_PORT,
    ]);
  });
});
