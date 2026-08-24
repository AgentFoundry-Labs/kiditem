import { All, BadRequestException, Controller, Inject, Req, Res } from '@nestjs/common';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { AbstractAgent, type RunAgentInput } from '@ag-ui/client';
import { EventType, type BaseEvent } from '@ag-ui/core';
import { defer, from, merge, switchMap, type Observable } from 'rxjs';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../../auth/auth.types';
import { AGENT_WORK_QUERY_PORT, type AgentWorkQueryPort } from '../../../../application/port/in/work/agent-work-query.port';
import { AGENT_WORK_COMMAND_PORT, type AgentWorkCommandPort } from '../../../../application/port/in/work/agent-work-command.port';
import {
  LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT,
  type LiveAttemptExecutionCapabilityPort,
} from '../../../../application/port/in/capability/live-attempt-execution.capability.port';
import {
  LIVE_ATTEMPT_FUTURE_OUTPUT_CAPABILITY_PORT,
  type LiveAttemptFutureOutputCapabilityPort,
} from '../../../../application/port/in/capability/live-attempt-future-output.capability.port';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';
import { CopilotAgentRunner, CopilotSseRuntime, createCopilotRuntimeHandler } from './copilotkit-v2-runtime';

/** Incoming CopilotKit OSS adapter. It has no durable transcript store. */
@Controller('copilotkit')
export class AgentWorkCopilotKitController {
  constructor(
    @Inject(AGENT_WORK_QUERY_PORT) private readonly queries: AgentWorkQueryPort,
    @Inject(AGENT_WORK_COMMAND_PORT) private readonly commands: AgentWorkCommandPort,
    @Inject(LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT)
    private readonly executor: LiveAttemptExecutionCapabilityPort,
    @Inject(LIVE_ATTEMPT_FUTURE_OUTPUT_CAPABILITY_PORT)
    private readonly live: LiveAttemptFutureOutputCapabilityPort,
  ) {}

  @All(['', '*path'])
  async handle(@CurrentUser() user: AuthUser, @CurrentOrganization() organizationId: string, @Req() request: ExpressRequest, @Res() response: ExpressResponse): Promise<void> {
    const disconnected = new AbortController();
    request.once('aborted', () => disconnected.abort());
    response.once('close', () => { if (!response.writableEnded) disconnected.abort(); });
    const runner = new FutureOnlyRunner(this.executor, this.live);
    const agent = new DurableWorkAgent({ organizationId, userId: user.id }, this.queries, this.commands, this.executor, (coordinate) => runner.bind(coordinate));
    const runtime = new CopilotSseRuntime({ agents: { operator: agent } as never, runner, forwardHeaders: { allow: ['cookie'], deny: ['authorization'], denyPrefixes: ['x-'] } });
    const handler = createCopilotRuntimeHandler({ runtime, basePath: '/api/copilotkit', activateChannels: false });
    let result: globalThis.Response;
    try { result = await handler(toFetchRequest(request, disconnected.signal)); } catch (error) { if (disconnected.signal.aborted || response.destroyed) return; throw error; }
    response.status(result.status); copyHeaders(response, result.headers);
    if (!result.body) { response.end(); return; }
    try { await pipeline(Readable.fromWeb(result.body as never), response, { signal: disconnected.signal }); } catch (error) { if (disconnected.signal.aborted || response.destroyed) return; throw error; }
  }
}

