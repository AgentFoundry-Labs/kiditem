import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { InventoryModule } from '../../inventory/inventory.module';
import { AlertsModule } from '../../alerts/alerts.module';
import { RocketPoSourceController } from '../adapter/in/http/rocket-po-source.controller';
import { ChannelsModule } from '../channels.module';
import { ChannelRegistrationCapabilityAdapter } from '../adapter/in/agent/channel-registration-capability.adapter';
import { ChannelAccountRepositoryAdapter } from '../adapter/out/repository/channel-account.repository.adapter';
import { ChannelDashboardRepositoryAdapter } from '../adapter/out/repository/channel-dashboard.repository.adapter';
import { ChannelListingRepositoryAdapter } from '../adapter/out/repository/channel-listing.repository.adapter';
import { ChannelSyncRepositoryAdapter } from '../adapter/out/repository/channel-sync.repository.adapter';
import { MarketplaceRegistrationRepositoryAdapter } from '../adapter/out/repository/marketplace-registration.repository.adapter';
import { CoupangProviderAdapter } from '../adapter/out/coupang/coupang-provider.adapter';
import { CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT } from '../application/port/in/capability/marketplace-registration.port';
import {
  CHANNEL_ACCOUNT_REPOSITORY_PORT,
  COUPANG_CREDENTIALS_PORT,
} from '../application/port/out/repository/channel-account.repository.port';
import { CHANNEL_DASHBOARD_REPOSITORY_PORT } from '../application/port/out/repository/channel-dashboard.repository.port';
import {
  CHANNEL_LISTING_REPOSITORY_PORT,
  MARKETPLACE_REGISTRATION_REPOSITORY_PORT,
} from '../application/port/out/repository/channel-listing.repository.port';
import { CHANNEL_SYNC_REPOSITORY_PORT } from '../application/port/out/repository/channel-sync.repository.port';
import { COUPANG_PROVIDER_PORT } from '../application/port/out/provider/coupang-provider.port';
import { ChannelCatalogImportController } from '../adapter/in/http/channel-catalog-import.controller';
import { ChannelCatalogImportRepositoryAdapter } from '../adapter/out/repository/channel-catalog-import.repository.adapter';
import { CHANNEL_CATALOG_IMPORT_PORT } from '../application/port/in/channel-catalog-import.port';
import { CHANNEL_CATALOG_IMPORT_REPOSITORY_PORT } from '../application/port/out/repository/channel-catalog-import.repository.port';
import { ChannelCatalogImportService } from '../application/service/channel-catalog-import.service';
import { ChannelProductMatchingController } from '../adapter/in/http/channel-product-matching.controller';
import { ChannelProductMatchingRepositoryAdapter } from '../adapter/out/repository/channel-product-matching.repository.adapter';
import { ChannelRecipeSuggestionContextRepositoryAdapter } from '../adapter/out/repository/channel-recipe-suggestion-context.repository.adapter';
import { SellpiaManualMatchRepositoryAdapter } from '../adapter/out/repository/sellpia-manual-match.repository.adapter';
import { SellpiaRecipeEvidenceAdapter } from '../adapter/out/inventory/sellpia-recipe-evidence.adapter';
import { ChannelProductMatchingService } from '../application/service/channel-product-matching.service';
import { ChannelRecipeSuggestionService } from '../application/service/channel-recipe-suggestion.service';
import { SellpiaManualMatchService } from '../application/service/sellpia-manual-match.service';
import { CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT } from '../application/port/out/repository/channel-product-matching.repository.port';
import { CHANNEL_RECIPE_SUGGESTION_CONTEXT_REPOSITORY_PORT } from '../application/port/out/repository/channel-recipe-suggestion-context.repository.port';
import { SELLPIA_MANUAL_MATCH_REPOSITORY_PORT } from '../application/port/out/repository/sellpia-manual-match.repository.port';
import { SELLPIA_RECIPE_EVIDENCE_PORT } from '../application/port/out/cross-domain/sellpia-recipe-evidence.port';
import { ChannelSkuAvailabilityController } from '../adapter/in/http/channel-sku-availability.controller';
import {
  CHANNEL_SKU_AVAILABILITY_PORT,
} from '../application/port/in/channel-sku-availability.port';
import { ChannelSkuAvailabilityService } from '../application/service/channel-sku-availability.service';
import { RocketPoCatalogService } from '../application/service/rocket-po-catalog.service';
import { RocketPoCatalogRepositoryAdapter } from '../adapter/out/repository/rocket-po-catalog.repository.adapter';
import { ROCKET_PO_CATALOG_PORT } from '../application/port/in/rocket-po-catalog.port';
import { ROCKET_PO_CATALOG_REPOSITORY_PORT } from '../application/port/out/repository/rocket-po-catalog.repository.port';

