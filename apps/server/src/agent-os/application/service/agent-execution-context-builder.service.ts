import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  CanonicalResourceRefSchema,
  UserMessageEventPayloadSchema,
} from '@kiditem/shared/agent-interaction';
import { z } from 'zod';
import {
  AGENT_EXECUTION_CONTEXT_REPOSITORY,
  type AgentExecutionContextRepositoryPort,
} from '../port/out/repository/agent-execution-context.repository.port';
import {
  AGENT_DURABLE_RUNTIME_ASSETS_PORT,
  type AgentDurableRuntimeAssetsPort,
  type AgentDurableRuntimePreStartContext,
} from '../port/out/runtime/agent-durable-runtime.port';
import { AgentRuntimeManifestSchema } from '../../domain/agent-runtime-manifest';
import { AgentOsRuntimeError } from '../../domain/agent-os.errors';
import { AgentCapabilityRegistry } from './agent-capability-registry.service';
import { AgentConversationModelViewService } from './agent-conversation-model-view.service';

const capabilityKeysSchema = z
  .array(z.string().min(1).max(128))
  .refine((keys) => new Set(keys).size === keys.length);
const resourceRefsSchema = z.array(CanonicalResourceRefSchema).max(50);
const currentUserEventSchema = z
  .object({
    externalEventId: z.string().min(1).max(128),
    schemaVersion: z.literal(1),
    payload: UserMessageEventPayloadSchema,
  })
  .strict();

@Injectable()
export class AgentExecutionContextBuilder {
  constructor(
    @Inject(AGENT_EXECUTION_CONTEXT_REPOSITORY)
    private readonly repository: AgentExecutionContextRepositoryPort,
    private readonly modelView: AgentConversationModelViewService,
    @Inject(AGENT_DURABLE_RUNTIME_ASSETS_PORT)
    private readonly assets: AgentDurableRuntimeAssetsPort,
    private readonly capabilities: AgentCapabilityRegistry,
  ) {}

  async build(input: {
    organizationId: string;
    sessionId: string;
    sessionTaskId: string;
    executionId: string;
    attemptId: string;
  }): Promise<AgentDurableRuntimePreStartContext> {
    const graph = await this.repository.loadExecutionGraph(input);
    if (
      !graph ||
      graph.organizationId !== input.organizationId ||
      graph.sessionId !== input.sessionId ||
      graph.sessionTaskId !== input.sessionTaskId ||
      graph.executionId !== input.executionId ||
      graph.attemptId !== input.attemptId ||
      graph.sessionLifecycle !== 'active' ||
      ['completed', 'failed', 'cancelled', 'archived'].includes(graph.taskStatus)
    ) {
      throw new AgentOsRuntimeError(
        'AGENT_EXECUTION_CONTEXT_INVALID',
        'The exact organization-scoped execution graph is unavailable.',
      );
    }
    const manifest = AgentRuntimeManifestSchema.parse(graph.versionManifest);
    if (
      manifest.agentDefinitionKey !== graph.agentDefinitionKey ||
      manifest.runtimeType !== graph.runtimeType ||
      manifest.modelIdentity !== graph.modelIdentity
    ) {
      throw new AgentOsRuntimeError(
        'AGENT_EXECUTION_MANIFEST_MISMATCH',
        'The execution does not match its immutable Agent version manifest.',
      );
    }
    const currentInput = strictRecord(graph.currentInput);
    if (sha256Canonical(currentInput) !== graph.inputHash) {
      throw new AgentOsRuntimeError(
        'AGENT_EXECUTION_INPUT_MISMATCH',
        'The execution input does not match its immutable input hash.',
      );
    }
    const submittedUserEvent = currentUserEventSchema.safeParse(
      currentInput.userEvent,
    );
    const persistedUserEvent = currentUserEventSchema.safeParse({
      externalEventId: graph.currentUserEvent.externalEventId,
      schemaVersion: graph.currentUserEvent.schemaVersion,
      payload: graph.currentUserEvent.payload,
    });
    if (
      !submittedUserEvent.success ||
      !persistedUserEvent.success ||
      graph.currentUserEvent.eventType !== 'user_message' ||
      graph.currentUserEvent.schemaVersion !== 1 ||
      canonicalJson(submittedUserEvent.data.payload) !==
        canonicalJson(persistedUserEvent.data.payload) ||
      submittedUserEvent.data.externalEventId !==
        persistedUserEvent.data.externalEventId
    ) {
      throw new AgentOsRuntimeError(
        'AGENT_EXECUTION_INPUT_MISMATCH',
        'The current user input does not match its canonical event.',
      );
    }
    const policyKeys = capabilityKeysSchema.parse(graph.policyCapabilityKeys);
    const manifestKeys = new Set(manifest.capabilityKeys);
    const capabilityKeys = policyKeys
      .filter((key) => manifestKeys.has(key))
      .sort();
    for (const key of capabilityKeys) {
      if (!this.capabilities.resolve(key)) {
        throw new AgentOsRuntimeError(
          'AGENT_CAPABILITY_NOT_REGISTERED',
          `The execution capability is not registered: ${key}`,
        );
      }
    }
    const promptPackage = await this.assets.resolve({
      agentDefinitionKey: graph.agentDefinitionKey,
      manifest,
    });
    if (
      promptPackage.promptSha256 !== manifest.assets.prompt.sha256 ||
      promptPackage.summaryPromptSha256 !== manifest.assets.summaryPrompt.sha256
    ) {
      throw new AgentOsRuntimeError(
        'AGENT_RUNTIME_ASSET_HASH_MISMATCH',
        'Resolved runtime assets differ from the immutable Agent version.',
      );
    }
    const conversationView = await this.modelView.build({
      organizationId: graph.organizationId,
      sessionId: graph.sessionId,
      executionId: graph.executionId,
      maxTurns: manifest.limits.maxTurns,
      maxContextTokens: manifest.limits.maxContextTokens,
      summaryTargetTokens: manifest.limits.summaryTargetTokens,
      summarizerModelIdentity: manifest.modelIdentity,
      summaryPromptHash: manifest.assets.summaryPrompt.sha256,
    });
    return {
      organizationId: graph.organizationId,
      sessionId: graph.sessionId,
      sessionTaskId: graph.sessionTaskId,
      executionId: graph.executionId,
      attemptId: graph.attemptId,
      agentDefinitionKey: graph.agentDefinitionKey,
      agentVersionId: graph.agentVersionId,
      runtimeType: graph.runtimeType,
      modelIdentity: graph.modelIdentity,
      capabilityKeys,
      policySnapshotId: graph.policySnapshotId,
      promptPackage,
      conversationView,
      currentInput,
      currentResourceRefs: resourceRefsSchema.parse(graph.currentResourceRefs),
    };
  }
}

function strictRecord(value: unknown): Record<string, unknown> {
  return z.record(z.string(), z.unknown()).parse(value);
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(',')}}`;
  }
  throw new AgentOsRuntimeError('AGENT_EXECUTION_INPUT_INVALID');
}
