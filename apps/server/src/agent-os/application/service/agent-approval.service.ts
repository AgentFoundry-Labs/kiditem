import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
} from '../port/in/agent-runner.port';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
  type FindApprovalRequestsQuery,
} from '../port/out/repository/agent-os-repository.port';

export type ResolveAgentApprovalStatus = 'approved' | 'rejected';

export interface ResolveAgentApprovalInput {
  organizationId: string;
  userId: string;
  actorRole: string;
  approvalRequestId: string;
  status: ResolveAgentApprovalStatus;
  decisionReason?: string | null;
}

function assertCanResolveApproval(role: string): void {
  if (role === 'owner' || role === 'admin') return;
  throw new ForbiddenException('agent_approval_resolution_forbidden');
}

@Injectable()
export class AgentApprovalService {
  private readonly logger = new Logger(AgentApprovalService.name);

  constructor(
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
    @Optional()
    @Inject(AGENT_RUNNER_PORT)
    private readonly runner?: AgentRunnerPort,
  ) {}

  async resolveApproval(input: ResolveAgentApprovalInput) {
    assertCanResolveApproval(input.actorRole);

    const approval = await this.repository.findApprovalRequestById({
      organizationId: input.organizationId,
      approvalRequestId: input.approvalRequestId,
    });

    await this.repository.resolveApprovalRequest({
      organizationId: input.organizationId,
      approvalRequestId: input.approvalRequestId,
      status: input.status,
      decidedByUserId: input.userId,
      decisionReason: input.decisionReason?.trim() || null,
    });

    if (input.status === 'approved' && approval?.requestId) {
      this.kickApprovedRequest({
        organizationId: input.organizationId,
        requestId: approval.requestId,
      });
    }

    return {
      approvalRequestId: input.approvalRequestId,
      requestId: approval?.requestId ?? null,
      status: input.status,
    };
  }

  listApprovals(input: FindApprovalRequestsQuery) {
    return this.repository.listApprovalRequests({
      organizationId: input.organizationId,
      agentInstanceId: input.agentInstanceId ?? null,
      status: input.status ?? null,
      cursor: input.cursor ?? null,
      limit: input.limit,
    });
  }

  private kickApprovedRequest(input: {
    organizationId: string;
    requestId: string;
  }): void {
    if (!this.runner?.executeRequest) return;

    void this.runner
      .executeRequest({
        organizationId: input.organizationId,
        requestId: input.requestId,
        workerId: 'agent-os-approval',
      })
      .catch((error) => {
        this.logger.warn(
          `Failed to kick approved Agent OS request ${input.requestId}: ${error}`,
        );
      });
  }
}
