import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  AgentCapabilityExecutionInput,
  AgentCapabilityHandler,
  AgentInteractiveCapabilityExecutionInput,
} from '../../../../agent-os/application/port/out/capability/agent-capability-handler.port';
import { ownerCapabilityContext, ownerCapabilityIdempotencyKey } from '../../../../agent-os/application/port/out/capability/agent-capability-owner-context';
import { AgentCapabilityRegistry } from '../../../../agent-os/application/service/agent-capability-registry.service';
import { AgentOsRuntimeError } from '../../../../agent-os/domain/agent-os.errors';
import {
  SOURCING_AGENT_WORKSPACE_MUTATION_CAPABILITY_PORT,
  SOURCING_AGENT_WORKSPACE_READ_CAPABILITY_PORT,
  type SourcingAgentWorkspaceMutationCapabilityPort,
  type SourcingAgentWorkspaceReadCapabilityPort,
} from '../../../application/port/in/capability/sourcing-agent-workspace-capability.port';
import { canonicalJson } from '../../../domain/sourcing-stable-json';

const EvidenceInput = z.object({
  query: z.string().trim().min(1).max(2_000),
  topK: z.number().int().min(1).max(12).optional(),
  days: z.number().int().min(1).max(30).optional(),
}).strict();

const EvidenceOutput = z.object({
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  documentCount: z.number().int().nonnegative(),
  citationIds: z.array(z.string()),
  dataGaps: z.array(z.string()),
}).strict();

const InspectRunInput = z.object({
  recommendationRunId: z.string().uuid().optional(),
}).strict();

const InspectRunOutput = z.object({
  runId: z.string(),
  status: z.enum(['complete', 'partial', 'failed']),
  businessDate: z.string(),
  itemCount: z.number().int().nonnegative(),
  warningCodes: z.array(z.string()),
  validation: z.object({
    itemCount: z.number().int().nonnegative(),
    missingCount: z.number().int().nonnegative(),
  }).strict(),
}).strict();

const ValidationInput = z.object({
  recommendationRunId: z.string().uuid(),
}).strict();

const ValidationOutput = z.object({
  recommendationRunId: z.string(),
  validationEpisodeIds: z.array(z.string()),
  missingEvidence: z.array(z.string()),
}).strict();

const ReviewItem = z.object({
  itemKey: z.string().trim().min(1),
  expectedVersion: z.number().int().nonnegative(),
}).strict();

const ReviewInput = z.object({
  recommendationRunId: z.string().uuid(),
  workspaceKey: z.enum(['entry', 'final']),
  items: z.array(ReviewItem).min(1).max(100),
}).strict();

const ReviewOutput = z.object({
  reviewBatchId: z.string(),
  itemCount: z.number().int().nonnegative(),
  status: z.string(),
}).strict();

type EvidenceInputType = z.infer<typeof EvidenceInput>;
type InspectRunInputType = z.infer<typeof InspectRunInput>;
type ValidationInputType = z.infer<typeof ValidationInput>;
type ReviewInputType = z.infer<typeof ReviewInput>;

@Injectable()
export class SourcingWorkspaceReadCapabilityAdapter implements OnModuleInit {
  constructor(
    private readonly registry: AgentCapabilityRegistry,
    @Inject(SOURCING_AGENT_WORKSPACE_READ_CAPABILITY_PORT)
    private readonly workspace: SourcingAgentWorkspaceReadCapabilityPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.evidenceHandler());
    this.registry.register(this.inspectRunHandler());
  }

  private evidenceHandler(): AgentCapabilityHandler<EvidenceInputType> {
    const execute = async (
      execution: AgentCapabilityExecutionInput<EvidenceInputType>
        | AgentInteractiveCapabilityExecutionInput<EvidenceInputType>,
    ) => {
      const { organizationId } = ownerCapabilityContext(execution);
      const { input } = execution;
      const result = await this.workspace.retrieveWorkspaceEvidence({
        organizationId,
        ...input,
      });
      return {
        resourceType: 'sourcing_workspace_evidence',
        resourceId: result.inputHash,
        outputSummary: {
          inputHash: result.inputHash,
          documentCount: result.documentCount,
          citationIds: result.documents.map((document) => document.documentId),
          dataGaps: result.dataGaps,
        },
        artifacts: result.documents.map((document) => ({
          artifactType: 'sourcing_evidence_document',
          targetDomain: 'sourcing',
          targetModel: 'SourcingAgentRagDocument',
          targetId: document.documentId,
          title: document.title,
          summary: { ...document },
        })),
      };
    };
    return {
      key: 'sourcing.retrieveWorkspaceEvidence',
      ownerDomain: 'sourcing',
      executionKind: 'tool',
      inputSchema: EvidenceInput,
      outputSchema: EvidenceOutput,
      sideEffects: ['read'],
      approvalRisk: 'none',
      idempotencyKey: () => null,
      execute,
      executeInteractive: execute,
    };
  }

  private inspectRunHandler(): AgentCapabilityHandler<InspectRunInputType> {
    const execute = async (
      execution: AgentCapabilityExecutionInput<InspectRunInputType>
        | AgentInteractiveCapabilityExecutionInput<InspectRunInputType>,
    ) => {
      const { organizationId } = ownerCapabilityContext(execution);
      const { input } = execution;
      const result = await this.workspace.inspectRecommendationRun({
        organizationId,
        recommendationRunId: input.recommendationRunId ?? null,
      });
      return {
        resourceType: 'sourcing_recommendation_run',
        resourceId: result.runId,
        outputSummary: result,
        artifacts: [{
          artifactType: 'recommendation_run',
          targetDomain: 'sourcing',
          targetModel: 'SourcingRecommendationRun',
          targetId: result.runId,
          title: '소싱 추천 실행',
          summary: result,
        }],
      };
    };
    return {
      key: 'sourcing.inspectRecommendationRun',
      ownerDomain: 'sourcing',
      executionKind: 'tool',
      inputSchema: InspectRunInput,
      outputSchema: InspectRunOutput,
      sideEffects: ['read'],
      approvalRisk: 'none',
      idempotencyKey: () => null,
      execute,
      executeInteractive: execute,
    };
  }
}

