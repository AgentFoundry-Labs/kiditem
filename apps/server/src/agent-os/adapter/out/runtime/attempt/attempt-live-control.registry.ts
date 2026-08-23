export interface AttemptLiveControlHandle {
  send(message: string): Promise<void>;
  interrupt(): Promise<void>;
}

/** Deliberately process-local: terminal Attempts can never be resumed. */
export class AttemptLiveControlRegistry {
  private readonly handles = new Map<string, AttemptLiveControlHandle>();

  register(attemptId: string, handle: AttemptLiveControlHandle): void {
    if (this.handles.has(attemptId)) throw new Error('attempt_live_control_exists');
    this.handles.set(attemptId, handle);
  }

  get(attemptId: string): AttemptLiveControlHandle | null {
    return this.handles.get(attemptId) ?? null;
  }

  remove(attemptId: string): void {
    this.handles.delete(attemptId);
  }
}
