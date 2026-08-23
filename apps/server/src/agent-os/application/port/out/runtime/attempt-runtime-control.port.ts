/** Process-local Attempt controls; they never create durable successor work. */
export const ATTEMPT_RUNTIME_CONTROL_PORT = Symbol(
  'ATTEMPT_RUNTIME_CONTROL_PORT',
);

export interface AttemptRuntimeControlPort {
  send(input: { attemptId: string; message: string }): Promise<void>;
  interrupt(input: { attemptId: string }): Promise<void>;
}
