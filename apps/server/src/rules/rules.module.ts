import { Module } from '@nestjs/common';
import { RuleEvaluationController } from './controllers/rule-evaluation.controller';
import { RuleSuggestionsController } from './controllers/rule-suggestions.controller';
import { RulesManagementController } from './controllers/rules-management.controller';
import { RulesService } from './services/rules.service';
import { AgentOsApiExecutionModule } from '../agent-os/agent-os-api-execution.module';
import { AgentOsCapabilityModule } from '../agent-os/agent-os-capability.module';
import { AutomationModule } from '../automation/automation.module';
import { OperationsModule } from '../operations/operations.module';
import { RulesOperationAlertAdapter } from './adapter/out/automation/operation-alert.adapter';
import { RULES_OPERATION_ALERT_PORT } from './application/port/out/cross-domain/operation-alert.port';
import { AgentOsRulesJudgmentAdapter } from './adapter/out/agent-os/agent-os-rules-judgment.adapter';
import { RULES_JUDGMENT_PORT } from './application/port/out/cross-domain/rules-judgment.port';
import { APPLY_RULES_EVALUATION_PORT } from './application/port/in/apply-rules-evaluation.port';
import { RulesEvaluationOperationHandler } from './adapter/in/operation/rules-evaluation.operation-handler';
import { RulesEvaluationCapabilityAdapter } from './adapter/in/agent/rules-evaluation-capability.adapter';

// EventEmitter2 is injected globally — do NOT import EventEmitterModule.forRoot() here.
//
// The /api/alerts/* HTTP surface and `AlertsService` were folded into the
// `automation/` owner domain in Wave H3 AO-2 — they are no longer registered
// here. Rules now owns only `/api/rules/*` evaluation + rule CRUD.
@Module({
  imports: [AgentOsApiExecutionModule, AgentOsCapabilityModule, AutomationModule, OperationsModule],
  controllers: [
    RuleEvaluationController,
    RulesManagementController,
    RuleSuggestionsController,
  ],
  providers: [
    RulesService,
    RulesOperationAlertAdapter,
    AgentOsRulesJudgmentAdapter,
    RulesEvaluationOperationHandler,
    RulesEvaluationCapabilityAdapter,
    { provide: RULES_OPERATION_ALERT_PORT, useExisting: RulesOperationAlertAdapter },
    { provide: RULES_JUDGMENT_PORT, useExisting: AgentOsRulesJudgmentAdapter },
    { provide: APPLY_RULES_EVALUATION_PORT, useExisting: RulesService },
  ],
})
export class RulesModule {}
