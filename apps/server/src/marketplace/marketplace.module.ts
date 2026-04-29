import { Module } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';

/**
 * Marketplace catalog read-side module.
 *
 * The HTTP entry point (`MarketplaceController`) and the side-effecting
 * install/uninstall application service live under the Automation
 * owner-domain (`apps/server/src/automation/`). This module only owns
 * the catalog read service and exports it so the automation HTTP
 * adapter can inject it.
 */
@Module({
  providers: [MarketplaceService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
