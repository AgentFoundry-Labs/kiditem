import { createHash } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { AgentConversationEventContentSchema } from '@kiditem/shared/agent-interaction';
import {
  AGENT_CONVERSATION_MODEL_VIEW_REPOSITORY,
  type AgentConversationModelViewRepositoryPort,
  type CanonicalModelEventRecord,
} from '../port/out/repository/agent-conversation-model-view.repository.port';
import type {
  RuntimeConversationTurn,
  VersionedConversationSummary,
} from '../port/out/runtime/agent-durable-runtime.port';
import { AgentOsRuntimeError } from '../../domain/agent-os.errors';

export const AGENT_CONVERSATION_SUMMARIZER = Symbol(
  'AGENT_CONVERSATION_SUMMARIZER',
);

export interface AgentConversationSummarizer {
  summarize(input: {
    modelIdentity: string;
    promptHash: string;
    targetTokens: number;
    turns: RuntimeConversationTurn[];
  }): Promise<string>;
}

export interface BuildAgentConversationModelViewInput {
  organizationId: string;
  sessionId: string;
  executionId: string;
  maxTurns: number;
  maxContextTokens: number;
  summaryTargetTokens: number;
  summarizerModelIdentity: string;
  summaryPromptHash: string;
}

export interface AgentConversationModelView {
  throughSequence: string;
  summary: VersionedConversationSummary | null;
  turns: RuntimeConversationTurn[];
}

@Injectable()
export class AgentConversationModelViewService {
  constructor(
    @Inject(AGENT_CONVERSATION_MODEL_VIEW_REPOSITORY)
    private readonly repository: AgentConversationModelViewRepositoryPort,
    @Optional()
    @Inject(AGENT_CONVERSATION_SUMMARIZER)
    private readonly summarizer?: AgentConversationSummarizer,
  ) {}

  async build(
    input: BuildAgentConversationModelViewInput,
  ): Promise<AgentConversationModelView> {
    const events = await this.repository.listCanonicalEvents({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
    });
    assertStrictSequence(events);
    const turns = modelTurns(events);
    const throughSequence = events.at(-1)?.sequence.toString() ?? '0';
    if (
      turns.length <= input.maxTurns &&
      estimateTokens(turns) <= input.maxContextTokens
    ) {
      return { throughSequence, summary: null, turns };
    }

    if (!this.summarizer) {
      throw new AgentOsRuntimeError(
        'AGENT_CONTEXT_SUMMARIZER_NOT_CONFIGURED',
        'Context overflow requires the exact configured summary runtime.',
      );
    }
    const laterTokenBudget = Math.max(
      0,
      input.maxContextTokens - input.summaryTargetTokens,
    );
    let summarizeCount = 1;
    while (
      summarizeCount < turns.length &&
      (turns.length - summarizeCount > input.maxTurns ||
        estimateTokens(turns.slice(summarizeCount)) > laterTokenBudget)
    ) {
      summarizeCount += 1;
    }
    const sourceTurns = turns.slice(0, summarizeCount);
    const laterTurns = turns.slice(summarizeCount);
    const sourceFromSequence = BigInt(sourceTurns[0].throughSequence);
    const sourceThroughSequence = BigInt(
      sourceTurns[sourceTurns.length - 1].throughSequence,
    );
    const sourceHash = hashCanonical(sourceTurns);
    const lookup = {
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      sourceFromSequence,
      sourceThroughSequence,
      sourceHash,
      summarizerModelIdentity: input.summarizerModelIdentity,
      summaryPromptHash: input.summaryPromptHash,
    };
    let summary = await this.repository.findConversationSummary(lookup);
    if (!summary) {
      const content = (await this.summarizer.summarize({
        modelIdentity: input.summarizerModelIdentity,
        promptHash: input.summaryPromptHash,
        targetTokens: input.summaryTargetTokens,
        turns: sourceTurns.map((turn) => ({ ...turn })),
      })).trim();
      if (!content || content.length > input.summaryTargetTokens * 8) {
        throw new AgentOsRuntimeError(
          'AGENT_CONTEXT_SUMMARY_INVALID',
          'Conversation summary is empty or exceeds its configured bound.',
        );
      }
      summary = await this.repository.createConversationSummary({
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        executionId: input.executionId,
        summary: {
          sourceFromSequence: sourceFromSequence.toString(),
          sourceThroughSequence: sourceThroughSequence.toString(),
          sourceHash,
          summarizerModelIdentity: input.summarizerModelIdentity,
          summaryPromptHash: input.summaryPromptHash,
          content,
        },
      });
    }
    return { throughSequence, summary, turns: laterTurns };
  }
}

