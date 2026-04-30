import { Module } from '@nestjs/common';
import { ProcessingCostsController } from './processing-costs.controller';
import { ProcessingCostsService } from './processing-costs.service';

@Module({
  controllers: [ProcessingCostsController],
  providers: [ProcessingCostsService],
})
export class ProcessingCostsModule {}