class DurableWorkAgent extends AbstractAgent {
  constructor(private readonly principal: { organizationId: string; userId: string }, private readonly queries: AgentWorkQueryPort, private readonly commands: AgentWorkCommandPort, private readonly executor: LiveAttemptExecutionCapabilityPort, private readonly admitted: (input: { attemptId: string; threadId: string; runId: string }) => void) { super({ agentId: 'operator', description: 'KidItem Operator' }); this.run = this.run.bind(this); }
  override run(input: RunAgentInput): Observable<BaseEvent> {
    return defer(async () => {
      if (!isUuid(input.threadId)) throw new BadRequestException('copilotkit_thread_id_invalid');
      const final = input.messages.at(-1);
      if (!final || final.role !== 'user' || typeof final.content !== 'string' || !final.content.trim()) throw new BadRequestException('copilotkit_objective_required');
      const version = await this.queries.activeVersion('operator');
      if (!version) throw new BadRequestException('operator_agent_version_not_found');
      const runtime = requiredRuntimeConfig(version.agentDefinitionKey);
      const admitted = await this.admitForThread(input.threadId, final.content.trim(), version, runtime);
      this.admitted({ attemptId: admitted.attemptId, threadId: input.threadId, runId: input.runId });
      await this.executor.start({ attemptId: admitted.attemptId, runtime: version.runtimeType as 'codex_cli' | 'claude_cli', profile: runtime, prompt: admitted.prompt, instructionProfileRef: version.instructionProfileRef, mcp: { attemptId: admitted.attemptId, sessionId: admitted.sessionId, taskId: admitted.taskId, agentVersionId: version.id, organizationId: this.principal.organizationId, userId: this.principal.userId, capabilityKeys: Array.isArray(version.capabilityKeys) ? version.capabilityKeys.filter((key): key is string => typeof key === 'string') : [] } });
      return [{ type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId }];
    }).pipe(switchMap((events) => from(events))) as Observable<BaseEvent>;
  }
  private async admitForThread(threadId: string, prompt: string, version: { id: string }, runtime: { model: string }) {
    try {
      const root = await this.commands.root({ organizationId: this.principal.organizationId, createdByUserId: this.principal.userId, assignedAgentVersionId: version.id, objective: prompt, completionCriteria: 'Provide a concise durable result.', inputResourceRefs: [], input: { prompt }, sessionId: threadId, applicationVersion: requiredEnvironment('KIDITEM_APPLICATION_VERSION'), authorizingGitSha: requiredEnvironment('KIDITEM_GIT_SHA'), cliVersion: requiredEnvironment('KIDITEM_ATTEMPT_CLI_VERSION'), reportedModel: runtime.model });
      return { attemptId: root.attempt.id, sessionId: root.session.id, taskId: root.task.id, prompt };
    } catch (error) {
      if (!(error instanceof AgentOsRuntimeError) || error.code !== 'root_task_already_exists') throw error;
      const predecessor = await this.queries.threadContinuation({ sessionId: threadId, organizationId: this.principal.organizationId, userId: this.principal.userId });
      if (!predecessor?.terminal) throw error;
      const context = await this.queries.continuationContext({ organizationId: this.principal.organizationId, userId: this.principal.userId, sessionId: threadId, taskId: predecessor.taskId, prompt });
      const followUp = await this.commands.followUp({ organizationId: this.principal.organizationId, sessionId: threadId, taskId: predecessor.taskId, requestedByUserId: this.principal.userId, predecessorAttemptId: predecessor.predecessorAttemptId, intent: 'follow_up', input: context.input, applicationVersion: requiredEnvironment('KIDITEM_APPLICATION_VERSION'), authorizingGitSha: requiredEnvironment('KIDITEM_GIT_SHA'), cliVersion: requiredEnvironment('KIDITEM_ATTEMPT_CLI_VERSION'), reportedModel: runtime.model });
      return { attemptId: followUp.attemptId, sessionId: followUp.sessionId, taskId: followUp.taskId, prompt: context.prompt };
    }
  }
  override clone(): DurableWorkAgent { const clone = super.clone() as DurableWorkAgent; Object.assign(clone, { principal: this.principal, queries: this.queries, commands: this.commands, executor: this.executor, admitted: this.admitted }); clone.run = clone.run.bind(clone); return clone; }
}

class FutureOnlyRunner extends CopilotAgentRunner {
  constructor(private readonly executor: LiveAttemptExecutionCapabilityPort, private readonly live: LiveAttemptFutureOutputCapabilityPort) { super(); }
  bind(input: { attemptId: string; threadId: string; runId: string }): void { this.live.bind(input); }
  run(request: { threadId: string; agent: { run(input: unknown): Observable<BaseEvent> }; input: unknown }): Observable<BaseEvent> {
    const runId = (request.input as { runId?: unknown }).runId;
    if (typeof runId !== 'string' || !runId) throw new BadRequestException('copilotkit_run_id_required');
    // Subscribe before launching the agent: a fast terminal process cannot
    // finish between RUN_STARTED and installation of its future-only sink.
    const future = this.live.future({ threadId: request.threadId, runId });
    return merge(request.agent.run(request.input), future);
  }
  connect(request: { threadId: string }) { return this.live.futureThread(request.threadId); }
  async isRunning(request: { threadId: string }) { return this.live.current(request.threadId) !== null; }
  async stop(request: { threadId: string; runId?: string }) {
    const runId = this.live.current(request.threadId, request.runId);
    if (!runId) return false;
    // Resolve only the exact Attempt bound to this Copilot thread/run.
    const attemptId = this.live.attemptId({ threadId: request.threadId, runId });
    if (!attemptId) return false;
    await this.executor.interrupt(attemptId);
    return true;
  }
}

function requiredEnvironment(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`missing_required_configuration:${name}`); return value; }
function isUuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function requiredRuntimeConfig(definitionKey: string): { model: string; loginHome: string } { return { model: requiredEnvironment(`AGENT_${definitionKey.toUpperCase()}_MODEL`), loginHome: requiredEnvironment('KIDITEM_ATTEMPT_LOGIN_HOME') }; }
function toFetchRequest(request: ExpressRequest, signal: AbortSignal): globalThis.Request { const url = new URL(request.originalUrl, `${request.protocol}://${request.get('host')}`); const headers = new Headers(); for (const [name, value] of Object.entries(request.headers)) { if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry)); else if (value !== undefined) headers.set(name, value); } const init: RequestInit = { method: request.method, headers, signal }; if (request.method !== 'GET' && request.method !== 'HEAD') { const contentType = request.header('content-type') ?? ''; const declared = request.header('content-length') !== undefined || request.header('transfer-encoding') !== undefined || Object.keys(request.body ?? {}).length > 0; if (declared && !contentType.toLowerCase().includes('application/json')) throw new BadRequestException('copilotkit_json_body_required'); if (declared) { const body = JSON.stringify(request.body ?? {}); if (Buffer.byteLength(body, 'utf8') > 1_048_576) throw new BadRequestException('copilotkit_body_too_large'); init.body = body; } } return new globalThis.Request(url, init); }
function copyHeaders(response: ExpressResponse, headers: Headers): void { headers.forEach((value, key) => response.setHeader(key, value)); if (headers.get('content-type')?.toLowerCase().includes('text/event-stream')) { response.setHeader('Cache-Control', 'no-cache, no-transform'); response.setHeader('Content-Encoding', 'identity'); response.setHeader('X-Accel-Buffering', 'no'); response.flushHeaders(); } }
