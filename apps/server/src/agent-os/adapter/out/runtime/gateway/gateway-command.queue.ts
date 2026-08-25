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
import { ExecutionBindingRegistry } from './execution-binding.registry';

const MAX_QUEUED_COMMANDS = 64;

export class GatewaySessionUnavailableError extends Error {
  constructor() { super('gateway_session_unavailable'); }
}

export class GatewaySessionMismatchError extends Error {
  constructor() { super('gateway_session_mismatch'); }
}

export class GatewayRuntimeTrainError extends Error {
  constructor() { super('gateway_runtime_train_invalid'); }
}

interface PendingPoll {
  readonly gatewayInstanceId: string;
  readonly resolve: (batch: GatewayCommandBatch) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly signal?: AbortSignal;
  readonly abort?: () => void;
}

/**
 * A process-memory only command rendezvous for exactly one installed Gateway.
 * It deliberately has no lease, persistence, recovery scan, or continuation.
 */
export class GatewayCommandQueue {
  private gatewayInstanceId: string | null = null;
  private readonly commands: GatewayCommand[] = [];
  private readonly bindingTurnsByCommand = new Map<string, Readonly<{ conversationId: string; turnId: string }>>();
  private pendingPoll: PendingPoll | null = null;

  constructor(private readonly options: Readonly<{
    bindings: Pick<ExecutionBindingRegistry, 'issue' | 'revokeTurn' | 'revokeInstallation'>;
    installationId: string;
    longPollMs?: number;
    onTransientClear?: () => void;
  }>) {}

  /** Claiming a new instance means the old Gateway process is gone: clear all transient state. */
  claim(gatewayInstanceId: string): boolean {
    if (this.gatewayInstanceId === gatewayInstanceId) return false;
    const replaced = this.gatewayInstanceId !== null;
    if (replaced) this.clearTransientState();
    this.gatewayInstanceId = gatewayInstanceId;
    return replaced;
  }

  async poll(input: GatewayPoll, signal?: AbortSignal): Promise<GatewayCommandBatch> {
    const poll = GatewayPollSchema.parse(input);
    this.assertRuntimeTrain(poll);
    this.claim(poll.gatewayInstanceId);
    const immediate = this.currentBatch();
    if (immediate.commands.length) return immediate;
    const longPollMs = this.options.longPollMs ?? GATEWAY_CONTROL_POLL_WAIT_MS;
    if (longPollMs <= 0 || signal?.aborted) return { commands: [] };
    if (this.pendingPoll) throw new GatewaySessionMismatchError();
    return new Promise<GatewayCommandBatch>((resolve) => {
      const finish = (): void => {
        const pending = this.pendingPoll;
        if (!pending) return;
        if (pending.signal && pending.abort) pending.signal.removeEventListener('abort', pending.abort);
        clearTimeout(pending.timer);
        this.pendingPoll = null;
        resolve(this.currentBatch());
      };
      const timer = setTimeout(finish, longPollMs);
      const abort = (): void => {
        this.disconnect(poll.gatewayInstanceId);
        finish();
      };
      this.pendingPoll = { gatewayInstanceId: poll.gatewayInstanceId, resolve, timer, signal, abort };
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

  /**
   * This is the only Nest-side construction path for a turn.start command.
   * The private execution bearer is issued at that point and never reaches a
   * controller, browser response, durable record, or log.
   */
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
    if (!this.gatewayInstanceId) throw new GatewaySessionUnavailableError();
    const binding = this.options.bindings.issue({
      installationId: this.options.installationId,
      organizationId: input.organizationId,
      initiatingUserId: input.initiatingUserId,
      conversationId: input.conversationId,
      turnId: input.turnId,
    });
    const command = GatewayCommandSchema.parse({
      kind: 'turn.start',
      commandId: input.commandId,
      conversationId: input.conversationId,
      turnId: input.turnId,
      message: input.message,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      executionBinding: binding.token,
    });
    if (command.kind !== 'turn.start') throw new Error('gateway_turn_start_command_invalid');
    try {
      this.enqueue(command);
      this.bindingTurnsByCommand.set(command.commandId, { conversationId: command.conversationId, turnId: command.turnId });
    } catch (error) {
      this.options.bindings.revokeTurn({
        installationId: this.options.installationId,
        conversationId: input.conversationId,
        turnId: input.turnId,
      });
      throw error;
    }
  }

  acknowledge(commandId: string): void {
    this.removeCommand(commandId);
  }

  reject(commandId: string): void {
    this.removeCommand(commandId);
    const turn = this.bindingTurnsByCommand.get(commandId);
    this.bindingTurnsByCommand.delete(commandId);
    if (turn) this.revokeTurn(turn);
  }

  /** Terminal, interrupt, or provider-exit event revokes the one live MCP bearer. */
  terminal(conversationId: string, turnId: string): void {
    for (const [commandId, turn] of this.bindingTurnsByCommand) {
      if (turn.conversationId === conversationId && turn.turnId === turnId) this.bindingTurnsByCommand.delete(commandId);
    }
    this.revokeTurn({ conversationId, turnId });
  }

  disconnect(gatewayInstanceId: string): void {
    if (this.gatewayInstanceId !== gatewayInstanceId) return;
    this.clearTransientState();
    this.gatewayInstanceId = null;
  }

  isLiveSession(gatewayInstanceId: string): boolean {
    return this.gatewayInstanceId === gatewayInstanceId;
  }

  private currentBatch(): GatewayCommandBatch {
    return GatewayCommandBatchSchema.parse({ commands: this.commands.slice(0, MAX_QUEUED_COMMANDS) });
  }

  private resolvePendingPoll(): void {
    const pending = this.pendingPoll;
    if (!pending) return;
    if (pending.signal && pending.abort) pending.signal.removeEventListener('abort', pending.abort);
    clearTimeout(pending.timer);
    this.pendingPoll = null;
    pending.resolve(this.currentBatch());
  }

  private clearTransientState(): void {
    this.commands.splice(0);
    this.bindingTurnsByCommand.clear();
    this.options.bindings.revokeInstallation(this.options.installationId);
    this.options.onTransientClear?.();
    this.resolvePendingPoll();
  }

  private removeCommand(commandId: string): void {
    const index = this.commands.findIndex((command) => command.commandId === commandId);
    if (index >= 0) this.commands.splice(index, 1);
  }

  private revokeTurn(turn: Readonly<{ conversationId: string; turnId: string }>): void {
    this.options.bindings.revokeTurn({ installationId: this.options.installationId, ...turn });
  }

  private assertRuntimeTrain(poll: GatewayPoll): void {
    if (JSON.stringify(poll.runtimeTrain) !== JSON.stringify(GATEWAY_RUNTIME_TRAIN)) throw new GatewayRuntimeTrainError();
  }
}
