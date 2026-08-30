import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { ReadinessStateModule } from '../readiness-state.module';
import { ReadinessService } from '../readiness.service';

describe('ReadinessStateModule', () => {
  it('has no Agent runtime dependency', async () => {
    const module = await Test.createTestingModule({ imports: [ReadinessStateModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    try {
      expect(module.get(ReadinessService)).toBeInstanceOf(ReadinessService);
    } finally {
      await module.close();
    }
  });
});
