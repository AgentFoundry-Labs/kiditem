import { z } from 'zod';
import type { CapabilityDefinition } from '../../../common/capability-definition';

export const AGENT_OS_CAPABILITIES = [
  {
    key: 'agent_os.platform_probe', ownerDomain: 'agent_os', ownerInputPort: 'agent_os.platformProbe',
    description: 'Check whether the server-side Agent OS capability runtime is available.',
    inputSchema: z.object({}).strict(), outputSchema: z.object({ status: z.literal('available') }).strict(),
    effects: ['read'], approvalRisk: 'none', idempotency: 'none',
  },
] as const satisfies readonly CapabilityDefinition[];
