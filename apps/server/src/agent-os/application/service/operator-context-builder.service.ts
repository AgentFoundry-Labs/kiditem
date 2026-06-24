import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  findAgentDefinitionByType,
  listAgentDefinitions,
} from '../../domain/agent-definition.registry';
import { findAgentSkillByKey } from '../../domain/agent-skill.registry';
import type {
  AgentMessageRecord,
  AgentRunRequestRecord,
} from '../../domain/agent-os.types';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
} from '../port/out/repository/agent-os-repository.port';
import type { AgentOsLiveReadinessResponse } from '@kiditem/shared/agent-os';
import {
  AGENT_OS_LIVE_READINESS_PORT,
  type AgentOsLiveReadinessPort,
} from '../port/out/cross-domain/agent-os-live-readiness.port';
import {
  type AgentPlaybook,
  listAgentPlaybooks,
} from './agent-playbook.registry';
import { AgentRunGraphService } from './agent-run-graph.service';

const OPERATOR_DELEGATION_TARGETS = [
  'sourcing',
  'listing',
  'order',
  'channel_registration',
] as const;

type OperatorDelegationTargetType = (typeof OPERATOR_DELEGATION_TARGETS)[number];

export interface BuildOperatorContextInput {
  organizationId: string;
  conversationId: string;
  requestId: string;
  activeUserMessage?: string | null;
}

export interface OperatorContext {
  instructionText: string;
  conversation: {
    id: string;
    title: string;
    rootRequestId: string | null;
  };
  rootRequest: {
    id: string;
    agentType: string;
    status: string;
    playbookKey: string | null;
    planStepKey: string | null;
    displayName: string | null;
    payload: unknown;
  };
  activeUserMessage: string | null;
  recentMessages: Array<{
    id: string;
    role: string;
    content: string;
    createdAt: string;
  }>;
  runGraph: {
    nodes: unknown[];
    artifacts: unknown[];
    toolInvocations: unknown[];
  };
  liveReadiness: AgentOsLiveReadinessResponse;
  allowedTargetAgents: Array<{
    type: OperatorDelegationTargetType;
    name: string;
    description: string | null;
    defaultSkillKeys: string[];
    skills: Array<{
      key: string;
      name: string;
      description: string;
      mode: string;
    }>;
  }>;
  allowedPlaybooks: Array<{
    key: string;
    steps: AgentPlaybook['steps'];
  }>;
  capabilitySummaries: Array<{
    key: string;
    agentType: string;
    approvalMode: string;
    effect: string;
    dryRunMode: string;
  }>;
  policy: {
    allowedDecisionTypes: ['delegate', 'ask_user', 'refuse'];
    allowedTargetAgentTypes: [
      'sourcing',
      'listing',
      'order',
      'channel_registration',
    ];
    outputFormat: 'strict_json_object';
  };
}

const MAX_RECENT_MESSAGES = 8;
const MAX_STRING_LENGTH = 1_000;
const MAX_OBJECT_KEYS = 40;
const MAX_ARRAY_ITEMS = 20;
const MAX_DEPTH = 5;

const SECRET_KEY_PATTERN =
  /(authorization|cookie|credential|password|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|database[_-]?url|db[_-]?url)/i;

const SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /\b(?:postgres|postgresql|mysql|mongodb):\/\/[^\s"']+/gi,
  /\b(?:bearer\s+)[A-Za-z0-9._~+/-]+=*/gi,
  /\b(?:token|api[_-]?key|access[_-]?token|secret)=([^&\s"']+)/gi,
];

function iso(value: Date | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return '';
}

function sanitizeString(value: string): string {
  const redacted = SECRET_VALUE_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, '[REDACTED]'),
    value,
  );
  if (redacted.length <= MAX_STRING_LENGTH) {
    return redacted;
  }
  return `${redacted.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1));
    return value.length > MAX_ARRAY_ITEMS ? [...items, '[truncated]'] : items;
  }
  if (typeof value === 'object') {
    if (depth >= MAX_DEPTH) return '[truncated]';
    const entries = Object.entries(value as Record<string, unknown>).slice(
      0,
      MAX_OBJECT_KEYS,
    );
    const sanitized = Object.fromEntries(
      entries.map(([key, entry]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : sanitizeValue(entry, depth + 1),
      ]),
    );
    if (Object.keys(value as Record<string, unknown>).length > MAX_OBJECT_KEYS) {
      sanitized.truncated = true;
    }
    return sanitized;
  }
  return String(value);
}

function compactMessage(message: AgentMessageRecord): OperatorContext['recentMessages'][number] {
  return {
    id: message.id,
    role: message.role,
    content: sanitizeString(message.content),
    createdAt: iso(message.createdAt),
  };
}

function compactRootRequest(request: AgentRunRequestRecord): OperatorContext['rootRequest'] {
  return {
    id: request.id,
    agentType: request.agentType,
    status: request.status,
    playbookKey: request.playbookKey,
    planStepKey: request.planStepKey,
    displayName: request.displayName,
    payload: sanitizeValue(request.payload),
  };
}

function allowedTargetAgents(): OperatorContext['allowedTargetAgents'] {
  return OPERATOR_DELEGATION_TARGETS.map((type) => {
    const definition = findAgentDefinitionByType(type);
    const defaultSkillKeys = definition?.defaultSkillKeys ?? [];
    const skills = defaultSkillKeys
      .map((key) => findAgentSkillByKey(key))
      .filter((skill) => skill !== null)
      .map((skill) => ({
        key: skill.key,
        name: skill.name,
        description: skill.description,
        mode: skill.mode,
      }));
    return {
      type,
      name: definition?.name ?? type,
      description: definition?.description ?? null,
      defaultSkillKeys: [...defaultSkillKeys],
      skills,
    };
  });
}

function capabilitySummaries(): OperatorContext['capabilitySummaries'] {
  return listAgentDefinitions()
    .flatMap((definition) =>
      definition.defaultToolPolicies.map((policy) => ({
        key: policy.toolKey,
        agentType: definition.type,
        approvalMode: policy.approvalMode,
        effect: policy.effect,
        dryRunMode: policy.dryRunMode,
      })),
    )
    .sort((left, right) =>
      `${left.agentType}:${left.key}`.localeCompare(`${right.agentType}:${right.key}`),
    );
}

@Injectable()
export class OperatorContextBuilder {
  constructor(
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
    private readonly graphService: AgentRunGraphService,
    @Inject(AGENT_OS_LIVE_READINESS_PORT)
    private readonly liveReadiness: AgentOsLiveReadinessPort,
  ) {}

  async build(input: BuildOperatorContextInput): Promise<OperatorContext> {
    const conversation = await this.repository.findConversationById({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    });
    if (!conversation) {
      throw new NotFoundException('Agent conversation not found');
    }

    const rootRequest = await this.repository.findRunRequestById({
      organizationId: input.organizationId,
      requestId: input.requestId,
    });
    if (
      !rootRequest ||
      rootRequest.organizationId !== input.organizationId ||
      rootRequest.conversationId !== input.conversationId
    ) {
      throw new NotFoundException('Agent root request not found');
    }

    const [messages, graph, liveReadiness] = await Promise.all([
      this.repository.listMessages({
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        limit: 20,
      }),
      this.graphService.getConversationGraph({
        organizationId: input.organizationId,
        conversationId: input.conversationId,
      }),
      this.liveReadiness.getAgentOsLiveStatus(input.organizationId),
    ]);

    const recentMessages = [...messages]
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .slice(-MAX_RECENT_MESSAGES)
      .map(compactMessage);

    return {
      instructionText:
        'Return exactly one strict JSON OperatorDecision object. Do not use markdown, prose, tool calls, or multiple JSON objects.',
      conversation: {
        id: conversation.id,
        title: sanitizeString(conversation.title),
        rootRequestId: conversation.rootRequestId,
      },
      rootRequest: compactRootRequest(rootRequest),
      activeUserMessage: input.activeUserMessage
        ? sanitizeString(input.activeUserMessage)
        : null,
      recentMessages,
      runGraph: {
        nodes: sanitizeValue(graph.nodes) as unknown[],
        artifacts: sanitizeValue(graph.artifacts) as unknown[],
        toolInvocations: sanitizeValue(graph.toolInvocations) as unknown[],
      },
      liveReadiness,
      allowedTargetAgents: allowedTargetAgents(),
      allowedPlaybooks: listAgentPlaybooks().map((playbook) => ({
        key: playbook.key,
        steps: playbook.steps,
      })),
      capabilitySummaries: capabilitySummaries(),
      policy: {
        allowedDecisionTypes: ['delegate', 'ask_user', 'refuse'],
        allowedTargetAgentTypes: [
          'sourcing',
          'listing',
          'order',
          'channel_registration',
        ],
        outputFormat: 'strict_json_object',
      },
    };
  }
}
