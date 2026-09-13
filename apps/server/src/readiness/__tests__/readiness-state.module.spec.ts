import 'reflect-metadata';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { ReadinessStateModule } from '../readiness-state.module';
import { ReadinessService } from '../readiness.service';

describe('ReadinessStateModule', () => {
  it('has no Agent runtime dependency', async () => {
    const module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), ReadinessStateModule],
    })
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
