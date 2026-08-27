import {
  GATEWAY_CONTROL_POLL_WAIT_MS,
  GATEWAY_RUNTIME_TRAIN,
  GatewayCommandBatchSchema,
  GatewayCommandSchema,
  GatewayPollSchema,
  type GatewayCommand,
  type GatewayCommandBatch,
  type GatewayPoll,
} from '@kiditem/shared/agent-runtime';
import { GatewayMcpRuntimeRegistry } from './gateway-mcp-runtime.registry';

const MAX_QUEUED_COMMANDS = 64;

export class GatewaySessionUnavailableError extends Error {
  constructor() { super('gateway_session_unavailable'); }
}

export class GatewaySessionMismatchError extends Error {
  constructor() { super('gateway_session_mismatch'); }
}

/** An event reached a freshly restarted API before this Gateway had polled it. */
export class GatewayProcessRegistrationMissingError extends Error {
  constructor() { super('gateway_process_registration_missing'); }
}

export class GatewayRuntimeTrainError extends Error {
  constructor() { super('gateway_runtime_train_invalid'); }
}

interface PendingPoll {
  readonly gatewayInstanceId: string;
  readonly resolve: (batch: GatewayCommandBatch) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly signal?: AbortSignal;
  readonly abort?: () => void;
}

type LiveTurnCoordinates = Readonly<{ conversationId: string; turnId: string }>;

/**
 * A process-memory command rendezvous for exactly one installed Gateway. It
 * couples a successful authenticated poll to one process-scoped MCP bearer,
 * while the registry alone owns active-turn authority.
 */
export class GatewayCommandQueue {
  private gatewayInstanceId: string | null = null;
  private readonly commands: GatewayCommand[] = [];
  private readonly turnsByCommand = new Map<string, LiveTurnCoordinates>();
  private pendingPoll: PendingPoll | null = null;

  constructor(private readonly options: Readonly<{
    runtime: Pick<GatewayMcpRuntimeRegistry, 'registerProcess' | 'activateTurn' | 'deactivateTurn' | 'disconnect'>;
    installationId: string;
    longPollMs?: number;
    onTransientClear?: () => void;
  }>) {}

  /** Registers/reuses the Gateway process bearer; replacement clears all old live state first. */
  claim(input: GatewayPoll): boolean {
    const poll = GatewayPollSchema.parse(input);
    this.assertRuntimeTrain(poll);
    if (this.gatewayInstanceId === poll.gatewayInstanceId) {
      this.options.runtime.registerProcess({
        installationId: this.options.installationId,
        gatewayInstanceId: poll.gatewayInstanceId,
        mcpTransportToken: poll.mcpTransportToken,
      });
      return false;
    }
    const previousGatewayInstanceId = this.gatewayInstanceId;
    if (previousGatewayInstanceId !== null) {
      this.clearTransientState(new GatewaySessionMismatchError());
      this.options.runtime.disconnect(previousGatewayInstanceId);
    }
    this.options.runtime.registerProcess({
      installationId: this.options.installationId,
      gatewayInstanceId: poll.gatewayInstanceId,
      mcpTransportToken: poll.mcpTransportToken,
    });
    this.gatewayInstanceId = poll.gatewayInstanceId;
    return true;
  }

  async poll(input: GatewayPoll, signal?: AbortSignal): Promise<GatewayCommandBatch> {
    const poll = GatewayPollSchema.parse(input);
    this.assertRuntimeTrain(poll);
    this.claim(poll);
    const immediate = this.currentBatch();
    if (immediate.commands.length) return immediate;
    const longPollMs = this.options.longPollMs ?? GATEWAY_CONTROL_POLL_WAIT_MS;
    if (longPollMs <= 0 || signal?.aborted) return { commands: [] };
    if (this.pendingPoll) throw new GatewaySessionMismatchError();
    return new Promise<GatewayCommandBatch>((resolve, reject) => {
      const finish = (): void => {
        this.resolvePendingPoll();
      };
      const timer = setTimeout(finish, longPollMs);
      const abort = (): void => {
        this.disconnect(poll.gatewayInstanceId);
        finish();
      };
      this.pendingPoll = { gatewayInstanceId: poll.gatewayInstanceId, resolve, reject, timer, signal, abort };
      signal?.addEventListener('abort', abort, { once: true });
    });
  }

  enqueue(input: GatewayCommand): void {
    if (!this.gatewayInstanceId) throw new GatewaySessionUnavailableError();
    const command = GatewayCommandSchema.parse(input);
    if (this.commands.some((queued) => queued.commandId === command.commandId)) return;
    if (this.commands.length >= MAX_QUEUED_COMMANDS) throw new Error('gateway_command_backpressure');
    this.commands.push(command);
    this.resolvePendingPoll();
  }