const IMPORTS_KEY = 'imports';
const CONTROLLERS_KEY = 'controllers';
const PROVIDERS_KEY = 'providers';

function expectBinding(
  providers: unknown[],
  token: symbol,
  adapter: unknown,
) {
  const binding = providers.find(
    (provider): provider is { provide: symbol; useExisting: unknown } =>
      typeof provider === 'object' &&
      provider !== null &&
      (provider as { provide?: unknown }).provide === token,
  );
  expect(binding).toBeDefined();
  expect(binding!.useExisting).toBe(adapter);
}

describe('ChannelsModule canonical owner wiring', () => {
  it('wires the direct Rocket source HTTP boundary and its transactional Alert owner', () => {
    expect(Reflect.getMetadata(CONTROLLERS_KEY, ChannelsModule)).toContain(RocketPoSourceController);
    expect(Reflect.getMetadata(IMPORTS_KEY, ChannelsModule)).toContain(AlertsModule);
  });

  it('retires legacy reconciliation wiring and schema', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, ChannelsModule) ?? [];
    const controllers: unknown[] = Reflect.getMetadata(CONTROLLERS_KEY, ChannelsModule) ?? [];
    const exports_: unknown[] = Reflect.getMetadata('exports', ChannelsModule) ?? [];
    const wiredNames = [...providers, ...controllers, ...exports_].map((value) =>
      typeof value === 'function' ? value.name : String(value));
    expect(wiredNames.join('\n')).not.toMatch(/ChannelReconciliation|RECONCILIATION/);
    expect(exports_).toEqual(expect.arrayContaining([
      COUPANG_PROVIDER_PORT,
      CHANNEL_SKU_AVAILABILITY_PORT,
      CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT,
      ROCKET_PO_CATALOG_PORT,
    ]));

    const channelsRoot = path.resolve(__dirname, '..');
    expect(existsSync(path.join(
      channelsRoot,
      'adapter/in/http/channel-reconciliation.controller.ts',
    ))).toBe(false);
    expect(existsSync(path.join(
      channelsRoot,
      'application/service/channel-reconciliation.service.ts',
    ))).toBe(false);

    const schema = readFileSync(
      path.resolve(__dirname, '../../../../../prisma/models/channels.prisma'),
      'utf8',
    );
    expect(schema).not.toContain('model ChannelReconciliationRun');
    expect(schema).not.toContain('model ChannelReconciliationItem');
  });

  it('imports only owner modules for direct channel capabilities', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, ChannelsModule) ?? [];
    expect(imports).toContain(InventoryModule);
    expect(imports).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'AutomationModule' }),
      expect.objectContaining({ name: 'OperationsModule' }),
    ]));
  });

  it('binds every outgoing port to its local adapter', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, ChannelsModule) ?? [];

    expect(providers).toContain(ChannelAccountRepositoryAdapter);
    expect(providers).toContain(ChannelDashboardRepositoryAdapter);
    expect(providers).toContain(ChannelListingRepositoryAdapter);
    expect(providers).toContain(MarketplaceRegistrationRepositoryAdapter);
    expect(providers).toContain(ChannelSyncRepositoryAdapter);
    expect(providers).toContain(CoupangProviderAdapter);
    expect(providers).toContain(ChannelRegistrationCapabilityAdapter);
    expect(providers).toContain(ChannelCatalogImportService);
    expect(providers).toContain(ChannelCatalogImportRepositoryAdapter);
    expect(providers).toContain(ChannelProductMatchingService);
    expect(providers).toContain(ChannelRecipeSuggestionService);
    expect(providers).toContain(SellpiaManualMatchService);
    expect(providers).toContain(ChannelSkuAvailabilityService);
    expect(providers).toContain(ChannelProductMatchingRepositoryAdapter);
    expect(providers).toContain(ChannelRecipeSuggestionContextRepositoryAdapter);
    expect(providers).toContain(SellpiaManualMatchRepositoryAdapter);
    expect(providers).toContain(SellpiaRecipeEvidenceAdapter);
    expect(providers).toContain(RocketPoCatalogService);
    expect(providers).toContain(RocketPoCatalogRepositoryAdapter);
    expect(providers).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'ChannelsOperationAlertAdapter' }),
      expect.objectContaining({ name: 'CoupangRocketPurchaseOrderOperationHandler' }),
    ]));

    expectBinding(providers, CHANNEL_ACCOUNT_REPOSITORY_PORT, ChannelAccountRepositoryAdapter);
    expectBinding(providers, COUPANG_CREDENTIALS_PORT, ChannelAccountRepositoryAdapter);
    expectBinding(providers, CHANNEL_DASHBOARD_REPOSITORY_PORT, ChannelDashboardRepositoryAdapter);
    expectBinding(providers, CHANNEL_LISTING_REPOSITORY_PORT, ChannelListingRepositoryAdapter);
    expectBinding(
      providers,
      MARKETPLACE_REGISTRATION_REPOSITORY_PORT,
      MarketplaceRegistrationRepositoryAdapter,
    );
    expectBinding(providers, CHANNEL_SYNC_REPOSITORY_PORT, ChannelSyncRepositoryAdapter);
    expectBinding(providers, COUPANG_PROVIDER_PORT, CoupangProviderAdapter);
    expectBinding(
      providers,
      CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT,
      ChannelRegistrationCapabilityAdapter,
    );
    expectBinding(
      providers,
      CHANNEL_CATALOG_IMPORT_REPOSITORY_PORT,
      ChannelCatalogImportRepositoryAdapter,
    );
    expectBinding(
      providers,
      CHANNEL_CATALOG_IMPORT_PORT,
      ChannelCatalogImportService,
    );
    expectBinding(
      providers,
      CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT,
      ChannelProductMatchingRepositoryAdapter,
    );
    expectBinding(
      providers,
      CHANNEL_RECIPE_SUGGESTION_CONTEXT_REPOSITORY_PORT,
      ChannelRecipeSuggestionContextRepositoryAdapter,
    );
    expectBinding(
      providers,
      SELLPIA_MANUAL_MATCH_REPOSITORY_PORT,
      SellpiaManualMatchRepositoryAdapter,
    );
    expectBinding(providers, SELLPIA_RECIPE_EVIDENCE_PORT, SellpiaRecipeEvidenceAdapter);
    expectBinding(
      providers,
      CHANNEL_SKU_AVAILABILITY_PORT,
      ChannelSkuAvailabilityService,
    );
    expectBinding(
      providers,
      ROCKET_PO_CATALOG_REPOSITORY_PORT,
      RocketPoCatalogRepositoryAdapter,
    );
    expectBinding(providers, ROCKET_PO_CATALOG_PORT, RocketPoCatalogService);
  });

  it('registers the account-scoped Wing catalog import controller', () => {
    const controllers: unknown[] =
      Reflect.getMetadata(CONTROLLERS_KEY, ChannelsModule) ?? [];

    expect(controllers).toContain(ChannelCatalogImportController);
    expect(controllers).toContain(ChannelProductMatchingController);
    expect(controllers).toContain(ChannelSkuAvailabilityController);
  });

  it('does not export the mapping repository implementation', () => {
    const exports_: unknown[] = Reflect.getMetadata('exports', ChannelsModule) ?? [];
    expect(exports_).not.toContain(ChannelProductMatchingRepositoryAdapter);
    expect(exports_).not.toContain(CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT);
    expect(exports_).not.toContain(ChannelSkuAvailabilityService);
  });

  it('does not retain generic Operation adapters or the OperationAlert port', () => {
    const channelsRoot = path.resolve(__dirname, '..');
    expect(existsSync(path.join(
      channelsRoot,
      'adapter/in/operation/coupang-rocket-purchase-order.operation-handler.ts',
    ))).toBe(false);
    expect(existsSync(path.join(
      channelsRoot,
      'adapter/out/automation/operation-alert.adapter.ts',
    ))).toBe(false);
    expect(existsSync(path.join(
      channelsRoot,
      'application/port/out/cross-domain/operation-alert.port.ts',
    ))).toBe(false);
  });
});
