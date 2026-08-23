import { describe, expect, it } from 'vitest';
import { verifyOfficialSourcingTerminalOutput } from '../official-sourcing-terminal-output';

describe('verifyOfficialSourcingTerminalOutput', () => {
  it('accepts only same-execution capability evidence and canonicalizes terminal citations and resource refs', () => {
    expect(verifyOfficialSourcingTerminalOutput({
      output: {
        text: 'Two sourced documents support the recommendation.',
        citationIds: ['document-b', 'document-a'],
        dataGaps: [],
        resourceRefs: [{ kind: 'operation_run', id: '00000000-0000-4000-8000-000000000007' }],
        operationRunId: '00000000-0000-4000-8000-000000000007',
      },
      evidence: [{
        schemaVersion: 1,
        capabilityKey: 'sourcing.retrieveWorkspaceEvidence',
        outputSummary: { citationIds: ['document-a', 'document-b'] },
        resourceType: 'sourcing_workspace_evidence',
        resourceId: 'query-hash',
      }, {
        schemaVersion: 1,
        capabilityKey: 'sourcing.refreshCollection',
        outputSummary: {
          operation: 'organizations/00000000-0000-4000-8000-000000000001/operations/00000000-0000-4000-8000-000000000007',
          status: 'pending',
        },
        resourceType: 'operation_run',
        resourceId: 'organizations/00000000-0000-4000-8000-000000000001/operations/00000000-0000-4000-8000-000000000007',
      }],
      organizationId: '00000000-0000-4000-8000-000000000001',
    })).toEqual({
      schemaVersion: 'sourcing-agent-answer.v1',
      text: 'Two sourced documents support the recommendation.',
      citationIds: ['document-a', 'document-b'],
      dataGaps: [],
      resourceRefs: [{ kind: 'operation_run', id: '00000000-0000-4000-8000-000000000007' }],
      operationRunId: '00000000-0000-4000-8000-000000000007',
    });
  });

  it('rejects citations and resource references not backed by the same execution evidence', () => {
    expect(() => verifyOfficialSourcingTerminalOutput({
      output: {
        text: 'Unsupported claim', citationIds: ['foreign-document'], dataGaps: [],
        resourceRefs: [], operationRunId: null,
      },
      evidence: [],
      organizationId: '00000000-0000-4000-8000-000000000001',
    })).toThrow('OFFICIAL_SOURCING_OUTPUT_EVIDENCE_INVALID');
  });
});
