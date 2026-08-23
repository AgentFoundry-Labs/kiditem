import { from, type Observable } from "rxjs";
import type { BaseEvent } from "@ag-ui/core";
import type { AgentAguiRunnerPort } from "../../../../application/port/in/agent-agui-runner.port";
import type { AgentInteractionAuthorizationPort } from "../../../../application/port/in/interaction/agent-interaction-authorization.port";
import type { AgentInteractionLiveEventsPort } from "../../../../application/port/in/interaction/agent-interaction-live-events.port";
import { InteractionReplayStreamProjector } from "../../../../application/port/in/interaction/agent-interaction-replay-projection.contract";
import { AgentOsBoundaryError } from "../../../../domain/agent-os.errors";
import { CopilotAgentRunner } from "./copilotkit-v2-runtime";

interface AgentRunnerRunRequest { agent: { run(input: unknown): Observable<BaseEvent> }; input: unknown; }
interface AgentRunnerConnectRequest { threadId: string; }
interface AgentRunnerIsRunningRequest { threadId: string; }
interface AgentRunnerStopRequest { threadId: string; runId?: string; }

/** Request-bound runner; no process map or mutable principal state. */
export class AgentOsCopilotKitRunner extends CopilotAgentRunner {
  constructor(
    private readonly principal: Readonly<{ organizationId: string; userId: string }>,
    private readonly agentDefinitionKey: string,
    private readonly authorization: AgentInteractionAuthorizationPort,
    private readonly live: AgentInteractionLiveEventsPort,
    private readonly runs: AgentAguiRunnerPort,
    private readonly signal: AbortSignal,
  ) { super(); }
  run(request: AgentRunnerRunRequest): Observable<BaseEvent> {
    return request.agent.run(request.input) as Observable<BaseEvent>;
  }
  connect(request: AgentRunnerConnectRequest): Observable<BaseEvent> {
    return from(this.connectStream(request));
  }

  private async *connectStream(request: AgentRunnerConnectRequest): AsyncIterable<BaseEvent> {
      let afterSequence = "0";
      const projector = new InteractionReplayStreamProjector(request.threadId);
      try {
        while (!this.signal.aborted) {
          const connection = await this.authorization.authorizeConnection({ ...this.principal, agentDefinitionKey: this.agentDefinitionKey, copilotThreadId: request.threadId, afterSequence });
          projector.prime(connection.replay.events as never[]);
          for (const event of connection.replay.events as never[]) {
            yield* projector.project(event, { deferInterrupt: true });
          }
          const nextCursor = connection.replay.nextCursor;
          if (nextCursor !== null && nextCursor !== undefined) {
            const next = BigInt(nextCursor);
            if (next <= BigInt(afterSequence)) throw new AgentOsBoundaryError("INTERACTION_REPLAY_CURSOR_NONPROGRESS");
            afterSequence = nextCursor;
            continue;
          }
          yield* projector.finishReplay();
          if (projector.shouldCloseAfterReplay) return;
          if (!connection.liveCoordinate) return;
          for await (const event of await this.live.open({ coordinate: connection.liveCoordinate, signal: this.signal, projector })) {
            yield event;
          }
          return;
        }
      } catch (error) {
        // CopilotKit connects before a browser-created thread has its first run.
        // The authorization port remains fail-closed; this exposes neither a
        // session-existence signal nor any replay data for that empty thread.
        if (error instanceof AgentOsBoundaryError && error.code === "INTERACTION_CONNECTION_NOT_AUTHORIZED") {
          return;
        }
        throw error;
      }
  }
  async isRunning(request: AgentRunnerIsRunningRequest): Promise<boolean> {
    return (await this.authorization.authorizeCurrentRun({ ...this.principal, agentDefinitionKey: this.agentDefinitionKey, copilotThreadId: request.threadId })) !== null;
  }
  async stop(request: AgentRunnerStopRequest): Promise<boolean> {
    const current = await this.authorization.authorizeCurrentRun({ ...this.principal, agentDefinitionKey: this.agentDefinitionKey, copilotThreadId: request.threadId });
    if (!current || (request.runId && request.runId !== current.aguiRunId)) return false;
    const session = current.session.split("/").at(-1)!;
    const execution = current.execution.split("/").at(-1)!;
    return this.runs.stop({ agentDefinitionKey: this.agentDefinitionKey, copilotThreadId: request.threadId, aguiRunId: current.aguiRunId, sessionId: session, executionId: execution, attemptId: current.attemptId, startIntentId: current.startIntentId });
  }
}
