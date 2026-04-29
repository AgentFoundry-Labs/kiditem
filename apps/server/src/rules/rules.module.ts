import { Module } from '@nestjs/common';
import { RulesController } from './controllers/rules.controller';
import { AlertsController } from './controllers/alerts.controller';
import { RulesService } from './services/rules.service';
import { AlertsService } from './services/alerts.service';
import { AutomationModule } from '../automation/automation.module';

// EventEmitter2 is injected globally — do NOT import EventEmitterModule.forRoot() here.
// Schedule control of the tenant-owned `rules_evaluation` agent goes through
// `AgentScheduleControlPort` (provided by AutomationModule); RulesController no
// longer injects AgentRegistryService/HeartbeatService directly.
@Module({
  imports: [AutomationModule],
  controllers: [RulesController, AlertsController],
  providers: [RulesService, AlertsService],
})
export class RulesModule {}
