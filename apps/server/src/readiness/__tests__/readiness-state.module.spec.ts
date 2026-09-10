import 'reflect-metadata';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { AD_ACCOUNT_DAILY_KPI_READ_PORT } from '../../advertising/application/port/in/ad-account-daily-kpi-source.port';
import { ReadinessStateModule } from '../readiness-state.module';
import { ReadinessService } from '../readiness.service';

describe('ReadinessStateModule', () => {
  it('has no Agent runtime dependency', async () => {
    const module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), ReadinessStateModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AD_ACCOUNT_DAILY_KPI_READ_PORT)
      .useValue({ readPublished: async () => ({ channelAccountId: '', rows: [] }) })
      .compile();
    try {
      expect(module.get(ReadinessService)).toBeInstanceOf(ReadinessService);
    } finally {
      await module.close();
    }
  });
});
