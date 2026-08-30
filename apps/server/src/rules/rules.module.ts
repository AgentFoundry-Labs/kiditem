import { Module } from '@nestjs/common';
import { RuleEvaluationController } from './controllers/rule-evaluation.controller';
import { RulesManagementController } from './controllers/rules-management.controller';
import { RulesService } from './services/rules.service';
import { AutomationModule } from '../automation/automation.module';
import { OperationsModule } from '../operations/operations.module';
import { RulesOperationAlertAdapter } from './adapter/out/automation/operation-alert.adapter';
import { RULES_OPERATION_ALERT_PORT } from './application/port/out/cross-domain/operation-alert.port';
import { APPLY_RULES_EVALUATION_PORT } from './application/port/in/apply-rules-evaluation.port';
import { RulesEvaluationOperationHandler } from './adapter/in/operation/rules-evaluation.operation-handler';

// EventEmitter2 is injected globally — do NOT import EventEmitterModule.forRoot() here.
//
// The /api/alerts/* HTTP surface and `AlertsService` were folded into the
// `automation/` owner domain in Wave H3 AO-2 — they are no longer registered
// here. Rules now owns only `/api/rules/*` evaluation + rule CRUD.
@Module({
  imports: [AutomationModule, OperationsModule],
  controllers: [
    RuleEvaluationController,
    RulesManagementController,
  ],
  providers: [
    RulesService,
    RulesOperationAlertAdapter,
    RulesEvaluationOperationHandler,
    { provide: RULES_OPERATION_ALERT_PORT, useExisting: RulesOperationAlertAdapter },
    { provide: APPLY_RULES_EVALUATION_PORT, useExisting: RulesService },
  ],
})
export class RulesModule {}
