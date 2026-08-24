import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AgentAttemptReadinessService } from '../../agent-os/adapter/out/runtime/attempt/agent-attempt-readiness.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReadinessStateModule } from '../readiness-state.module';
import { ReadinessService } from '../readiness.service';

describe('ReadinessStateModule', () => {
  it('constructs the Agent runtime readiness dependency through its explicit factory', async () => {
    const module = await Test.createTestingModule({ imports: [ReadinessStateModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    try {
      expect(module.get(ReadinessService)).toBeInstanceOf(ReadinessService);
      expect(module.get(AgentAttemptReadinessService)).toBeInstanceOf(AgentAttemptReadinessService);
    } finally {
      await module.close();
    }
  });
});
