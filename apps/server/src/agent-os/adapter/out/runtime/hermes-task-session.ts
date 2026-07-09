import type { AgentOsRepositoryPort } from '../../../application/port/out/repository/agent-os-repository.port';

export function readRuntimeThreadId(
  metadata: Record<string, unknown>,
): string | null {
  const value = metadata.runtimeThreadId;
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export async function loadHermesResumeSession(input: {
  repository: Pick<AgentOsRepositoryPort, 'getTaskSession'>;
  organizationId: string;
  taskSessionId: string;
}): Promise<string | null> {
  const session = await input.repository.getTaskSession({
    organizationId: input.organizationId,
    taskSessionId: input.taskSessionId,
  });
  return readRuntimeThreadId(session?.metadata ?? {});
}

export async function persistHermesRuntimeThread(input: {
  repository: Pick<AgentOsRepositoryPort, 'updateTaskSessionMetadata'>;
  organizationId: string;
  taskSessionId: string;
  sessionId: string | null | undefined;
}): Promise<void> {
  const sessionId =
    typeof input.sessionId === 'string' && input.sessionId.trim().length > 0
      ? input.sessionId.trim()
      : null;
  if (!sessionId) return;
  await input.repository.updateTaskSessionMetadata({
    organizationId: input.organizationId,
    taskSessionId: input.taskSessionId,
    metadata: { runtimeThreadId: sessionId },
  });
}
