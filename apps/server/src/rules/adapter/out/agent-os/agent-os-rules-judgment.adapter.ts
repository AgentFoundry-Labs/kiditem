import { Inject, Injectable } from '@nestjs/common';
import {
  AgentDefinitionKeySchema,
  IdempotencyKeySchema,
  OrganizationIdSchema,
  UserIdSchema,
  formatAgentDefinitionName,
  formatOrganizationName,
  formatUserName,
} from '@kiditem/shared/identifiers';
import {
  AGENT_JUDGMENT_SUBMISSION_PORT,
  type AgentJudgmentSubmissionPort,
} from '../../../../agent-os/application/port/in/judgment/agent-judgment-submission.port';
import {
  type RulesJudgmentPort,
} from '../../../application/port/out/cross-domain/rules-judgment.port';

/** Anti-corruption adapter; Rules application code never reaches Agent OS directly. */
@Injectable()
export class AgentOsRulesJudgmentAdapter implements RulesJudgmentPort {
  constructor(
    @Inject(AGENT_JUDGMENT_SUBMISSION_PORT)
    private readonly submissions: AgentJudgmentSubmissionPort,
  ) {}

  submit(input: Parameters<RulesJudgmentPort['submit']>[0]) {
    return this.submissions.submit({
      organization: formatOrganizationName(OrganizationIdSchema.parse(input.organizationId)),
      actor: formatUserName(UserIdSchema.parse(input.actorUserId)),
      agentDefinition: formatAgentDefinitionName(AgentDefinitionKeySchema.parse('rules_suggest')),
      objective: input.objective,
      resourceRefs: [],
      idempotencyKey: IdempotencyKeySchema.parse(input.idempotencyKey),
    });
  }
}
