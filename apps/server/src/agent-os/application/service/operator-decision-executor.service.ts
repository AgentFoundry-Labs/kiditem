import { createHash } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { OperatorDecision } from '@kiditem/shared/agent-os';
import { AgentOsRuntimeError } from '../../domain/agent-os.errors';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
} from '../port/out/repository/agent-os-repository.port';
import {
  AGENT_OS_LIVE_READINESS_PORT,
  type AgentOsLiveReadinessPort,
} from '../port/out/cross-domain/agent-os-live-readiness.port';
import {
  type AgentPlaybook,
  type AgentPlaybookStep,
  findAgentPlaybook,
} from './agent-playbook.registry';
import { AgentPlanValidator } from './agent-plan-validator.service';
import { AgentTaskDelegationService } from './agent-task-delegation.service';

export interface ExecuteOperatorDecisionInput {
  organizationId: string;
  conversationId: string;
  parentRequestId: string;
  delegatedByRunId?: string | null;
  operatorAgentInstanceId?: string | null;
  requestedByUserId?: string | null;
  decision: OperatorDecision;
}

export type OperatorDecisionExecutionResult =
  | {
      status: 'delegated';
      delegatedRequestId: string | null;
      targetAgentType: DelegationTargetAgentType;
      planStepKey: string;
    }
  | { status: 'asked_user'; messageId: string }
  | { status: 'refused'; messageId: string };

type DelegationTargetAgentType =
  | 'sourcing'
  | 'listing'
  | 'order'
  | 'channel_registration';

const TARGET_STEP_KEY = {
  sourcing: 'sourcing_agent',
  listing: 'listing_prep',
  order: 'order_draft',
  channel_registration: 'channel_registration',
} as const;

const TARGET_DISPLAY_NAME = {
  sourcing: 'Sourcing Agent',
  listing: 'Listing Agent',
  order: 'Order Agent',
  channel_registration: 'Channel Registration Agent',
} as const;

function normalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForHash(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeForHash(entry)]),
    );
  }
  return value;
}

function stableHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(normalizeForHash(value)))
    .digest('hex')
    .slice(0, 24);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function recordField(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function findDelegationStep(
  playbook: AgentPlaybook,
  targetAgentType: DelegationTargetAgentType,
): AgentPlaybookStep | null {
  const expectedKey = TARGET_STEP_KEY[targetAgentType];
  const step = playbook.steps.find((candidate) => candidate.key === expectedKey);
  if (step?.agentType === targetAgentType) return step;
  return (
    playbook.steps.find(
      (candidate) =>
        candidate.agentType === targetAgentType && candidate.key !== 'operator',
    ) ?? null
  );
}

function sourcingPayloadForPlaybook(
  playbookKey: string,
  taskInput: Record<string, unknown>,
): Record<string, unknown> {
  if (playbookKey === 'manual_product_intake_from_url_v1') {
    const url = nonEmptyString(taskInput.sourceUrl) ?? nonEmptyString(taskInput.url);
    if (!url) {
      throw new AgentOsRuntimeError(
        'operator_decision_invalid_task_input',
        'manual_product_intake_from_url_v1 requires sourceUrl or url.',
      );
    }
    return {
      ...taskInput,
      action: 'manual_url_intake',
      sourceUrl: url,
      url,
    };
  }

  return {
    ...taskInput,
    action: 'market_opportunity_discovery',
  };
}

function coupangListingSubmissionPayload(
  taskInput: Record<string, unknown>,
): Record<string, unknown> {
  const { listingPayloadJson, ...rest } = taskInput;
  const existingPayload = recordField(taskInput.listingPayload);
  if (existingPayload) {
    return {
      ...rest,
      listingPayload: existingPayload,
      action: 'coupang_listing_submit',
    };
  }

  const json = nonEmptyString(listingPayloadJson);
  if (!json) {
    throw new AgentOsRuntimeError(
      'operator_decision_invalid_task_input',
      'coupang_listing_submission_v1 requires listingPayload or listingPayloadJson.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new AgentOsRuntimeError(
      'operator_decision_invalid_task_input',
      'coupang_listing_submission_v1 listingPayloadJson must be valid JSON.',
    );
  }

  const listingPayload = recordField(parsed);
  if (!listingPayload) {
    throw new AgentOsRuntimeError(
      'operator_decision_invalid_task_input',
      'coupang_listing_submission_v1 listingPayloadJson must decode to an object.',
    );
  }

  return {
    ...rest,
    listingPayload,
    action: 'coupang_listing_submit',
  };
}

function payloadForDelegation(
  targetAgentType: DelegationTargetAgentType,
  playbookKey: string,
  taskInput: Record<string, unknown>,
): Record<string, unknown> {
  if (targetAgentType === 'sourcing') {
    return sourcingPayloadForPlaybook(playbookKey, taskInput);
  }
  if (targetAgentType === 'listing') {
    return {
      ...taskInput,
      action: 'product_listing_generation_package',
    };
  }
  if (targetAgentType === 'channel_registration') {
    if (playbookKey === 'coupang_listing_submission_v1') {
      return coupangListingSubmissionPayload(taskInput);
    }
    return {
      ...taskInput,
      action: 'confirmed_listing_registration',
    };
  }
  if (targetAgentType === 'order' && playbookKey === 'purchase_order_submission_v1') {
    return {
      ...taskInput,
      action: 'submit_purchase_order',
    };
  }
  return taskInput;
}

@Injectable()
export class OperatorDecisionExecutor {
  constructor(
    private readonly delegation: AgentTaskDelegationService,
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
    @Optional()
    private readonly planValidator: AgentPlanValidator = new AgentPlanValidator(),
    @Optional()
    @Inject(AGENT_OS_LIVE_READINESS_PORT)
    private readonly liveReadiness?: AgentOsLiveReadinessPort,
  ) {}

  async execute(
    input: ExecuteOperatorDecisionInput,
  ): Promise<OperatorDecisionExecutionResult> {
    switch (input.decision.decisionType) {
      case 'delegate':
        return this.delegate(input, input.decision);
      case 'ask_user':
        return this.createVisibleAssistantMessage(input, {
          content: input.decision.question,
          metadata: {
            operatorDecision: {
              decisionType: 'ask_user',
              reason: input.decision.reason,
            },
          },
          eventType: 'operator.ask_user_message_created',
          resultStatus: 'asked_user',
        });
      case 'refuse':
        return this.createVisibleAssistantMessage(input, {
          content: input.decision.reason,
          metadata: {
            operatorDecision: {
              decisionType: 'refuse',
            },
          },
          eventType: 'operator.refuse_message_created',
          resultStatus: 'refused',
        });
    }
  }

  private async delegate(
    input: ExecuteOperatorDecisionInput,
    decision: Extract<OperatorDecision, { decisionType: 'delegate' }>,
  ): Promise<OperatorDecisionExecutionResult> {
    const playbook = findAgentPlaybook(decision.playbookKey);
    if (!playbook) {
      throw new AgentOsRuntimeError(
        'operator_decision_unknown_playbook',
        `Operator selected an unknown playbook: ${decision.playbookKey}`,
      );
    }

    const validation = this.planValidator.validate(playbook);
    if (!validation.ok) {
      throw new AgentOsRuntimeError(
        'operator_decision_unauthorized',
        `Operator selected an unauthorized playbook: ${decision.playbookKey}`,
      );
    }

    const step = findDelegationStep(playbook, decision.targetAgentType);
    if (!step) {
      throw new AgentOsRuntimeError(
        'operator_decision_unauthorized',
        `Operator cannot delegate ${decision.playbookKey} to ${decision.targetAgentType}`,
      );
    }
    await this.assertLiveReadiness(input, decision, step);

    const idempotencyKey = [
      'operator',
      input.parentRequestId,
      decision.targetAgentType,
      step.key,
      stableHash(decision.taskInput),
    ].join(':');

    const result = await this.delegation.delegate({
      organizationId: input.organizationId,
      parentAgentType: 'manager',
      agentType: decision.targetAgentType,
      conversationId: input.conversationId,
      parentRequestId: input.parentRequestId,
      delegatedByRunId: input.delegatedByRunId ?? null,
      requestedByUserId: input.requestedByUserId ?? null,
      playbookKey: decision.playbookKey,
      planStepKey: step.key,
      displayName: TARGET_DISPLAY_NAME[decision.targetAgentType],
      idempotencyKey,
      payload: {
        ...payloadForDelegation(
          decision.targetAgentType,
          decision.playbookKey,
          decision.taskInput,
        ),
        conversationId: input.conversationId,
        operatorRationale: decision.userVisibleRationale,
      },
    });

    await this.appendRunEvent(input, {
      type: 'operator.delegated_task_created',
      data: {
        targetAgentType: decision.targetAgentType,
        playbookKey: decision.playbookKey,
        planStepKey: step.key,
        delegatedRequestId: result.requestId ?? null,
      },
    });

    return {
      status: 'delegated',
      delegatedRequestId: result.requestId ?? null,
      targetAgentType: decision.targetAgentType,
      planStepKey: step.key,
    };
  }

  private async assertLiveReadiness(
    input: ExecuteOperatorDecisionInput,
    decision: Extract<OperatorDecision, { decisionType: 'delegate' }>,
    step: AgentPlaybookStep,
  ): Promise<void> {
    if (!step.capabilityKey || !this.liveReadiness) return;
    const capabilityKey = step.capabilityKey;

    const readiness = await this.liveReadiness.getAgentOsLiveStatus(
      input.organizationId,
    );
    if (!readiness.blockedCapabilities.includes(capabilityKey)) return;

    const blockingChecks = readiness.checks.filter(
      (check) =>
        check.requiredFor.includes(capabilityKey) &&
        check.status !== 'ready',
    );
    await this.appendRunEvent(input, {
      type: 'operator.delegation_blocked_by_readiness',
      data: {
        targetAgentType: decision.targetAgentType,
        playbookKey: decision.playbookKey,
        planStepKey: step.key,
        capabilityKey,
        blockedChecks: blockingChecks.map((check) => ({
          key: check.key,
          status: check.status,
          detail: check.detail,
          remediation: check.remediation,
        })),
      },
    });

    const detail =
      blockingChecks
        .map((check) =>
          check.remediation
            ? `${check.detail} ${check.remediation}`
            : check.detail,
        )
        .join(' ') || 'Missing live readiness prerequisite.';
    throw new AgentOsRuntimeError(
      'operator_decision_blocked_by_readiness',
      `Capability ${capabilityKey} is blocked by live readiness. ${detail}`,
    );
  }

  private async createVisibleAssistantMessage(
    input: ExecuteOperatorDecisionInput,
    messageInput: {
      content: string;
      metadata: Record<string, unknown>;
      eventType: string;
      resultStatus: 'asked_user' | 'refused';
    },
  ): Promise<OperatorDecisionExecutionResult> {
    const message = await this.repository.createMessage({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      role: 'assistant',
      content: messageInput.content,
      agentInstanceId: input.operatorAgentInstanceId ?? null,
      requestId: input.parentRequestId,
      runId: input.delegatedByRunId ?? null,
      metadata: messageInput.metadata,
    });

    await this.appendRunEvent(input, {
      type: messageInput.eventType,
      data: {
        messageId: message.id,
        decisionType: messageInput.resultStatus,
      },
    });

    return { status: messageInput.resultStatus, messageId: message.id };
  }

  private async appendRunEvent(
    input: ExecuteOperatorDecisionInput,
    event: { type: string; data: Record<string, unknown> },
  ): Promise<void> {
    if (!input.delegatedByRunId || !input.operatorAgentInstanceId) {
      return;
    }
    await this.repository.appendRunEvent({
      organizationId: input.organizationId,
      runId: input.delegatedByRunId,
      agentInstanceId: input.operatorAgentInstanceId,
      type: event.type,
      data: event.data,
    });
  }
}
