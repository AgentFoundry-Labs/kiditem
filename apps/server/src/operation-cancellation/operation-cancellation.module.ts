import { Module } from '@nestjs/common';
import { AgentOsLegacyRunModule } from '../agent-os/agent-os-legacy-run.module';
import { AiModule } from '../ai/ai.module';
import { AutomationModule } from '../automation/automation.module';
import { OperationCancellationController } from './adapter/in/http/operation-cancellation.controller';
import { OperationCancellationService } from './application/service/operation-cancellation.service';

@Module({
  imports: [AutomationModule, AgentOsLegacyRunModule, AiModule],
  controllers: [OperationCancellationController],
  providers: [OperationCancellationService],
})
export class OperationCancellationModule {}
