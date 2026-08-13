import { z } from 'zod/v3';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import type {
  AgentArtifactRecord,
  AgentToolInvocationRecord,
} from '../../../domain/agent-os.types';
import type { AgentLocalCliProvider } from './agent-local-cli-command';

export const AgentLocalCliAnswerSchema = z
  .object({
    text: z.string().trim().min(1).max(6000),
    citationIds: z.array(z.string().trim().min(1).max(500)).max(12),
    dataGaps: z.array(z.string().trim().min(1).max(500)).max(20),
    resourceRefs: z
      .array(
        z
          .object({
            kind: z.enum([
              'operation_run',
              'recommendation_run',
              'validation_episode',
              'sourcing_candidate',
              'review_batch',
              'artifact',
            ]),
            id: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .max(12),
    operationRunId: z.string().uuid().nullable(),
  })
  .strict();

export type AgentLocalCliAnswer = z.infer<typeof AgentLocalCliAnswerSchema>;

type VerificationArtifact = Pick<
  AgentArtifactRecord,
  | 'id'
  | 'organizationId'
  | 'requestId'
  | 'runId'
  | 'artifactType'
  | 'targetId'
  | 'title'
  | 'href'
  | 'summary'
>;
type VerificationInvocation = Pick<
  AgentToolInvocationRecord,
  'capabilityKey' | 'status' | 'outputSummary'
>;

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function isSameRunArtifact(
  artifact: VerificationArtifact,
  context: { organizationId: string; requestId: string; runId: string },
): boolean {
  return (
    artifact.organizationId === context.organizationId &&
    artifact.requestId === context.requestId &&
    artifact.runId === context.runId
  );
}

function toVerifiedCitation(artifact: VerificationArtifact) {
  return {
    id: artifact.targetId!,
    artifactId: artifact.id,
    title: artifact.title,
    href: artifact.href,
    summary: artifact.summary,
  };
}

function verifiedCollectionOperationId(input: {
  artifacts: VerificationArtifact[];
  toolInvocations: VerificationInvocation[];
}): string | null {
  const artifactIds = new Set(
    input.artifacts
      .filter(
        (artifact) =>
          artifact.artifactType === 'operation_run' && artifact.targetId,
      )
      .map((artifact) => artifact.targetId!),
  );
  const operationIds = new Set<string>();
  for (const invocation of input.toolInvocations) {
    if (
      invocation.capabilityKey !== 'sourcing.refreshCollection' ||
      invocation.status !== 'succeeded'
    ) {
      continue;
    }
    const operationRunId = invocation.outputSummary?.operationRunId;
    if (typeof operationRunId === 'string' && artifactIds.has(operationRunId)) {
      operationIds.add(operationRunId);
    }
  }
  return operationIds.size === 1 ? [...operationIds][0] : null;
}

export function verifyAgentLocalCliAnswer(input: {
  context: { organizationId: string; requestId: string; runId: string };
  answer: AgentLocalCliAnswer;
  artifacts: VerificationArtifact[];
  toolInvocations: VerificationInvocation[];
  provider: AgentLocalCliProvider;
  model: string;
}) {
  const citationDuplicates = duplicateValues(input.answer.citationIds);
  if (citationDuplicates.length > 0) {
    throw new AgentOsRuntimeError(
      'citation_verification_failed',
      'Agent answer contains duplicate citation identifiers.',
    );
  }
  const resourceKeys = input.answer.resourceRefs.map(
    (reference) => `${reference.kind}:${reference.id}`,
  );
  if (duplicateValues(resourceKeys).length > 0) {
    throw new AgentOsRuntimeError(
      'resource_verification_failed',
      'Agent answer contains duplicate resource references.',
    );
  }

  const sameRunArtifacts = input.artifacts.filter((artifact) =>
    isSameRunArtifact(artifact, input.context),
  );
  const evidenceByTargetId = new Map<string, VerificationArtifact>();
  for (const artifact of sameRunArtifacts) {
    if (
      artifact.artifactType === 'sourcing_evidence_document' &&
      artifact.targetId &&
      !evidenceByTargetId.has(artifact.targetId)
    ) {
      evidenceByTargetId.set(artifact.targetId, artifact);
    }
  }
  const invalidCitationIds = input.answer.citationIds.filter(
    (id) => !evidenceByTargetId.has(id),
  );
  const verifiedEvidence = input.answer.citationIds
    .map((id) => evidenceByTargetId.get(id))
    .filter((artifact): artifact is VerificationArtifact => Boolean(artifact));
  if (input.answer.citationIds.length > 0 && verifiedEvidence.length === 0) {
    throw new AgentOsRuntimeError(
      'citation_verification_failed',
      'No requested citation identifier was verified.',
    );
  }

  const canonicalOperationRunId = verifiedCollectionOperationId({
    artifacts: sameRunArtifacts,
    toolInvocations: input.toolInvocations,
  });
  const verifiedResourceRefs = input.answer.resourceRefs
    .filter((reference) => reference.kind !== 'operation_run')
    .map((reference) => {
      const matched = sameRunArtifacts.some((artifact) =>
        reference.kind === 'artifact'
          ? artifact.id === reference.id
          : artifact.artifactType === reference.kind &&
            artifact.targetId === reference.id,
      );
      if (!matched) {
        throw new AgentOsRuntimeError(
          'resource_verification_failed',
          'Agent answer contains an unverified resource reference.',
        );
      }
      return reference;
    });

  const modelReturnedOperation =
    input.answer.operationRunId !== null ||
    input.answer.resourceRefs.some(
      (reference) => reference.kind === 'operation_run',
    );
  if (canonicalOperationRunId) {
    verifiedResourceRefs.push({
      kind: 'operation_run',
      id: canonicalOperationRunId,
    });
  } else if (modelReturnedOperation) {
    throw new AgentOsRuntimeError(
      'resource_verification_failed',
      'operationRunId is not backed by one same-run collection artifact.',
    );
  }

  if (
    input.answer.citationIds.length === 0 &&
    input.answer.dataGaps.length === 0 &&
    verifiedResourceRefs.length === 0
  ) {
    throw new AgentOsRuntimeError(
      'citation_required',
      'Agent answer must cite evidence, name a data gap, or reference a verified resource.',
    );
  }

  let documentCount = 0;
  for (const invocation of input.toolInvocations) {
    if (
      invocation.capabilityKey !== 'sourcing.retrieveWorkspaceEvidence' ||
      invocation.status !== 'succeeded'
    ) {
      continue;
    }
    const value = invocation.outputSummary?.documentCount;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      documentCount = Math.max(documentCount, value);
    }
  }

  return {
    schemaVersion: 'sourcing-agent-answer.v1' as const,
    text: canonicalOperationRunId
      ? `Operations 실행 ID: ${canonicalOperationRunId}`
      : input.answer.text,
    citations: verifiedEvidence.map(toVerifiedCitation),
    invalidCitationIds,
    dataGaps: input.answer.dataGaps,
    resourceRefs: verifiedResourceRefs,
    operationRunId: canonicalOperationRunId,
    documentCount,
    provider: input.provider,
    model: input.model,
  };
}
