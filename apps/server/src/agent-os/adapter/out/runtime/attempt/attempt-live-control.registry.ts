import type { AttemptRuntimeControlPort } from '../../../../application/port/out/runtime/attempt-runtime-control.port';

export interface AttemptLiveControlHandle {
  send(message: string): Promise<void>;
  interrupt(): Promise<void>;
}

/** Deliberately process-local: terminal Attempts can never be resumed. */
export class AttemptLiveControlRegistry implements AttemptRuntimeControlPort {
  private readonly handles = new Map<string, AttemptLiveControlHandle>();

  register(attemptId: string, handle: AttemptLiveControlHandle): void {
    if (this.handles.has(attemptId)) throw new Error('attempt_live_control_exists');
    this.handles.set(attemptId, handle);
  }

  get(attemptId: string): AttemptLiveControlHandle | null {
    return this.handles.get(attemptId) ?? null;
  }

  async send(input: { attemptId: string; message: string }): Promise<void> {
    await this.get(input.attemptId)?.send(input.message);
  }

  async interrupt(input: { attemptId: string }): Promise<void> {
    await this.get(input.attemptId)?.interrupt();
  }

  remove(attemptId: string): void {
    this.handles.delete(attemptId);
  }
}
