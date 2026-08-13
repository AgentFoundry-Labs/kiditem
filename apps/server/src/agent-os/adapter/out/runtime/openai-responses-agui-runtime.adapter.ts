import { randomUUID } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventType, type BaseEvent } from '@ag-ui/core';
import { z } from 'zod';
import type {
  AgentAguiRuntimeAdapter,
  AgentAguiRuntimeInput,
} from '../../../application/port/out/runtime/agent-agui-runtime.port';
import { AgentAguiRuntimeRegistry } from '../../../application/service/agent-agui-runtime-registry.service';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import { OpenAiResponsesOperatorRuntimeAdapter } from './openai-responses-operator-runtime.adapter';

const MAX_STEPS = 8;
const RawDecisionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('answer'),
    content: z.string().min(1).max(100_000),
    capabilityKey: z.null(),
    capabilityInputJson: z.null(),
  }).strict(),
  z.object({
    kind: z.literal('capability'),
    content: z.null(),
    capabilityKey: z.string().min(1).max(128),
    capabilityInputJson: z.string().min(2).max(100_000),
  }).strict(),
]);

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'content', 'capabilityKey', 'capabilityInputJson'],
  properties: {
    kind: { type: 'string', enum: ['answer', 'capability'] },
    content: { type: ['string', 'null'] },
    capabilityKey: { type: ['string', 'null'] },
    capabilityInputJson: { type: ['string', 'null'] },
  },
} as const;

@Injectable()
export class OpenAiResponsesAguiRuntimeAdapter
implements AgentAguiRuntimeAdapter, OnModuleInit {
  constructor(
    private readonly registry: AgentAguiRuntimeRegistry,
    private readonly responses: OpenAiResponsesOperatorRuntimeAdapter,
  ) {}

  onModuleInit(): void {
    this.registry.register('copilotkit_agui', this);
  }

  async *run(input: AgentAguiRuntimeInput): AsyncIterable<BaseEvent> {
    yield {
      type: EventType.RUN_STARTED,
      threadId: input.copilotThreadId,
      runId: input.aguiRunId,
    };
    const transcript: Array<Record<string, unknown>> = input.messages.map(
      (message) => ({ role: message.role, content: message.content }),
    );
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const result = await this.responses.decide({
        model: input.modelIdentity,
        outputSchema: OUTPUT_SCHEMA,
        prompt: renderPrompt(input, transcript),
      });
      await input.recordUsage({
        provider: result.provider,
        inputTokens: result.inputTokens ?? 0,
        outputTokens: result.outputTokens ?? 0,
        costMicros: 0n,
      });
      const decision = parseDecision(result.rawOutput);
      if (decision.kind === 'answer') {
        const messageId = randomUUID();
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant',
        };
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: decision.content,
        };
        yield { type: EventType.TEXT_MESSAGE_END, messageId };
        yield {
          type: EventType.RUN_FINISHED,
          threadId: input.copilotThreadId,
          runId: input.aguiRunId,
        };
        return;
      }

      const toolCallId = randomUUID();
      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: decision.capabilityKey,
      };
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        delta: JSON.stringify(decision.capabilityInput),
      };
      const capabilityResult = await input.invokeCapability(
        decision.capabilityKey,
        decision.capabilityInput,
      );
      yield { type: EventType.TOOL_CALL_END, toolCallId };
      const content = JSON.stringify({
        resourceType: capabilityResult.resourceType ?? null,
        resourceId: capabilityResult.resourceId ?? null,
        outputSummary: capabilityResult.outputSummary ?? {},
      });
      yield {
        type: EventType.TOOL_CALL_RESULT,
        messageId: randomUUID(),
        toolCallId,
        content,
        role: 'tool',
      };
      transcript.push(
        {
          role: 'assistant',
          content: JSON.stringify({ capabilityKey: decision.capabilityKey }),
        },
        { role: 'tool', content },
      );
    }
    throw new AgentOsRuntimeError(
      'interaction_step_limit_exceeded',
      'The Operator exceeded the bounded capability loop.',
    );
  }
}

function renderPrompt(
  input: AgentAguiRuntimeInput,
  transcript: Array<Record<string, unknown>>,
): string {
  return [
    'You are the KidItem Operator.',
    'Return only the strict requested JSON decision.',
    'Use kind=capability only when a KidItem read is required; otherwise answer.',
    'Never claim a mutation or capability result without a returned tool result.',
    `Agent: ${input.agentDefinitionKey}`,
    `Allowed capability keys: ${JSON.stringify(input.capabilityKeys)}`,
    `Dashboard context: ${JSON.stringify(input.dashboardContext)}`,
    `Canonical conversation: ${JSON.stringify(transcript)}`,
  ].join('\n');
}

function parseDecision(rawOutput: string):
  | { kind: 'answer'; content: string; capabilityKey: null; capabilityInput: null }
  | { kind: 'capability'; content: null; capabilityKey: string; capabilityInput: Record<string, unknown> } {
  try {
    const parsed = RawDecisionSchema.parse(JSON.parse(rawOutput));
    if (parsed.kind === 'answer') {
      return { ...parsed, capabilityInput: null };
    }
    const capabilityInput = z.record(z.unknown()).parse(
      JSON.parse(parsed.capabilityInputJson),
    );
    return {
      kind: parsed.kind,
      content: parsed.content,
      capabilityKey: parsed.capabilityKey,
      capabilityInput,
    };
  } catch {
    throw new AgentOsRuntimeError(
      'interaction_runtime_output_invalid',
      'The Operator returned an invalid structured decision.',
    );
  }
}
