import { describe, expect, it } from 'vitest';

describe('Gateway agent profile catalog', () => {
  it('packages the General chat profile and exactly five immutable business-agent profiles for native delegation', async () => {
    const {
      gatewayInstructionProfile,
      GATEWAY_AGENT_PROFILE_CATALOG,
    } = await import('./agent-profile.catalog');

    expect(GATEWAY_AGENT_PROFILE_CATALOG.map((profile: { key: string }) => profile.key)).toEqual([
      'sourcing',
      'merchandising',
      'supply',
      'channel_operations',
      'advertising',
    ]);

    for (const agentKey of [null, 'sourcing'] as const) {
      const profile = gatewayInstructionProfile(agentKey);
      expect(profile.selectedInstructions).toContain(agentKey === null ? 'KidItem General Chat' : 'KidItem Sourcing Agent');
      expect(profile.delegationProfiles.map((entry) => entry.key)).toEqual([
        'sourcing',
        'merchandising',
        'supply',
        'channel_operations',
        'advertising',
      ]);
      expect(profile.delegationProfiles.map((entry) => entry.instructions)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('KidItem Sourcing Agent'),
          expect.stringContaining('KidItem Merchandising Agent'),
          expect.stringContaining('KidItem Supply Agent'),
          expect.stringContaining('KidItem Channel Operations Agent'),
          expect.stringContaining('KidItem Advertising Agent'),
        ]),
      );
    }
  });
});
