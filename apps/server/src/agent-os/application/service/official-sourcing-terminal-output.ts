import { parseOperationRunName } from '@kiditem/shared/identifiers';
import { z } from 'zod';

const outputSchema = z.object({
  text: z.string().trim().min(1).max(6_000),
  citationIds: z.array(z.string().trim().min(1).max(500)).max(12),
  dataGaps: z.array(z.string().trim().min(1).max(500)).max(20),
  resourceRefs: z.array(z.object({
    kind: z.enum([
      'operation_run', 'recommendation_run', 'validation_episode',
      'sourcing_candidate', 'review_batch', 'artifact',
    ]),
    id: z.string().trim().min(1).max(500),
  }).strict()).max(12),
  operationRunId: z.string().uuid().nullable(),
}).strict();

const evidenceSchema = z.object({
  schemaVersion: z.literal(1),
  capabilityKey: z.string().min(1).max(128),
  outputSummary: z.record(z.unknown()).nullable(),
  resourceType: z.string().min(1).max(128).nullable(),
  resourceId: z.string().min(1).max(1_000).nullable(),
}).strict();

export interface OfficialSourcingTerminalOutput {
  schemaVersion: 'sourcing-agent-answer.v1';
  text: string;
  citationIds: string[];
  dataGaps: string[];
  resourceRefs: Array<{ kind: string; id: string }>;
  operationRunId: string | null;
}

/** Validates terminal output only against durable evidence from this execution. */
export function verifyOfficialSourcingTerminalOutput(input: {
  output: unknown;
  evidence: unknown;
  organizationId: string;
}): OfficialSourcingTerminalOutput {
  try {
    const output = outputSchema.parse(input.output);
    const evidence = z.array(evidenceSchema).max(100).parse(input.evidence);
    rejectDuplicates(output.citationIds);
    rejectDuplicates(output.resourceRefs.map((reference) => `${reference.kind}:${reference.id}`));
    const citationIds = new Set(
      evidence
        .filter((entry) => entry.capabilityKey === 'sourcing.retrieveWorkspaceEvidence')
        .flatMap((entry) => stringList(entry.outputSummary?.citationIds)),
    );
    if (output.citationIds.some((id) => !citationIds.has(id))) throw invalid();

    const operationIds = new Set(
      evidence
        .filter((entry) => entry.capabilityKey === 'sourcing.refreshCollection')
        .map((entry) => operationId(entry.outputSummary?.operation, input.organizationId))
        .filter((id): id is string => id !== null),
    );
    if (
      (output.operationRunId !== null && !operationIds.has(output.operationRunId)) ||
      output.resourceRefs.some((reference) =>
        reference.kind === 'operation_run' && !operationIds.has(reference.id),
      )
    ) throw invalid();

    const resourceIds = new Set(
      evidence.flatMap((entry) => entry.resourceId ? [`${entry.resourceType}:${entry.resourceId}`] : []),
    );
    if (output.resourceRefs.some((reference) =>
      reference.kind !== 'operation_run' &&
      !resourceIds.has(`${reference.kind}:${reference.id}`),
    )) throw invalid();

    return {
      schemaVersion: 'sourcing-agent-answer.v1',
      text: output.text,
      citationIds: [...output.citationIds].sort(),
      dataGaps: [...output.dataGaps].sort(),
      resourceRefs: [...output.resourceRefs].sort((left, right) =>
        `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`),
      ),
      operationRunId: output.operationRunId,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'OFFICIAL_SOURCING_OUTPUT_EVIDENCE_INVALID') throw error;
    throw invalid();
  }
}

function operationId(value: unknown, organizationId: string): string | null {
  if (typeof value !== 'string') return null;
  try {
    return parseOperationRunName(value, `organizations/${organizationId}`).operation;
  } catch {
    return null;
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : [];
}

function rejectDuplicates(values: string[]): void {
  if (new Set(values).size !== values.length) throw invalid();
}

function invalid(): Error {
  return new Error('OFFICIAL_SOURCING_OUTPUT_EVIDENCE_INVALID');
}
