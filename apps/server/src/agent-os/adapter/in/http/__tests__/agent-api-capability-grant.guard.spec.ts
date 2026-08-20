import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AgentApiCapabilityGrantGuard } from '../agent-api-capability-grant.guard';
import { AgentApiCapabilityGrantService } from '../../../../application/service/agent-api-capability-grant.service';

describe('AgentApiCapabilityGrantGuard', () => {
  it('uses its collection capability default without requiring a String provider', async () => {
    const module = await Test.createTestingModule({
      providers: [
        AgentApiCapabilityGrantGuard,
        {
          provide: AgentApiCapabilityGrantService,
          useValue: { verifyAndAuthorize: async () => ({}) },
        },
      ],
    }).compile();

    expect(module.get(AgentApiCapabilityGrantGuard)).toBeInstanceOf(
      AgentApiCapabilityGrantGuard,
    );
    await module.close();
  });
});
