import { Module } from '@nestjs/common';
import { RulesController } from './controllers/rules.controller';
import { RulesService } from './services/rules.service';
import { AutomationModule } from '../automation/automation.module';

// EventEmitter2 is injected globally — do NOT import EventEmitterModule.forRoot() here.
// Schedule control of the tenant-owned `rules_evaluation` agent goes through
// `AgentScheduleControlPort` (provided by AutomationModule); RulesController no
// longer injects AgentRegistryService/HeartbeatService directly.
//
// The /api/alerts/* HTTP surface and `AlertsService` were folded into the
// `automation/` owner domain in Wave H3 AO-2 — they are no longer registered
// here. Rules now owns only `/api/rules/*` evaluation + schedule + rule CRUD.
@Module({
  imports: [AutomationModule],
  controllers: [RulesController],
  providers: [RulesService],
})
export class RulesModule {}
