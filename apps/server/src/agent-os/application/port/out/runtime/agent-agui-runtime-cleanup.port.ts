import type {
  RuntimeHandle,
  RuntimeInspection,
} from "./agent-durable-runtime.port";

export const AGUI_RUNTIME_CLEANUP_DEPENDENCIES = Symbol(
  "AGUI_RUNTIME_CLEANUP_DEPENDENCIES",
);

export interface AguiRunCoordinate {
  organizationId: string;
  sessionId: string;
  executionId: string;
  attemptId: string;
  startIntentId: string;
}

export interface AguiStartIntent extends AguiRunCoordinate {
  deletionOperationRunId: string;
  deletionAttemptToken: string;
}

export interface AguiRuntimeCleanupDependencies {
  invalidate(input: AguiStartIntent): Promise<void>;
  stop(
    input: AguiStartIntent & {
      handle: RuntimeHandle | null;
      signal: AbortSignal;
    },
  ): Promise<RuntimeInspection>;
}
