import type { GatewayCommand, GatewayCommandBatch, GatewayPoll } from '@kiditem/shared/agent-runtime';
import {
  GATEWAY_PROCESS_REGISTRATION_MISSING,
  GatewayControlHttpError,
} from './gateway-control.client';
import { GatewayCommandDispatcher } from './gateway-command-dispatcher';
import { GatewayEventOutbox } from './gateway-event-outbox';

export interface GatewayControlTransport {
  poll(poll: GatewayPoll): Promise<GatewayCommandBatch | null>;
  postEventBody(body: string): Promise<{ eventSeq: number; accepted: true }>;
  abortInFlight(): void;
}

/** One native process owns the serial poll/dispatch/outbox lifecycle. */
export class NativeGatewayControlSession {
  private runTask: Promise<never> | null = null;
  private shutdownTask: Promise<void> | null = null;
  private stopped = false;
  private resolveStop!: () => void;
  private readonly stopSignal = new Promise<void>((resolve) => { this.resolveStop = resolve; });

  constructor(private readonly options: Readonly<{
    client: GatewayControlTransport;
    dispatcher: Pick<GatewayCommandDispatcher, 'dispatch' | 'clear' | 'resetAfterApiRuntimeRegistration'>;
    outbox: GatewayEventOutbox;
    poll: GatewayPoll;
    onPollLoss: () => void | Promise<void>;
    sleep?: (milliseconds: number) => Promise<void>;
  }>) {}

  run(): Promise<never> {
    if (!this.runTask) this.runTask = this.loop();
    return this.runTask;
  }

  async shutdown(): Promise<void> {
    if (this.shutdownTask) return this.shutdownTask;
    this.stopped = true;
    this.resolveStop();
    this.shutdownTask = (async () => {
      this.options.client.abortInFlight();
      await this.options.onPollLoss();
      this.options.dispatcher.clear();
    })();
    return this.shutdownTask;
  }

  private async loop(): Promise<never> {
    let controlSessionClaimed = false;
    let registrationRecoveryAttempted = false;
    try {
      for (;;) {
        if (this.stopped) throw new GatewayControlStoppedError();
        if (controlSessionClaimed && this.options.outbox.hasPending()) {
          try {
            await this.raceStop(this.options.outbox.flush((body) => this.options.client.postEventBody(body)));
            registrationRecoveryAttempted = false;
          } catch (error) {
            if (error instanceof GatewayControlStoppedError) throw error;
            if (isRegistrationMissing(error) && !registrationRecoveryAttempted) {
              // A restarted API has no in-memory process registry yet. One
              // fresh authenticated poll restores it before this unchanged
              // outbox batch is retried; a second 409 remains terminal.
              registrationRecoveryAttempted = true;
              controlSessionClaimed = false;
              continue;
            }
            if (isTerminalControlError(error)) throw error;
            await this.raceStop(this.sleep(100));
          }
          continue;
        }
        let batch: GatewayCommandBatch | null;
        try {
          batch = await this.raceStop(this.options.client.poll(this.options.poll));
        } catch (error) {
          if (error instanceof GatewayControlStoppedError) throw error;
          if (isTerminalControlError(error)) throw error;
          await this.raceStop(this.sleep(100));
          continue;
        }
        if (batch?.apiRuntimeRegistered) {
          // A failed provider interrupt leaves local execution state
          // indeterminate. It is not a retryable control transport failure.
          await this.raceStop(this.options.dispatcher.resetAfterApiRuntimeRegistration());
        }
        controlSessionClaimed = true;
        if (!batch) continue;
        for (const command of batch.commands) await this.raceStop(this.options.dispatcher.dispatch(command as GatewayCommand));
      }
    } catch (error) {
      const manualShutdown = this.stopped || error instanceof GatewayControlStoppedError;
      await this.shutdown();
      throw new Error(manualShutdown ? 'gateway_control_stopped' : 'gateway_control_lost');
    }
  }

  private sleep(milliseconds: number): Promise<void> {
    return (this.options.sleep ?? ((duration) => new Promise((resolve) => setTimeout(resolve, duration))))(milliseconds);
  }

  private async raceStop<T>(work: Promise<T>): Promise<T> {
    const result = await Promise.race([
      work.then((value) => ({ kind: 'work' as const, value })),
      this.stopSignal.then(() => ({ kind: 'stop' as const })),
    ]);
    if (result.kind === 'stop') throw new GatewayControlStoppedError();
    return result.value;
  }
}

class GatewayControlStoppedError extends Error {}

function isTerminalControlError(error: unknown): boolean {
  return error instanceof GatewayControlHttpError && (error.status === 401 || error.status === 403 || error.status === 409);
}

function isRegistrationMissing(error: unknown): boolean {
  return error instanceof GatewayControlHttpError
    && error.status === 409
    && error.code === GATEWAY_PROCESS_REGISTRATION_MISSING;
}
