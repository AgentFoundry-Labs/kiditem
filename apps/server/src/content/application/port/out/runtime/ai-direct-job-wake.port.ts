export const AI_DIRECT_JOB_WAKE_PORT = Symbol('AI_DIRECT_JOB_WAKE_PORT');

export interface AiDirectJobWakePort {
  wake(): void;
}
