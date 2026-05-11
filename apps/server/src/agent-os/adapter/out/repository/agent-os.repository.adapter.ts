import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  type AgentOsRepositoryPort,
  type AppendRunEventInput,
  type CreateAgentInstanceInput,
  type CreateApprovalRequestInput,
  type CreateAuthorizationEventInput,
  type CreateRunRecordInput,
  type CreateRunRequestRecordInput,
  type FailClaimedRequestInput,
  type FinalizeRunInput,
  type FindAuthorizationEventsQuery,
  type FindCostEventsQuery,
  type FindRequestsQuery,
  type FindRunEventsQuery,
  type FindRunsQuery,
  type MarkRequestStatusInput,
  type RecordCostEventInput,
  type ResolveApprovalRequestInput,
  type UpdateAgentInstanceInput,
  type UpsertInstanceToolPolicyInput,
} from '../../../application/port/out/agent-os-repository.port';
import { type AgentRunStatus } from '../../../domain/agent-os.types';
import { AgentOsApprovalRepository } from './agent-os.approval.repository';
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

  constructor(prisma: PrismaService) {
    this.instances = new AgentOsInstanceSessionRepository(prisma);
    this.requests = new AgentOsRequestRepository(prisma);
    this.runs = new AgentOsRunRepository(prisma);
    this.costAudit = new AgentOsCostAuditRepository(prisma);
    this.approvals = new AgentOsApprovalRepository(prisma);
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

  failClaimedRequest(input: FailClaimedRequestInput) {
    return this.requests.failClaimedRequest(input);
  }

  markRequestStatus(input: MarkRequestStatusInput) {
    return this.requests.markRequestStatus(input);
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

  resolveApprovalRequest(input: ResolveApprovalRequestInput) {
    return this.approvals.resolveApprovalRequest(input);
  }
}
