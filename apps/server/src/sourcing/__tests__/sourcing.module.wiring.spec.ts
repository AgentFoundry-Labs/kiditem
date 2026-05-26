import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { SourcingModule } from '../sourcing.module';
import { Sourcing1688ImageSearchService } from '../application/service/sourcing-1688-image-search.service';
import { NaverKeywordResearchService } from '../application/service/naver-keyword-research.service';
import { SourcingService } from '../application/service/sourcing.service';
import { SourcingPromotionService } from '../application/service/sourcing-promotion.service';
import { SourcingWorkspaceArchiveService } from '../application/service/sourcing-workspace-archive.service';
import { SourcingWorkspaceSnapshotService } from '../application/service/sourcing-workspace-snapshot.service';
import { ProductPreparationSelectionService } from '../application/service/product-preparation-selection.service';
import { NaverDatalabPopularKeywordAdapter } from '../adapter/out/naver/naver-datalab-popular-keyword.adapter';
import { NaverDatalabTrendAdapter } from '../adapter/out/naver/naver-datalab-trend.adapter';
import { NaverAutocompleteKeywordAdapter } from '../adapter/out/naver/naver-autocomplete-keyword.adapter';
import { NaverSearchAdKeywordAdapter } from '../adapter/out/naver/naver-search-ad-keyword.adapter';
import { SourcingAgentGatewayAdapter } from '../adapter/out/agent/sourcing-agent.gateway.adapter';
import { SourcingAiWorkspaceArchiveAdapter } from '../adapter/out/ai/workspace-archive.adapter';
import { SourcingOperationAlertAdapter } from '../adapter/out/automation/operation-alert.adapter';
import { SourcingProductsCatalogAdapter } from '../adapter/out/products/products-catalog.adapter';
import { SourcingCandidateRepositoryAdapter } from '../adapter/out/repository/sourcing-candidate.repository.adapter';
import { SourcingWorkspaceSnapshotRepositoryAdapter } from '../adapter/out/repository/sourcing-workspace-snapshot.repository.adapter';
import { SourcingPlaywrightRuntimeHandler } from '../adapter/out/runtime/sourcing-playwright-runtime.handler';
import { Tmapi1688ImageSearchAdapter } from '../adapter/out/tmapi/tmapi-1688-image-search.adapter';
import { SOURCING_1688_IMAGE_SEARCH_PORT } from '../application/port/out/provider/1688-image-search.port';
import {
  SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT,
  SOURCING_NAVER_DATALAB_TREND_PORT,
  SOURCING_NAVER_AUTOCOMPLETE_KEYWORD_PORT,
  SOURCING_NAVER_KEYWORD_RESEARCH_PORT,
} from '../application/port/out/provider/naver-keyword-research.port';
import { SOURCING_AGENT_GATEWAY_PORT } from '../application/port/out/runtime/sourcing-agent.gateway.port';
import { SOURCING_AI_WORKSPACE_ARCHIVE_PORT } from '../application/port/out/cross-domain/ai-workspace-archive.port';
import { SOURCING_OPERATION_ALERT_PORT } from '../application/port/out/cross-domain/operation-alert.port';
import { SOURCING_PRODUCTS_CATALOG_PORT } from '../application/port/out/cross-domain/products-catalog.port';
import { SOURCING_CANDIDATE_REPOSITORY_PORT } from '../application/port/out/repository/sourcing-candidate.repository.port';
import { SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT } from '../application/port/out/repository/sourcing-workspace-snapshot.repository.port';
import { AutomationModule } from '../../automation/automation.module';

// NestJS @Module / @Controller metadata keys (stable across Nest 10/11).
const IMPORTS_KEY = 'imports';
const CONTROLLERS_KEY = 'controllers';
const PROVIDERS_KEY = 'providers';
const PATH_KEY = 'path';

