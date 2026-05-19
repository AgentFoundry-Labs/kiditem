import { Module } from '@nestjs/common';
import { RuleEvaluationController } from './controllers/rule-evaluation.controller';
import { RuleSuggestionsController } from './controllers/rule-suggestions.controller';
import { RulesManagementController } from './controllers/rules-management.controller';
import { RulesService } from './services/rules.service';
import { AgentOsModule } from '../agent-os/agent-os.module';
import { AutomationModule } from '../automation/automation.module';
import { RulesOperationAlertAdapter } from './adapter/out/automation/operation-alert.adapter';
import { RULES_OPERATION_ALERT_PORT } from './application/port/out/cross-domain/operation-alert.port';

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
  controllers: [
    RuleEvaluationController,
    RulesManagementController,
    RuleSuggestionsController,
  ],
  providers: [
    RulesService,
    RulesOperationAlertAdapter,
    { provide: RULES_OPERATION_ALERT_PORT, useExisting: RulesOperationAlertAdapter },
  ],
})
export class RulesModule {}
