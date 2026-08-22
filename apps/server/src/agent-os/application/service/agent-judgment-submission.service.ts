import { createHash } from 'node:crypto';
import { Injectable, Inject } from '@nestjs/common';
import { CanonicalResourceRefSchema } from '@kiditem/shared/agent-interaction';
import {
  AgentDefinitionNameSchema,
  AgentExecutionIdSchema,
  IdempotencyKeySchema,
  OrganizationNameSchema,
  UserNameSchema,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  formatOperationRunName,
  parseAgentDefinitionName,
  parseOrganizationName,
  parseUserName,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  OperationRunIdSchema,
} from '@kiditem/shared/identifiers';
import { z } from 'zod';
import {
  AGENT_JUDGMENT_SUBMISSION_PORT,
  type AgentJudgmentSubmissionPort,
} from '../port/in/judgment/agent-judgment-submission.port';
import {
  AGENT_JUDGMENT_SUBMISSION_TRANSACTION,
  type AgentJudgmentSubmissionTransactionPort,
} from '../port/out/transaction/session-control/agent-judgment-submission.transaction.port';
import { AgentJudgmentDispatchService } from './session-control/agent-judgment-dispatch.service';
import {
  AUTHORITY_PROFILE_VERSION_ID,
  FOUNDATION_CAPABILITY_KEYS,
  foundationAuthorityProfilePolicyDocument,
  foundationAuthorityProfilePolicyHash,
} from './interaction/interaction-authority-profile';

const objectiveSchema = z.string().trim().min(1).max(8_000);

/** Creates a server-generated, official AgentSession execution for user judgment. */
@Injectable()
export class AgentJudgmentSubmissionService implements AgentJudgmentSubmissionPort {
  constructor(
    @Inject(AGENT_JUDGMENT_SUBMISSION_TRANSACTION)
    private readonly submissions: AgentJudgmentSubmissionTransactionPort,
    private readonly dispatch: AgentJudgmentDispatchService,
  ) {}

  async submit(input: Parameters<AgentJudgmentSubmissionPort['submit']>[0]) {
    const organization = OrganizationNameSchema.parse(input.organization);
    const actor = UserNameSchema.parse(input.actor);
    const agentDefinition = AgentDefinitionNameSchema.parse(input.agentDefinition);
    const parsedObjective = objectiveSchema.safeParse(input.objective);
    if (!parsedObjective.success) throw new Error('AGENT_JUDGMENT_OBJECTIVE_INVALID');
    const objective = parsedObjective.data;
    const resourceRefs = z.array(CanonicalResourceRefSchema).max(50).parse(input.resourceRefs);
    const idempotencyKey = IdempotencyKeySchema.parse(input.idempotencyKey);
    const organizationId = parseOrganizationName(organization).organization;
    const userId = parseUserName(actor).user;
    const definition = parseAgentDefinitionName(agentDefinition).agentDefinitionKey;
    const submitted = await this.submissions.submit({
      organizationId,
      userId,
      agentDefinitionKey: definition,
      objective,
      resourceRefs,
      idempotencyKey,
      fingerprint: digest({ objective, resourceRefs }),
      authorityProfileVersionId: AUTHORITY_PROFILE_VERSION_ID,
      authorityProfilePolicyDocument: foundationAuthorityProfilePolicyDocument(),
      authorityProfilePolicyHash: foundationAuthorityProfilePolicyHash(),
      capabilityKeys: [...FOUNDATION_CAPABILITY_KEYS],
    });
    const dispatched = await this.dispatch.dispatch({
      organizationId,
      sessionId: submitted.sessionId,
      taskId: submitted.taskId,
      executionId: submitted.executionId,
      requestedByUserId: userId,
    });
    return {
      session: formatAgentSessionName(organizationId, AgentSessionIdSchema.parse(submitted.sessionId)),
      task: formatAgentSessionTaskName(organizationId, AgentSessionIdSchema.parse(submitted.sessionId), AgentSessionTaskIdSchema.parse(submitted.taskId)),
      execution: formatAgentExecutionName(organizationId, AgentSessionIdSchema.parse(submitted.sessionId), AgentExecutionIdSchema.parse(submitted.executionId)),
      operation: formatOperationRunName(organizationId, OperationRunIdSchema.parse(dispatched.operationsRunId)),
    };
  }
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export { AGENT_JUDGMENT_SUBMISSION_PORT };
