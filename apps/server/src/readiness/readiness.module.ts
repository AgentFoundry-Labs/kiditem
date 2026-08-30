import { Module } from '@nestjs/common';
import { ReadinessController } from './readiness.controller';
import { ReadinessStateModule } from './readiness-state.module';

@Module({
  imports: [ReadinessStateModule],
  controllers: [ReadinessController],
  exports: [ReadinessStateModule],
})
export class ReadinessModule {}
