import { Module } from '@nestjs/common';
import { RulesController } from './controllers/rules.controller';
import { AlertsController } from './controllers/alerts.controller';
import { RulesService } from './services/rules.service';
import { RulesSchedulerService } from './services/rules-scheduler.service';
import { AlertsService } from './services/alerts.service';
import { AgentRegistryModule } from '../agent-registry/agent-registry.module';

@Module({
  imports: [AgentRegistryModule],
  controllers: [RulesController, AlertsController],
  providers: [RulesService, RulesSchedulerService, AlertsService],
})
export class RulesModule {}