// Sourcing owner module — Chinese new-product discovery. Suppliers and
// procurement were extracted to SupplyModule during issue #192 follow-up
// Track A PR 1. This spec freezes the module metadata so a removed
// controller, a missing provider, or a route rename fails at vitest time
// before reaching dev:server boot.
describe('SourcingModule canonical owner wiring', () => {
  it('mounts extension routes before candidate workspace routes', () => {
    const controllers: unknown[] = Reflect.getMetadata(CONTROLLERS_KEY, SourcingModule) ?? [];
    expect(controllers.map((controller) => (controller as { name: string }).name)).toEqual([
      'SourcingExtensionIngestController',
      'SourcingKeywordResearchController',
      'Sourcing1688ImageSearchController',
      'SourcingCandidateWorkspaceController',
      'SourcingWorkspaceSnapshotController',
    ]);
  });

  it('declares every application service as a provider', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, SourcingModule) ?? [];
    expect(providers).toContain(SourcingService);
    expect(providers).toContain(NaverKeywordResearchService);
    expect(providers).toContain(Sourcing1688ImageSearchService);
    expect(providers).toContain(SourcingPromotionService);
    expect(providers).toContain(SourcingWorkspaceArchiveService);
    expect(providers).toContain(SourcingWorkspaceSnapshotService);
    expect(providers).toContain(ProductPreparationSelectionService);
  });

  it('binds outgoing ports to their adapters', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, SourcingModule) ?? [];
    expect(providers).toContain(NaverDatalabPopularKeywordAdapter);
    expect(providers).toContain(NaverDatalabTrendAdapter);
    expect(providers).toContain(NaverAutocompleteKeywordAdapter);
    expect(providers).toContain(NaverSearchAdKeywordAdapter);
    expect(providers).toContain(SourcingAgentGatewayAdapter);
    expect(providers).toContain(SourcingAiWorkspaceArchiveAdapter);
    expect(providers).toContain(SourcingOperationAlertAdapter);
    expect(providers).toContain(SourcingProductsCatalogAdapter);
    expect(providers).toContain(SourcingCandidateRepositoryAdapter);
    expect(providers).toContain(SourcingWorkspaceSnapshotRepositoryAdapter);
    expect(providers).toContain(SourcingPlaywrightRuntimeHandler);
    expect(providers).toContain(Tmapi1688ImageSearchAdapter);
    expect(
      providers.some((provider) =>
        typeof provider === 'function' && provider.name === 'SourcingPythonRuntimeHandler',
      ),
    ).toBe(false);
    const gatewayBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === 'object' && p !== null && (p as any).provide === SOURCING_AGENT_GATEWAY_PORT,
    );
    expect(gatewayBinding).toBeDefined();
    expect(gatewayBinding!.useExisting).toBe(SourcingAgentGatewayAdapter);
    const alertBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === 'object' && p !== null && (p as any).provide === SOURCING_OPERATION_ALERT_PORT,
    );
    expect(alertBinding).toBeDefined();
    expect(alertBinding!.useExisting).toBe(SourcingOperationAlertAdapter);
    const aiArchiveBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === 'object' && p !== null && (p as any).provide === SOURCING_AI_WORKSPACE_ARCHIVE_PORT,
    );
    expect(aiArchiveBinding).toBeDefined();
    expect(aiArchiveBinding!.useExisting).toBe(SourcingAiWorkspaceArchiveAdapter);
    const productsBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === 'object' && p !== null && (p as any).provide === SOURCING_PRODUCTS_CATALOG_PORT,
    );
    expect(productsBinding).toBeDefined();
    expect(productsBinding!.useExisting).toBe(SourcingProductsCatalogAdapter);
    const candidateRepositoryBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === 'object' && p !== null && (p as any).provide === SOURCING_CANDIDATE_REPOSITORY_PORT,
    );
    expect(candidateRepositoryBinding).toBeDefined();
    expect(candidateRepositoryBinding!.useExisting).toBe(SourcingCandidateRepositoryAdapter);
    const workspaceSnapshotRepositoryBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === 'object' && p !== null && (p as any).provide === SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT,
    );
    expect(workspaceSnapshotRepositoryBinding).toBeDefined();
    expect(workspaceSnapshotRepositoryBinding!.useExisting).toBe(SourcingWorkspaceSnapshotRepositoryAdapter);
    const imageSearchBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === 'object' && p !== null && (p as any).provide === SOURCING_1688_IMAGE_SEARCH_PORT,
    );
    expect(imageSearchBinding).toBeDefined();
    expect(imageSearchBinding!.useExisting).toBe(Tmapi1688ImageSearchAdapter);
    const naverKeywordBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === 'object' && p !== null && (p as any).provide === SOURCING_NAVER_KEYWORD_RESEARCH_PORT,
    );
    expect(naverKeywordBinding).toBeDefined();
    expect(naverKeywordBinding!.useExisting).toBe(NaverSearchAdKeywordAdapter);
    const naverDatalabBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === 'object' && p !== null && (p as any).provide === SOURCING_NAVER_DATALAB_TREND_PORT,
    );
    expect(naverDatalabBinding).toBeDefined();
    expect(naverDatalabBinding!.useExisting).toBe(NaverDatalabTrendAdapter);
    const naverPopularKeywordBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === 'object' && p !== null && (p as any).provide === SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT,
    );
    expect(naverPopularKeywordBinding).toBeDefined();
    expect(naverPopularKeywordBinding!.useExisting).toBe(NaverDatalabPopularKeywordAdapter);
    const naverAutocompleteKeywordBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === 'object' && p !== null && (p as any).provide === SOURCING_NAVER_AUTOCOMPLETE_KEYWORD_PORT,
    );
    expect(naverAutocompleteKeywordBinding).toBeDefined();
    expect(naverAutocompleteKeywordBinding!.useExisting).toBe(NaverAutocompleteKeywordAdapter);
  });

  it('imports the Agent OS runtime so the gateway adapter can resolve AGENT_RUNNER_PORT', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, SourcingModule) ?? [];
    // PrismaModule + AgentOsModule + AiModule + AutomationModule + ProductsModule.
    // Supplier/procurement capability imports belong in SupplyModule.
    expect(imports.length).toBeGreaterThanOrEqual(2);
  });

  it('imports AutomationModule so its operation-alert adapter can resolve the owner-side port', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, SourcingModule) ?? [];
    expect(imports).toContain(AutomationModule);
  });

  it('keeps public /api route prefix on every route-family controller', () => {
    const controllers: unknown[] = Reflect.getMetadata(CONTROLLERS_KEY, SourcingModule) ?? [];
    expect(
      controllers.map((controller) => Reflect.getMetadata(PATH_KEY, controller as object)),
    ).toEqual([
      'sourcing',
      'sourcing/keyword-research/naver',
      'sourcing/1688/image-search',
      'sourcing',
      'sourcing/workspace-snapshots',
    ]);
  });
});
