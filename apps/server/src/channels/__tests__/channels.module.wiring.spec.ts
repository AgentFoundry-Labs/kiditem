import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AgentOsModule } from '../../agent-os/agent-os.module';
import { AutomationModule } from '../../automation/automation.module';
import { ProductsModule } from '../../products/products.module';
import { ChannelsModule } from '../channels.module';
import { ChannelRegistrationCapabilityAdapter } from '../adapter/in/agent/channel-registration-capability.adapter';
import { ChannelAccountRepositoryAdapter } from '../adapter/out/repository/channel-account.repository.adapter';
import { ChannelDashboardRepositoryAdapter } from '../adapter/out/repository/channel-dashboard.repository.adapter';
import { ChannelListingRepositoryAdapter } from '../adapter/out/repository/channel-listing.repository.adapter';
import { ChannelReconciliationMatcherRepositoryAdapter } from '../adapter/out/repository/channel-reconciliation-matcher.repository.adapter';
import { ChannelReconciliationQueryRepositoryAdapter } from '../adapter/out/repository/channel-reconciliation-query.repository.adapter';
import { ChannelReconciliationResolutionRepositoryAdapter } from '../adapter/out/repository/channel-reconciliation-resolution.repository.adapter';
import { ChannelReconciliationScanRepositoryAdapter } from '../adapter/out/repository/channel-reconciliation-scan.repository.adapter';
import { ChannelSyncRepositoryAdapter } from '../adapter/out/repository/channel-sync.repository.adapter';
import { MarketplaceRegistrationRepositoryAdapter } from '../adapter/out/repository/marketplace-registration.repository.adapter';
import { ChannelsProductMasterBarcodeAdapter } from '../adapter/out/products/product-master-barcode.adapter';
import { CoupangProviderAdapter } from '../adapter/out/coupang/coupang-provider.adapter';
import { ChannelsOperationAlertAdapter } from '../adapter/out/automation/operation-alert.adapter';
import { ChannelRegistrationRuntimeHandler } from '../adapter/out/runtime/channel-registration-runtime.handler';
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
import {
  CHANNEL_RECONCILIATION_MATCHER_PORT,
  CHANNEL_RECONCILIATION_QUERY_REPOSITORY_PORT,
  CHANNEL_RECONCILIATION_RESOLUTION_REPOSITORY_PORT,
  CHANNEL_RECONCILIATION_SCAN_REPOSITORY_PORT,
} from '../application/port/out/repository/channel-reconciliation.repository.port';
import { CHANNEL_SYNC_REPOSITORY_PORT } from '../application/port/out/repository/channel-sync.repository.port';
import { COUPANG_PROVIDER_PORT } from '../application/port/out/provider/coupang-provider.port';
import { CHANNELS_OPERATION_ALERT_PORT } from '../application/port/out/cross-domain/operation-alert.port';
import { CHANNELS_PRODUCT_MASTER_BARCODE_PORT } from '../application/port/out/cross-domain/product-master-barcode.port';
import { ChannelCatalogImportController } from '../adapter/in/http/channel-catalog-import.controller';
import { ChannelCatalogImportRepositoryAdapter } from '../adapter/out/repository/channel-catalog-import.repository.adapter';
import { CHANNEL_CATALOG_IMPORT_PORT } from '../application/port/in/channel-catalog-import.port';
import { CHANNEL_CATALOG_IMPORT_REPOSITORY_PORT } from '../application/port/out/repository/channel-catalog-import.repository.port';
import { ChannelCatalogImportService } from '../application/service/channel-catalog-import.service';

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
  it('imports owner modules for consumer adapters', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, ChannelsModule) ?? [];
    expect(imports).toContain(AgentOsModule);
    expect(imports).toContain(AutomationModule);
    expect(imports).toContain(ProductsModule);
  });

  it('binds every outgoing port to its local adapter', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, ChannelsModule) ?? [];

    expect(providers).toContain(ChannelAccountRepositoryAdapter);
    expect(providers).toContain(ChannelDashboardRepositoryAdapter);
    expect(providers).toContain(ChannelListingRepositoryAdapter);
    expect(providers).toContain(MarketplaceRegistrationRepositoryAdapter);
    expect(providers).toContain(ChannelSyncRepositoryAdapter);
    expect(providers).toContain(ChannelReconciliationMatcherRepositoryAdapter);
    expect(providers).toContain(ChannelReconciliationQueryRepositoryAdapter);
    expect(providers).toContain(ChannelReconciliationResolutionRepositoryAdapter);
    expect(providers).toContain(ChannelReconciliationScanRepositoryAdapter);
    expect(providers).toContain(CoupangProviderAdapter);
    expect(providers).toContain(ChannelsOperationAlertAdapter);
    expect(providers).toContain(ChannelsProductMasterBarcodeAdapter);
    expect(providers).toContain(ChannelRegistrationCapabilityAdapter);
    expect(providers).toContain(ChannelRegistrationRuntimeHandler);
    expect(providers).toContain(ChannelCatalogImportService);
    expect(providers).toContain(ChannelCatalogImportRepositoryAdapter);

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
    expectBinding(
      providers,
      CHANNEL_RECONCILIATION_MATCHER_PORT,
      ChannelReconciliationMatcherRepositoryAdapter,
    );
    expectBinding(
      providers,
      CHANNEL_RECONCILIATION_QUERY_REPOSITORY_PORT,
      ChannelReconciliationQueryRepositoryAdapter,
    );
    expectBinding(
      providers,
      CHANNEL_RECONCILIATION_RESOLUTION_REPOSITORY_PORT,
      ChannelReconciliationResolutionRepositoryAdapter,
    );
    expectBinding(
      providers,
      CHANNEL_RECONCILIATION_SCAN_REPOSITORY_PORT,
      ChannelReconciliationScanRepositoryAdapter,
    );
    expectBinding(providers, COUPANG_PROVIDER_PORT, CoupangProviderAdapter);
    expectBinding(providers, CHANNELS_OPERATION_ALERT_PORT, ChannelsOperationAlertAdapter);
    expectBinding(
      providers,
      CHANNELS_PRODUCT_MASTER_BARCODE_PORT,
      ChannelsProductMasterBarcodeAdapter,
    );
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
  });

  it('registers the account-scoped Wing catalog import controller', () => {
    const controllers: unknown[] =
      Reflect.getMetadata(CONTROLLERS_KEY, ChannelsModule) ?? [];

    expect(controllers).toContain(ChannelCatalogImportController);
  });
});