function modelTurns(events: CanonicalModelEventRecord[]): RuntimeConversationTurn[] {
  const turns: RuntimeConversationTurn[] = [];
  let openAssistant: RuntimeConversationTurn | null = null;
  for (const event of events) {
    const content = AgentConversationEventContentSchema.parse({
      eventType: event.eventType,
      schemaVersion: event.schemaVersion ?? 1,
      payload: event.payload,
    });
    if (content.eventType === 'user_message') {
      if (openAssistant) throw invalidStream();
      turns.push({
        role: 'user',
        content: content.payload.content,
        throughSequence: event.sequence.toString(),
      });
      continue;
    }
    if (content.eventType === 'assistant_message') {
      const phase = 'phase' in content.payload ? content.payload.phase : 'complete';
      if (phase === 'complete') {
        if (openAssistant) throw invalidStream();
        if (!('content' in content.payload)) throw invalidStream();
        turns.push({ role: 'assistant', content: content.payload.content,
          throughSequence: event.sequence.toString() });
      } else if (phase === 'start') {
        if (openAssistant) throw invalidStream();
        openAssistant = { role: 'assistant', content: '', throughSequence: event.sequence.toString() };
      } else if (phase === 'delta') {
        if (!openAssistant || !('content' in content.payload)) throw invalidStream();
        openAssistant.content += content.payload.content;
        openAssistant.throughSequence = event.sequence.toString();
      } else {
        if (!openAssistant || !openAssistant.content) throw invalidStream();
        openAssistant.throughSequence = event.sequence.toString();
        turns.push(openAssistant);
        openAssistant = null;
      }
      continue;
    }
    if (content.eventType === 'tool_activity') {
      if (openAssistant) throw invalidStream();
      turns.push({
        role: 'tool',
        content: `${content.payload.toolName}:${content.payload.status}`,
        throughSequence: event.sequence.toString(),
        toolName: content.payload.toolName,
        toolStatus: content.payload.status,
      });
    }
    // UI state, navigation, notices, HITL presentation, and terminal events are
    // intentionally not model context.
  }
  if (openAssistant) throw invalidStream();
  return turns;
}

function assertStrictSequence(events: CanonicalModelEventRecord[]): void {
  let previous = 0n;
  for (const event of events) {
    if (event.sequence <= previous) {
      throw new AgentOsRuntimeError(
        'AGENT_CONTEXT_SEQUENCE_INVALID',
        'Canonical conversation events must be strictly ordered.',
      );
    }
    previous = event.sequence;
  }
}

function invalidStream(): AgentOsRuntimeError {
  return new AgentOsRuntimeError(
    'AGENT_CONTEXT_MESSAGE_STREAM_INVALID',
    'Canonical assistant message stream is invalid.',
  );
}

function estimateTokens(turns: RuntimeConversationTurn[]): number {
  return turns.reduce(
    (total, turn) => total + Math.ceil(turn.content.length / 4) + 8,
    0,
  );
}

function hashCanonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(',')}}`;
  }
  throw new AgentOsRuntimeError('AGENT_CONTEXT_EVENT_INVALID');
}
