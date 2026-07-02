import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  type AgentOsRepositoryPort,
  type AppendRunEventInput,
  type CompleteToolInvocationWithArtifactsInput,
  type CompleteToolInvocationInput,
  type CreateArtifactInput,
  type CreateAgentInstanceInput,
  type CreateApprovalRequestInput,
  type CreateAuthorizationEventInput,
  type CreateConversationInput,
  type CreateMessageInput,
  type CreateRunRecordInput,
  type CreateRunRequestRecordInput,
  type CreateToolInvocationInput,
  type FailClaimedRequestInput,
  type FinalizeRunInput,
  type FindApprovalRequestsQuery,
  type FindAuthorizationEventsQuery,
  type FindCostEventsQuery,
  type FindRequestsQuery,
  type FindRunEventsQuery,
  type FindRunsQuery,
  type MarkRequestStatusInput,
  type MarkRequestStatusIfCurrentInput,
  type RecordCostEventInput,
  type ResolveApprovalRequestInput,
  type UpdateAgentInstanceInput,
  type UpsertInstanceToolPolicyInput,
} from '../../../application/port/out/repository/agent-os-repository.port';
import { type AgentRunStatus } from '../../../domain/agent-os.types';
import { AgentOsApprovalRepository } from './agent-os.approval.repository';
import { AgentOsConversationRepository } from './agent-os.conversation.repository';
import { AgentOsCostAuditRepository } from './agent-os.cost-audit.repository';
import { AgentOsInstanceSessionRepository } from './agent-os.instance-session.repository';
import { AgentOsRequestRepository } from './agent-os.request.repository';
import { AgentOsRunRepository } from './agent-os.run.repository';

@Injectable()
export class AgentOsRepositoryAdapter implements AgentOsRepositoryPort {
  private readonly instances: AgentOsInstanceSessionRepository;
  private readonly requests: AgentOsRequestRepository;
  private readonly runs: AgentOsRunRepository;
  private readonly costAudit: AgentOsCostAuditRepository;
  private readonly approvals: AgentOsApprovalRepository;
  private readonly conversations: AgentOsConversationRepository;

  constructor(prisma: PrismaService) {
    this.instances = new AgentOsInstanceSessionRepository(prisma);
    this.requests = new AgentOsRequestRepository(prisma);
    this.runs = new AgentOsRunRepository(prisma);
    this.costAudit = new AgentOsCostAuditRepository(prisma);
    this.approvals = new AgentOsApprovalRepository(prisma);
    this.conversations = new AgentOsConversationRepository(prisma);
  }

  // ---- Instances / policy / sessions ------------------------------------
  findActiveInstanceByType(input: { organizationId: string; type: string }) {
    return this.instances.findActiveInstanceByType(input);
  }

  findInstanceById(input: { organizationId: string; id: string }) {
    return this.instances.findInstanceById(input);
  }

  listInstances(input: { organizationId: string }) {
    return this.instances.listInstances(input);
  }

  createInstanceWithRuntimeState(input: CreateAgentInstanceInput) {
    return this.instances.createInstanceWithRuntimeState(input);
  }

  updateInstance(input: UpdateAgentInstanceInput) {
    return this.instances.updateInstance(input);
  }

  resolveInstanceToolPolicy(input: {
    organizationId: string;
    agentInstanceId: string;
    toolKey: string;
  }) {
    return this.instances.resolveInstanceToolPolicy(input);
  }

  listInstanceToolPolicies(input: {
    organizationId: string;
    agentInstanceId: string;
  }) {
    return this.instances.listInstanceToolPolicies(input);
  }

  upsertInstanceToolPolicy(input: UpsertInstanceToolPolicyInput) {
    return this.instances.upsertInstanceToolPolicy(input);
  }

