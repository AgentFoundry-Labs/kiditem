import { Module } from '@nestjs/common';
import { RulesController } from './controllers/rules.controller';
import { RulesService } from './services/rules.service';
import { AgentOsModule } from '../agent-os/agent-os.module';
import { AutomationModule } from '../automation/automation.module';

// EventEmitter2 is injected globally — do NOT import EventEmitterModule.forRoot() here.
//
// Agent OS wiring (post-`agent-registry` deletion):
// - `AGENT_RUNNER_PORT` (kicks off `rules_evaluation` / `rules_suggest`) and
//   `AgentObservabilityService` (run-request / run status reads) are both
//   provided by `AgentOsModule`. The legacy `AgentScheduleControlPort` was
//   deleted with the old schedule endpoints. Reintroduce scheduling as a new
//   Agent OS surface rather than keeping a 503 compatibility stub.
//
// The /api/alerts/* HTTP surface and `AlertsService` were folded into the
// `automation/` owner domain in Wave H3 AO-2 — they are no longer registered
// here. Rules now owns only `/api/rules/*` evaluation + rule CRUD.
@Module({
  imports: [AgentOsModule, AutomationModule],
  controllers: [RulesController],
  providers: [RulesService],
})
export class RulesModule {}
