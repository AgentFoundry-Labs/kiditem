import { Global, Module } from '@nestjs/common';
import { FeatureGateService } from './feature-gate.service';
import { FeatureGateController } from './feature-gate.controller';

@Global()
@Module({
  controllers: [FeatureGateController],
  providers: [FeatureGateService],
  exports: [FeatureGateService],
})
export class FeatureGateModule {}
