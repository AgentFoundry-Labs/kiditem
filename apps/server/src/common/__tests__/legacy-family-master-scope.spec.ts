import { describe, expect, it } from 'vitest';
import { LEGACY_FAMILY_MASTER_SCOPE } from '../legacy-family-master-scope';

describe('LEGACY_FAMILY_MASTER_SCOPE', () => {
  it('excludes a physical Sellpia identity when any cutover marker identifies it', () => {
    expect(LEGACY_FAMILY_MASTER_SCOPE).toEqual({
      OR: [
        {
          sellpiaProductCode: null,
          temporaryReason: null,
          lifecycleState: { not: 'inventory_staged' },
        },
        {
          sellpiaProductCode: null,
          temporaryReason: { not: 'sellpia_master_cutover' },
          lifecycleState: { not: 'inventory_staged' },
        },
      ],
    });
  });
});
