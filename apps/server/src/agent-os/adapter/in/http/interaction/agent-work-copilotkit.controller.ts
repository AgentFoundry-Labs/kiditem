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
import {
  LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT,
  type LiveAttemptExecutionCapabilityPort,
} from '../../../../application/port/in/capability/live-attempt-execution.capability.port';
import {
  LIVE_ATTEMPT_FUTURE_OUTPUT_CAPABILITY_PORT,
  type LiveAttemptFutureOutputCapabilityPort,
} from '../../../../application/port/in/capability/live-attempt-future-output.capability.port';
import {
  AGENT_WORK_INTAKE_PORT,
  AgentWorkIntakeError,
  type AgentWorkIntakePort,
} from '../../../../application/port/in/work/agent-work-intake.port';
import { AGENT_DEFINITIONS } from '../../../../domain/agent-definition.registry';
import { CopilotAgentRunner, CopilotSseRuntime, createCopilotRuntimeHandler } from './copilotkit-v2-runtime';

/** Incoming CopilotKit OSS adapter. It has no durable transcript store. */
@Controller('copilotkit')
export class AgentWorkCopilotKitController {
  constructor(
    @Inject(LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT)
    private readonly executor: LiveAttemptExecutionCapabilityPort,
    @Inject(LIVE_ATTEMPT_FUTURE_OUTPUT_CAPABILITY_PORT)
    private readonly live: LiveAttemptFutureOutputCapabilityPort,
    @Inject(AGENT_WORK_INTAKE_PORT)
    private readonly intake: AgentWorkIntakePort,
  ) {}

  @All(['', '*path'])
  async handle(@CurrentUser() user: AuthUser, @CurrentOrganization() organizationId: string, @Req() request: ExpressRequest, @Res() response: ExpressResponse): Promise<void> {
    const disconnected = new AbortController();
    request.once('aborted', () => disconnected.abort());
    response.once('close', () => { if (!response.writableEnded) disconnected.abort(); });
    const runner = new FutureOnlyRunner(this.executor, this.live);
    const agents = Object.fromEntries(AGENT_DEFINITIONS.map(({ key }) => [
      key,
      new DurableWorkAgent({ organizationId, userId: user.id }, key, this.intake),
    ]));
    const runtime = new CopilotSseRuntime({ agents: agents as never, runner, forwardHeaders: { allow: ['cookie'], deny: ['authorization'], denyPrefixes: ['x-'] } });
    const handler = createCopilotRuntimeHandler({ runtime, basePath: '/api/copilotkit', activateChannels: false });
    let result: globalThis.Response;
    try { result = await handler(toFetchRequest(request, disconnected.signal)); } catch (error) { if (disconnected.signal.aborted || response.destroyed) return; throw error; }
    response.status(result.status); copyHeaders(response, result.headers);
    if (!result.body) { response.end(); return; }
    try { await pipeline(Readable.fromWeb(result.body as never), response, { signal: disconnected.signal }); } catch (error) { if (disconnected.signal.aborted || response.destroyed) return; throw error; }
  }
}

export class DurableWorkAgent extends AbstractAgent {
  constructor(
    private readonly principal: { organizationId: string; userId: string },
    private readonly agentDefinitionKey: string,
    private readonly intake: AgentWorkIntakePort,
  ) { super({ agentId: agentDefinitionKey, description: `KidItem ${agentDefinitionKey}` }); this.run = this.run.bind(this); }

  override run(input: RunAgentInput): Observable<BaseEvent> {
    return defer(async () => {
      if (!isUuid(input.threadId)) throw new BadRequestException('copilotkit_thread_id_invalid');
      const final = input.messages.at(-1);
      if (!final || final.role !== 'user' || typeof final.content !== 'string' || !final.content.trim()) throw new BadRequestException('copilotkit_objective_required');
      try {
        await this.intake.startThread({
          principal: this.principal,
          sessionId: input.threadId,
          agentDefinitionKey: this.agentDefinitionKey,
          prompt: final.content.trim(),
          output: { threadId: input.threadId, runId: input.runId },
        });
      } catch (error) {
        if (error instanceof AgentWorkIntakeError) throw new BadRequestException(error.code);
        throw error;
      }
      return [{ type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId }];
    }).pipe(switchMap((events) => from(events))) as Observable<BaseEvent>;
  }

  override clone(): DurableWorkAgent {
    const clone = super.clone() as DurableWorkAgent;
    Object.assign(clone, {
      principal: this.principal,
      agentDefinitionKey: this.agentDefinitionKey,
      intake: this.intake,
    });
    clone.run = clone.run.bind(clone);
    return clone;
  }
}

class FutureOnlyRunner extends CopilotAgentRunner {
  constructor(private readonly executor: LiveAttemptExecutionCapabilityPort, private readonly live: LiveAttemptFutureOutputCapabilityPort) { super(); }
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

function isUuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function toFetchRequest(request: ExpressRequest, signal: AbortSignal): globalThis.Request { const url = new URL(request.originalUrl, `${request.protocol}://${request.get('host')}`); const headers = new Headers(); for (const [name, value] of Object.entries(request.headers)) { if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry)); else if (value !== undefined) headers.set(name, value); } const init: RequestInit = { method: request.method, headers, signal }; if (request.method !== 'GET' && request.method !== 'HEAD') { const contentType = request.header('content-type') ?? ''; const declared = request.header('content-length') !== undefined || request.header('transfer-encoding') !== undefined || Object.keys(request.body ?? {}).length > 0; if (declared && !contentType.toLowerCase().includes('application/json')) throw new BadRequestException('copilotkit_json_body_required'); if (declared) { const body = JSON.stringify(request.body ?? {}); if (Buffer.byteLength(body, 'utf8') > 1_048_576) throw new BadRequestException('copilotkit_body_too_large'); init.body = body; } } return new globalThis.Request(url, init); }
function copyHeaders(response: ExpressResponse, headers: Headers): void { headers.forEach((value, key) => response.setHeader(key, value)); if (headers.get('content-type')?.toLowerCase().includes('text/event-stream')) { response.setHeader('Cache-Control', 'no-cache, no-transform'); response.setHeader('Content-Encoding', 'identity'); response.setHeader('X-Accel-Buffering', 'no'); response.flushHeaders(); } }
