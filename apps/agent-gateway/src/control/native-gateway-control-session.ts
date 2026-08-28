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

type PollWaitResult =
  | Readonly<{ kind: 'poll'; batch: GatewayCommandBatch | null }>
  | Readonly<{ kind: 'outbox' }>;

/** One native process coordinates one command poll with ordered event delivery. */
export class NativeGatewayControlSession {
  private runTask: Promise<never> | null = null;
  private shutdownTask: Promise<void> | null = null;
  private stopped = false;
  private controlFailure: Error | null = null;
  private resolveStop!: () => void;
  private readonly stopSignal = new Promise<void>((resolve) => { this.resolveStop = resolve; });

  constructor(private readonly options: Readonly<{
    client: GatewayControlTransport;
    dispatcher: Pick<GatewayCommandDispatcher, 'dispatch' | 'clear' | 'resetAfterApiRuntimeRegistration'>;
    outbox: GatewayEventOutbox;
    poll: GatewayPoll;
    onApiRuntimeRegistered?: () => void | Promise<void>;
    onPollLoss: () => void | Promise<void>;
    sleep?: (milliseconds: number) => Promise<void>;
  }>) {
    this.options.outbox.onFailure((error) => this.failClosed(error));
  }

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
      try {
        await this.options.onPollLoss();
      } finally {
        this.options.dispatcher.clear();
      }
    })();
    return this.shutdownTask;
  }

  private async loop(): Promise<never> {
    let controlSessionClaimed = false;
    let registrationRecoveryAttempted = false;
    let pollTask: Promise<GatewayCommandBatch | null> | null = null;
    try {
      for (;;) {
        if (this.controlFailure) throw this.controlFailure;
        if (this.stopped) throw new GatewayControlStoppedError();
        if (controlSessionClaimed && this.options.outbox.hasPending()) {
          try {
            await this.raceStop(this.options.outbox.flush((body) => this.options.client.postEventBody(body)));
            registrationRecoveryAttempted = false;
          } catch (error) {
            if (error instanceof GatewayControlStoppedError) throw error;
            if (isRegistrationMissing(error) && !registrationRecoveryAttempted) {
              // A restarted API has no in-memory process registry yet. One
              // fresh authenticated poll must restore it before this unchanged
              // outbox batch is retried; a second 409 remains terminal.
              registrationRecoveryAttempted = true;
              const abandonedPoll = pollTask;
              if (abandonedPoll) {
                this.options.client.abortInFlight();
                try {
                  await this.raceStop(abandonedPoll);
                } catch (pollError) {
                  if (pollError instanceof GatewayControlStoppedError) throw pollError;
                } finally {
                  pollTask = null;
                }
              }
              const registration = await this.raceStop(this.options.client.poll(this.options.poll));
              if (!registration?.apiRuntimeRegistered) {
                throw new Error('gateway_control_registration_recovery_failed');
              }
              await this.raceStop(this.options.dispatcher.resetAfterApiRuntimeRegistration());
              await this.raceStop(Promise.resolve(this.options.onApiRuntimeRegistered?.()));
              controlSessionClaimed = true;
              for (const command of registration.commands) {
                await this.raceStop(this.options.dispatcher.dispatch(command as GatewayCommand));
              }
              continue;
            }
            // An outbox body is retried only after the exact API-restart
            // registration signal above. Any other post uncertainty ends this
            // process-local control session rather than replaying an event.
            throw error;
          }
          continue;
        }
        pollTask ??= this.options.client.poll(this.options.poll);
        let result: PollWaitResult;
        try {
          result = controlSessionClaimed
            ? await this.raceStop(this.waitForPollOrOutbox(pollTask))
            : { kind: 'poll', batch: await this.raceStop(pollTask) };
        } catch (error) {
          pollTask = null;
          if (error instanceof GatewayControlStoppedError) throw error;
          if (isTerminalControlError(error)) throw error;
          await this.raceStop(this.sleep(100));
          continue;
        }
        if (result.kind === 'outbox') continue;
        const batch = result.batch;
        pollTask = null;
        if (batch?.apiRuntimeRegistered) {
          // A failed provider interrupt leaves local execution state
          // indeterminate. It is not a retryable control transport failure.
          await this.raceStop(this.options.dispatcher.resetAfterApiRuntimeRegistration());
          await this.raceStop(Promise.resolve(this.options.onApiRuntimeRegistered?.()));
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

  /** Keep one command long-poll alive while an independent event POST becomes ready. */
  private async waitForPollOrOutbox(
    pollTask: Promise<GatewayCommandBatch | null>,
  ): Promise<PollWaitResult> {
    let unsubscribe = (): void => undefined;
    const pending = new Promise<PollWaitResult>((resolve) => {
      unsubscribe = this.options.outbox.onPending(() => resolve({ kind: 'outbox' }));
    });
    try {
      return await Promise.race([
        pollTask.then((batch): PollWaitResult => ({ kind: 'poll', batch })),
        pending,
      ]);
    } finally {
      unsubscribe();
    }
  }

  private sleep(milliseconds: number): Promise<void> {
    return (this.options.sleep ?? ((duration) => new Promise((resolve) => setTimeout(resolve, duration))))(milliseconds);
  }

  private async raceStop<T>(work: Promise<T>): Promise<T> {
    if (this.controlFailure) throw this.controlFailure;
    if (this.stopped) throw new GatewayControlStoppedError();
    const result = await Promise.race([
      work.then((value) => ({ kind: 'work' as const, value })),
      this.stopSignal.then(() => ({ kind: 'stop' as const })),
    ]);
    if (result.kind === 'stop') {
      if (this.controlFailure) throw this.controlFailure;
      throw new GatewayControlStoppedError();
    }
    return result.value;
  }

  /** An outbox terminal/lifecycle loss is indistinguishable from control loss. */
  private failClosed(error: Error): void {
    if (this.stopped || this.controlFailure) return;
    this.controlFailure = error;
    this.resolveStop();
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