  /** Atomically establishes Nest authority before issuing the provider turn command. */
  enqueueTurnStart(input: Readonly<{
    organizationId: string;
    initiatingUserId: string;
    commandId: string;
    conversationId: string;
    turnId: string;
    message: string;
    model: string;
    reasoningEffort: string;
  }>): void {
    const gatewayInstanceId = this.gatewayInstanceId;
    if (!gatewayInstanceId) throw new GatewaySessionUnavailableError();
    this.options.runtime.activateTurn({
      installationId: this.options.installationId,
      gatewayInstanceId,
      organizationId: input.organizationId,
      initiatingUserId: input.initiatingUserId,
      conversationId: input.conversationId,
      turnId: input.turnId,
    });
    if (this.hasLiveTurn({ conversationId: input.conversationId, turnId: input.turnId })) return;
    const command = GatewayCommandSchema.parse({
      kind: 'turn.start',
      commandId: input.commandId,
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      turnId: input.turnId,
      message: input.message,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
    });
    if (command.kind !== 'turn.start') throw new Error('gateway_turn_start_command_invalid');
    try {
      this.enqueue(command);
      this.turnsByCommand.set(command.commandId, { conversationId: command.conversationId, turnId: command.turnId });
    } catch (error) {
      this.deactivateTurn({ conversationId: input.conversationId, turnId: input.turnId });
      throw error;
    }
  }

  acknowledge(commandId: string): void {
    this.removeCommand(commandId);
  }

  reject(commandId: string): void {
    this.removeCommand(commandId);
    const turn = this.turnsByCommand.get(commandId);
    this.turnsByCommand.delete(commandId);
    if (turn) this.deactivateTurn(turn);
  }

  /** Only a terminal provider event closes active turn authority. */
  terminal(conversationId: string, turnId: string): void {
    for (const [commandId, turn] of this.turnsByCommand) {
      if (turn.conversationId === conversationId && turn.turnId === turnId) this.turnsByCommand.delete(commandId);
    }
    this.deactivateTurn({ conversationId, turnId });
  }

  disconnect(gatewayInstanceId: string): void {
    if (this.gatewayInstanceId !== gatewayInstanceId) return;
    this.clearTransientState();
    this.options.runtime.disconnect(gatewayInstanceId);
    this.gatewayInstanceId = null;
  }

  isLiveSession(gatewayInstanceId: string): boolean {
    return this.gatewayInstanceId === gatewayInstanceId;
  }

  hasLiveSession(): boolean {
    return this.gatewayInstanceId !== null;
  }

  private currentBatch(): GatewayCommandBatch {
    return GatewayCommandBatchSchema.parse({ commands: this.commands.slice(0, MAX_QUEUED_COMMANDS) });
  }

  private resolvePendingPoll(): void {
    const pending = this.pendingPoll;
    if (!pending) return;
    this.detachPendingPoll(pending);
    pending.resolve(this.currentBatch());
  }

  private rejectPendingPoll(error: Error): void {
    const pending = this.pendingPoll;
    if (!pending) return;
    this.detachPendingPoll(pending);
    pending.reject(error);
  }

  private detachPendingPoll(pending: PendingPoll): void {
    if (this.pendingPoll !== pending) return;
    if (pending.signal && pending.abort) pending.signal.removeEventListener('abort', pending.abort);
    clearTimeout(pending.timer);
    this.pendingPoll = null;
  }

  private clearTransientState(displacedPendingError?: Error): void {
    this.commands.splice(0);
    this.turnsByCommand.clear();
    this.options.onTransientClear?.();
    if (displacedPendingError) this.rejectPendingPoll(displacedPendingError);
    else this.resolvePendingPoll();
  }

  private removeCommand(commandId: string): void {
    const index = this.commands.findIndex((command) => command.commandId === commandId);
    if (index >= 0) this.commands.splice(index, 1);
  }

  private deactivateTurn(turn: LiveTurnCoordinates): void {
    const gatewayInstanceId = this.gatewayInstanceId;
    if (!gatewayInstanceId) return;
    this.options.runtime.deactivateTurn({
      installationId: this.options.installationId,
      gatewayInstanceId,
      ...turn,
    });
  }

  private hasLiveTurn(turn: LiveTurnCoordinates): boolean {
    return [...this.turnsByCommand.values()].some((active) => (
      active.conversationId === turn.conversationId && active.turnId === turn.turnId
    ));
  }

  private assertRuntimeTrain(poll: GatewayPoll): void {
    if (JSON.stringify(poll.runtimeTrain) !== JSON.stringify(GATEWAY_RUNTIME_TRAIN)) throw new GatewayRuntimeTrainError();
  }
}
