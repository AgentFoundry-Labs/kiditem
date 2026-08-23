import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AutomationModule } from '../automation/automation.module';
import { OperationCancellationController } from './adapter/in/http/operation-cancellation.controller';
import { OperationCancellationService } from './application/service/operation-cancellation.service';

@Module({
  imports: [AutomationModule, AiModule],
  controllers: [OperationCancellationController],
  providers: [
    OperationCancellationService,
  ],
})
export class OperationCancellationModule {}
