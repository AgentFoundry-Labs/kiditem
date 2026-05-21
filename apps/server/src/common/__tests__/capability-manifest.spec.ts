import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_KINDS,
  defineCapabilities,
  type CapabilityManifest,
} from '../capability-manifest';

describe('common capability manifest vocabulary', () => {
  it('keeps the shared capability kind taxonomy in common, not a top-level owner module', () => {
    expect(CAPABILITY_KINDS).toEqual(['resource', 'tool', 'workflow', 'sink']);
  });

  it('preserves literal capability keys while checking the manifest shape', () => {
    const manifest = defineCapabilities([
      {
        key: 'example.read',
        ownerDomain: 'example',
        kind: 'resource',
        description: 'Read example data.',
        inputSchema: {},
        outputSchema: {},
        effects: ['read'],
        approval: 'none',
        idempotency: 'none',
        visibility: 'both',
        entrypoint: { type: 'incoming_port', token: 'EXAMPLE_READ_PORT' },
      },
    ] as const satisfies readonly CapabilityManifest[]);

    expect(manifest[0].key).toBe('example.read');
    expect(manifest[0].entrypoint.token).toBe('EXAMPLE_READ_PORT');
  });
});
