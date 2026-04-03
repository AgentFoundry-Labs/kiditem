import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { AdvertisingController } from './advertising.controller';
import { AdvertisingService } from './advertising.service';
import { AdCampaignsService } from './ad-campaigns.service';
import { AdStrategyService } from './ad-strategy.service';
import { AdBenchmarkService } from './ad-benchmark.service';
import { AdCollectService } from './ad-collect.service';
import { AdSyncService } from './ad-sync.service';
import { AdActionService } from './ad-action.service';
import { AdExecutionService } from './ad-execution.service';
import { AdConfigService } from './ad-config.service';

@Module({
  controllers: [AdvertisingController],
  providers: [
    AdvertisingService,
    AdCampaignsService,
    AdStrategyService,
    AdBenchmarkService,
    AdCollectService,
    AdSyncService,
    AdActionService,
    AdExecutionService,
    AdConfigService,
  ],
})
export class AdvertisingModule implements OnModuleInit {
  private readonly logger = new Logger(AdvertisingModule.name);

  constructor(private readonly adConfigService: AdConfigService) {}

  async onModuleInit() {
    try {
      const seeded = await this.adConfigService.seedDefaultsForDefaultCompany();
      if (seeded > 0) {
        this.logger.log(`Ad config: ${seeded} default settings seeded`);
      }
    } catch {
      this.logger.warn('Ad config seed skipped (no company found yet)');
    }
  }
}
