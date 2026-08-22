import { Inject, Injectable } from '@nestjs/common';
import {
  formatAgentDefinitionName,
  formatOrganizationName,
  formatUserName,
  AgentDefinitionKeySchema,
  IdempotencyKeySchema,
  OrganizationIdSchema,
  UserIdSchema,
} from '@kiditem/shared/identifiers';
import {
  AGENT_JUDGMENT_SUBMISSION_PORT,
  type AgentJudgmentSubmissionPort,
} from '../../../../agent-os/application/port/in/judgment/agent-judgment-submission.port';
import {
  type AdvertisingJudgmentPort,
} from '../../../application/port/out/cross-domain/advertising-judgment.port';

/** Anti-corruption adapter; Advertising never imports Agent OS from application code. */
@Injectable()
export class AgentOsAdvertisingJudgmentAdapter implements AdvertisingJudgmentPort {
  constructor(
    @Inject(AGENT_JUDGMENT_SUBMISSION_PORT)
    private readonly submissions: AgentJudgmentSubmissionPort,
  ) {}

  submit(input: Parameters<AdvertisingJudgmentPort['submit']>[0]) {
    return this.submissions.submit({
      organization: formatOrganizationName(OrganizationIdSchema.parse(input.organizationId)),
      actor: formatUserName(UserIdSchema.parse(input.actorUserId)),
      agentDefinition: formatAgentDefinitionName(AgentDefinitionKeySchema.parse('ad_strategy')),
      objective: input.objective,
      resourceRefs: input.resourceRefs.map((id) => ({ kind: 'advertising', id, version: null })),
      idempotencyKey: IdempotencyKeySchema.parse(input.idempotencyKey),
    });
  }
}
