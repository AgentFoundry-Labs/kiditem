import { describe, expect, it } from 'vitest';
import { deriveAgentSessionArtifactKey } from '../agent-session-artifact-key';

describe('deriveAgentSessionArtifactKey', () => {
  it('derives the only storage key from canonical ownership coordinates', () => {
    expect(deriveAgentSessionArtifactKey({
      organizationId: '11111111-1111-4111-8111-111111111111',
      sessionId: '22222222-2222-4222-8222-222222222222',
      artifactId: '33333333-3333-4333-8333-333333333333',
    })).toBe(
      'agent-artifacts/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333',
    );
  });
});
