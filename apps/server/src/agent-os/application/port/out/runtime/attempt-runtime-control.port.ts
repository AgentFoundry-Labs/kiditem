/** Process-local Attempt controls; they never create another durable Attempt. */
export const ATTEMPT_RUNTIME_CONTROL_PORT = Symbol(
  'ATTEMPT_RUNTIME_CONTROL_PORT',
);

export interface AttemptRuntimeControlPort {
  /** Exact opaque source-turn identity; never persisted or forwarded to the CLI. */
  send(input: { attemptId: string; turnId: string; message: string }): Promise<void>;
  interrupt(input: { attemptId: string }): Promise<void>;
}
