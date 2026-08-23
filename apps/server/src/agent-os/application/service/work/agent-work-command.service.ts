import { Injectable } from '@nestjs/common';
import type { AgentWorkCommandPort } from '../../port/in/work/agent-work-command.port';
import type { AdmitAttemptInput, AdmitRootAttemptInput, ApprovalDecisionInput, TaskLifecycleTransitionInput, TerminalSessionDeleteInput } from '../../port/out/work/agent-work-transaction.port';
import { AgentAttemptAdmissionService } from './agent-attempt-admission.service';
import { AgentCapabilityApprovalService } from './agent-capability-approval.service';
import { AgentSessionTerminalDeleteService } from './agent-session-terminal-delete.service';
import { AgentTaskLifecycleService } from './agent-task-lifecycle.service';

@Injectable()
export class AgentWorkCommandService implements AgentWorkCommandPort {
  constructor(private readonly admissions: AgentAttemptAdmissionService, private readonly approvals: AgentCapabilityApprovalService, private readonly tasks: AgentTaskLifecycleService, private readonly deletion: AgentSessionTerminalDeleteService) {}
  root(input: AdmitRootAttemptInput) { return this.admissions.root(input); }
  followUp(input: AdmitAttemptInput) { return this.admissions.followUp(input); }
  decide(input: ApprovalDecisionInput) { return this.approvals.decide(input); }
  transition(input: TaskLifecycleTransitionInput) { return this.tasks.transition(input); }
  delete(input: TerminalSessionDeleteInput) { return this.deletion.delete(input); }
}