  ensureTaskSession(input: {
    organizationId: string;
    agentInstanceId: string;
    adapterType: string;
    taskKey: string;
    title?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    return this.instances.ensureTaskSession(input);
  }

  getTaskSession(input: {
    organizationId: string;
    taskSessionId: string;
  }) {
    return this.instances.getTaskSession(input);
  }

  updateTaskSessionMetadata(input: {
    organizationId: string;
    taskSessionId: string;
    metadata: Record<string, unknown>;
  }) {
    return this.instances.updateTaskSessionMetadata(input);
  }

  // ---- Requests -----------------------------------------------------------
  createRunRequest(input: CreateRunRequestRecordInput) {
    return this.requests.createRunRequest(input);
  }

  findRunRequestByIdempotency(input: {
    organizationId: string;
    agentInstanceId: string;
    idempotencyKey: string;
  }) {
    return this.requests.findRunRequestByIdempotency(input);
  }

  findRunRequestById(input: { organizationId: string; requestId: string }) {
    return this.requests.findRunRequestById(input);
  }

  listRunRequests(input: FindRequestsQuery) {
    return this.requests.listRunRequests(input);
  }

  claimNextRunRequest(input: {
    workerId: string;
    now: Date;
    organizationId?: string | null;
  }) {
    return this.requests.claimNextRunRequest(input);
  }

  claimRunRequestById(input: {
    workerId: string;
    now: Date;
    organizationId: string;
    requestId: string;
  }) {
    return this.requests.claimRunRequestById(input);
  }

  failClaimedRequest(input: FailClaimedRequestInput) {
    return this.requests.failClaimedRequest(input);
  }

  markRequestStatus(input: MarkRequestStatusInput) {
    return this.requests.markRequestStatus(input);
  }

  markRequestStatusIfCurrent(input: MarkRequestStatusIfCurrentInput) {
    return this.requests.markRequestStatusIfCurrent(input);
  }

  // ---- Runs / events ------------------------------------------------------
  createRunForRequest(input: CreateRunRecordInput) {
    return this.runs.createRunForRequest(input);
  }

  findRunById(input: { organizationId: string; runId: string }) {
    return this.runs.findRunById(input);
  }

  findRunByRequestId(input: {
    organizationId: string;
    requestId: string;
    status?: AgentRunStatus[] | null;
  }) {
    return this.runs.findRunByRequestId(input);
  }

  listRuns(input: FindRunsQuery) {
    return this.runs.listRuns(input);
  }

  appendRunEvent(input: AppendRunEventInput) {
    return this.runs.appendRunEvent(input);
  }

  listRunEvents(input: FindRunEventsQuery) {
    return this.runs.listRunEvents(input);
  }

  finalizeRun(input: FinalizeRunInput) {
    return this.runs.finalizeRun(input);
  }

  // ---- Cost / audit -------------------------------------------------------
  recordCostEvent(input: RecordCostEventInput) {
    return this.costAudit.recordCostEvent(input);
  }

  listCostEvents(input: FindCostEventsQuery) {
    return this.costAudit.listCostEvents(input);
  }

  createAuthorizationEvent(input: CreateAuthorizationEventInput) {
    return this.costAudit.createAuthorizationEvent(input);
  }

  listAuthorizationEvents(input: FindAuthorizationEventsQuery) {
    return this.costAudit.listAuthorizationEvents(input);
  }

  // ---- Approvals ----------------------------------------------------------
  createApprovalRequest(input: CreateApprovalRequestInput) {
    return this.approvals.createApprovalRequest(input);
  }

  findApprovalRequestById(input: {
    organizationId: string;
    approvalRequestId: string;
  }) {
    return this.approvals.findApprovalRequestById(input);
  }

  listApprovalRequests(input: FindApprovalRequestsQuery) {
    return this.approvals.listApprovalRequests(input);
  }

  resolveApprovalRequest(input: ResolveApprovalRequestInput) {
    return this.approvals.resolveApprovalRequest(input);
  }

  // ---- Conversations / visible graph -------------------------------------
  createConversation(input: CreateConversationInput) {
    return this.conversations.createConversation(input);
  }

  findConversationById(input: {
    organizationId: string;
    conversationId: string;
  }) {
    return this.conversations.findConversationById(input);
  }

  listConversations(input: {
    organizationId: string;
    cursor?: string | null;
    limit?: number;
  }) {
    return this.conversations.listConversations(input);
  }

  updateConversationRootRequest(input: {
    organizationId: string;
    conversationId: string;
    rootRequestId: string;
  }) {
    return this.conversations.updateConversationRootRequest(input);
  }

  createMessage(input: CreateMessageInput) {
    return this.conversations.createMessage(input);
  }

  listMessages(input: {
    organizationId: string;
    conversationId: string;
    cursor?: string | null;
    limit?: number;
  }) {
    return this.conversations.listMessages(input);
  }

  createToolInvocation(input: CreateToolInvocationInput) {
    return this.conversations.createToolInvocation(input);
  }

  findToolInvocationByIdempotency(input: {
    organizationId: string;
    capabilityKey: string;
    idempotencyKey: string;
  }) {
    return this.conversations.findToolInvocationByIdempotency(input);
  }

  markToolInvocationRunning(input: {
    organizationId: string;
    invocationId: string;
  }) {
    return this.conversations.markToolInvocationRunning(input);
  }

  completeToolInvocation(input: CompleteToolInvocationInput) {
    return this.conversations.completeToolInvocation(input);
  }

  completeToolInvocationWithArtifacts(
    input: CompleteToolInvocationWithArtifactsInput,
  ) {
    return this.conversations.completeToolInvocationWithArtifacts(input);
  }

  listToolInvocations(input: {
    organizationId: string;
    conversationId?: string | null;
    requestId?: string | null;
    runId?: string | null;
  }) {
    return this.conversations.listToolInvocations(input);
  }

  createArtifact(input: CreateArtifactInput) {
    return this.conversations.createArtifact(input);
  }

  listArtifacts(input: {
    organizationId: string;
    conversationId?: string | null;
    requestId?: string | null;
    runId?: string | null;
    toolInvocationId?: string | null;
    artifactType?: string | null;
  }) {
    return this.conversations.listArtifacts(input);
  }
}