@Injectable()
export class SourcingWorkspaceMutationCapabilityAdapter
  implements OnModuleInit
{
  constructor(
    private readonly registry: AgentCapabilityRegistry,
    @Inject(SOURCING_AGENT_WORKSPACE_MUTATION_CAPABILITY_PORT)
    private readonly workspace: SourcingAgentWorkspaceMutationCapabilityPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.validationHandler());
    this.registry.register(this.reviewHandler());
  }

  private validationHandler(): AgentCapabilityHandler<ValidationInputType> {
    return {
      key: 'sourcing.refreshValidation',
      ownerDomain: 'sourcing',
      executionKind: 'workflow',
      inputSchema: ValidationInput,
      outputSchema: ValidationOutput,
      sideEffects: ['db_write'],
      approvalRisk: 'none',
      idempotencyKey: (execution) => ownerCapabilityIdempotencyKey(
        execution, `sourcing.refreshValidation:${execution.input.recommendationRunId}`,
      ),
      execute: async (execution) => {
        const { organizationId } = ownerCapabilityContext(execution);
        const { input } = execution;
        const result = await this.workspace.refreshValidation({
          organizationId,
          ...input,
          idempotencyKey: ownerCapabilityIdempotencyKey(
            execution,
            `sourcing.refreshValidation:${execution.input.recommendationRunId}`,
          ),
        });
        return {
          resourceType: 'sourcing_validation',
          resourceId: result.recommendationRunId,
          outputSummary: result,
          artifacts: result.validationEpisodeIds.map((episodeId) => ({
            artifactType: 'validation_episode',
            targetDomain: 'sourcing',
            targetModel: 'SourcingValidationEpisode',
            targetId: episodeId,
            title: '소싱 검증 결과',
            summary: {
              recommendationRunId: result.recommendationRunId,
              episodeId,
            },
          })),
        };
      },
    };
  }

  private reviewHandler(): AgentCapabilityHandler<ReviewInputType> {
    return {
      key: 'sourcing.createReviewBatch',
      ownerDomain: 'sourcing',
      executionKind: 'workflow',
      inputSchema: ReviewInput,
      outputSchema: ReviewOutput,
      sideEffects: ['db_write'],
      approvalRisk: 'low',
      idempotencyKey: (execution) => this.reviewIdempotencyKey(execution),
      execute: async (execution) => {
        const { organizationId, actorId } = ownerCapabilityContext(execution);
        if (!actorId) {
          throw new AgentOsRuntimeError(
            'requested_user_required',
            'Sourcing review handoff requires an authenticated user.',
          );
        }
        const items = normalizeReviewItems(execution.input.items);
        const result = await this.workspace.createReviewBatch({
          organizationId,
          requestedByUserId: actorId,
          recommendationRunId: execution.input.recommendationRunId,
          workspaceKey: execution.input.workspaceKey,
          items,
          idempotencyKey: requireIdempotencyKey(
            this.reviewIdempotencyKey(execution),
          ),
        });
        return {
          resourceType: 'sourcing_review_batch',
          resourceId: result.reviewBatchId,
          outputSummary: result,
          artifacts: [{
            artifactType: 'review_batch',
            targetDomain: 'sourcing',
            targetModel: 'SourcingReviewBatch',
            targetId: result.reviewBatchId,
            title: '소싱 검토 배치',
            summary: result,
          }],
        };
      },
    };
  }

  private reviewIdempotencyKey(
    execution: AgentCapabilityExecutionInput<ReviewInputType>,
  ): string | null {
    const digest = createHash('sha256')
      .update(canonicalJson({
        recommendationRunId: execution.input.recommendationRunId,
        workspaceKey: execution.input.workspaceKey,
        items: normalizeReviewItems(execution.input.items),
      }))
      .digest('hex');
    return ownerCapabilityIdempotencyKey(
      execution, `sourcing.createReviewBatch:${digest}`,
    );
  }
}

function normalizeReviewItems(items: ReviewInputType['items']) {
  return [...items]
    .map((item) => ({
      itemKey: item.itemKey.trim(),
      expectedVersion: item.expectedVersion,
    }))
    .sort((left, right) => left.itemKey.localeCompare(right.itemKey));
}

function requireIdempotencyKey(value: string | null): string {
  if (value) return value;
  throw new AgentOsRuntimeError(
    'agent_request_context_required',
    'Mutating Sourcing capability requires an Agent OS request context.',
  );
}
