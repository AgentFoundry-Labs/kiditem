import { All, BadRequestException, Controller, Req, Res } from '@nestjs/common';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { AbstractAgent, type RunAgentInput } from '@ag-ui/client';
import { EventType, type BaseEvent } from '@ag-ui/core';
import { defer, from, merge, switchMap, type Observable } from 'rxjs';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../../auth/auth.types';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { AgentAttemptAdmissionService } from '../../../../application/service/work/agent-attempt-admission.service';
import { AgentAttemptExecutorService } from '../../../../adapter/out/runtime/attempt/agent-attempt-executor.service';
import { AttemptFutureOutputChannel } from '../../../../adapter/out/runtime/attempt/attempt-future-output-channel';
import { CopilotAgentRunner, CopilotSseRuntime, createCopilotRuntimeHandler } from './copilotkit-v2-runtime';

/** Incoming CopilotKit OSS adapter. It has no durable conversation/replay store. */
@Controller('copilotkit')
export class AgentWorkCopilotKitController {
  constructor(private readonly prisma: PrismaService, private readonly admissions: AgentAttemptAdmissionService, private readonly executor: AgentAttemptExecutorService, private readonly live: AttemptFutureOutputChannel) {}

  @All(['', '*path'])
  async handle(@CurrentUser() user: AuthUser, @CurrentOrganization() organizationId: string, @Req() request: ExpressRequest, @Res() response: ExpressResponse): Promise<void> {
    const disconnected = new AbortController();
    request.once('aborted', () => disconnected.abort());
    response.once('close', () => { if (!response.writableEnded) disconnected.abort(); });
    const runner = new FutureOnlyRunner(this.executor, this.live);
    const agent = new DurableWorkAgent({ organizationId, userId: user.id }, this.prisma, this.admissions, this.executor, (coordinate) => runner.bind(coordinate));
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
  constructor(private readonly principal: { organizationId: string; userId: string }, private readonly prisma: PrismaService, private readonly admissions: AgentAttemptAdmissionService, private readonly executor: AgentAttemptExecutorService, private readonly admitted: (input: { attemptId: string; threadId: string; runId: string }) => void) { super({ agentId: 'operator', description: 'KidItem Operator' }); this.run = this.run.bind(this); }
  override run(input: RunAgentInput): Observable<BaseEvent> {
    return defer(async () => {
      const final = input.messages.at(-1);
      if (!final || final.role !== 'user' || typeof final.content !== 'string' || !final.content.trim()) throw new BadRequestException('copilotkit_objective_required');
      const version = await this.prisma.agentVersion.findFirst({ where: { agentDefinitionKey: 'operator', activatedAt: { not: null }, retiredAt: null }, orderBy: { activatedAt: 'desc' } });
      if (!version) throw new BadRequestException('operator_agent_version_not_found');
      const runtime = requiredRuntimeConfig();
      const admitted = await this.admissions.root({ organizationId: this.principal.organizationId, createdByUserId: this.principal.userId, assignedAgentVersionId: version.id, objective: final.content.trim(), completionCriteria: 'Provide a concise durable result.', inputResourceRefs: [], input: { prompt: final.content.trim() }, applicationVersion: requiredEnvironment('KIDITEM_APPLICATION_VERSION'), authorizingGitSha: requiredEnvironment('KIDITEM_GIT_SHA'), cliVersion: requiredEnvironment('KIDITEM_ATTEMPT_CLI_VERSION'), reportedModel: runtime.model });
      this.admitted({ attemptId: admitted.attempt.id, threadId: input.threadId, runId: input.runId });
      await this.executor.start({ attemptId: admitted.attempt.id, runtime: version.runtimeType as 'codex_cli' | 'claude_cli', profile: runtime, prompt: final.content.trim(), mcp: { attemptId: admitted.attempt.id, sessionId: admitted.session.id, taskId: admitted.task.id, agentVersionId: version.id, organizationId: this.principal.organizationId, userId: this.principal.userId, capabilityKeys: Array.isArray(version.capabilityKeys) ? version.capabilityKeys.filter((key): key is string => typeof key === 'string') : [] } });
      return [{ type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId }];
    }).pipe(switchMap((events) => from(events))) as Observable<BaseEvent>;
  }
  override clone(): DurableWorkAgent { const clone = super.clone() as DurableWorkAgent; Object.assign(clone, { principal: this.principal, prisma: this.prisma, admissions: this.admissions, executor: this.executor, admitted: this.admitted }); clone.run = clone.run.bind(clone); return clone; }
}

class FutureOnlyRunner extends CopilotAgentRunner {
  constructor(private readonly executor: AgentAttemptExecutorService, private readonly live: AttemptFutureOutputChannel) { super(); }
  bind(input: { attemptId: string; threadId: string; runId: string }): void { this.attempts.set(`${input.threadId}\u0000${input.runId}`, input.attemptId); this.live.bind(input); }
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
    const attemptId = this.attemptId(request.threadId, runId);
    if (!attemptId) return false;
    await this.executor.interrupt(attemptId);
    return true;
  }
  private readonly attempts = new Map<string, string>();
  private attemptId(threadId: string, runId: string): string | null { return this.attempts.get(`${threadId}\u0000${runId}`) ?? null; }
}

function requiredEnvironment(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`missing_required_configuration:${name}`); return value; }
function requiredRuntimeConfig(): { model: string; loginHome: string } { return { model: requiredEnvironment('AGENT_OPERATOR_MODEL'), loginHome: requiredEnvironment('KIDITEM_ATTEMPT_LOGIN_HOME') }; }
function toFetchRequest(request: ExpressRequest, signal: AbortSignal): globalThis.Request { const url = new URL(request.originalUrl, `${request.protocol}://${request.get('host')}`); const headers = new Headers(); for (const [name, value] of Object.entries(request.headers)) { if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry)); else if (value !== undefined) headers.set(name, value); } const init: RequestInit = { method: request.method, headers, signal }; if (request.method !== 'GET' && request.method !== 'HEAD') { const contentType = request.header('content-type') ?? ''; const declared = request.header('content-length') !== undefined || request.header('transfer-encoding') !== undefined || Object.keys(request.body ?? {}).length > 0; if (declared && !contentType.toLowerCase().includes('application/json')) throw new BadRequestException('copilotkit_json_body_required'); if (declared) { const body = JSON.stringify(request.body ?? {}); if (Buffer.byteLength(body, 'utf8') > 1_048_576) throw new BadRequestException('copilotkit_body_too_large'); init.body = body; } } return new globalThis.Request(url, init); }
function copyHeaders(response: ExpressResponse, headers: Headers): void { headers.forEach((value, key) => response.setHeader(key, value)); if (headers.get('content-type')?.toLowerCase().includes('text/event-stream')) { response.setHeader('Cache-Control', 'no-cache, no-transform'); response.setHeader('Content-Encoding', 'identity'); response.setHeader('X-Accel-Buffering', 'no'); response.flushHeaders(); } }
