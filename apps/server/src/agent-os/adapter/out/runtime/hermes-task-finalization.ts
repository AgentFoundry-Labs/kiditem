import type { AgentOsRepositoryPort } from '../../../application/port/out/repository/agent-os-repository.port';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';

const RUN_EVENT_PAGE_LIMIT = 200;

export interface HermesTaskFinalization {
  id: string;
  status: string;
  artifactIds: string[];
  summary: Record<string, unknown>;
  error: Record<string, unknown> | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function runtimeErrorCode(error: unknown): string | null {
  return error instanceof AgentOsRuntimeError ? error.code : null;
}

export function isRecoverableHermesRuntimeError(error: unknown): boolean {
  return runtimeErrorCode(error) === 'operator_runtime_timeout';
}

function finalizationFromEvent(
  event: Awaited<ReturnType<AgentOsRepositoryPort['listRunEvents']>>[number],
  acceptedTools: ReadonlySet<string>,
): HermesTaskFinalization | null {
  if (event.type !== 'agent_os.task_finalized') return null;
  const data = event.data;
  if (!isRecord(data)) return null;
  if (!acceptedTools.has(stringField(data.finalizationTool) ?? '')) return null;

  return {
    id: event.id,
    status: stringField(data.status) ?? 'succeeded',
    artifactIds: stringArray(data.artifactIds),
    summary: isRecord(data.summary) ? data.summary : {},
    error: isRecord(data.error) ? data.error : null,
  };
}

export async function readLatestHermesTaskFinalization(input: {
  repository: AgentOsRepositoryPort;
  organizationId: string;
  runId: string;
  acceptedFinalizationTools: string[];
}): Promise<HermesTaskFinalization | null> {
  const acceptedTools = new Set(input.acceptedFinalizationTools);
  let cursorSeq: number | undefined;
  let latest: HermesTaskFinalization | null = null;

  for (;;) {
    const events = await input.repository.listRunEvents({
      organizationId: input.organizationId,
      runId: input.runId,
      limit: RUN_EVENT_PAGE_LIMIT,
      ...(cursorSeq === undefined ? {} : { cursorSeq }),
    });

    for (const event of events) {
      const finalization = finalizationFromEvent(event, acceptedTools);
      if (finalization) {
        latest = finalization;
      }
    }

    if (events.length < RUN_EVENT_PAGE_LIMIT) return latest;

    const lastSeq = events[events.length - 1]?.seq;
    if (typeof lastSeq !== 'number' || lastSeq <= (cursorSeq ?? 0)) {
      return latest;
    }
    cursorSeq = lastSeq;
  }
}
