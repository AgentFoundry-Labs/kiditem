import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AlertsModule } from '../../../alerts/alerts.module';
import { SourceFailureAlerts } from '../../../alerts/alerts.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SellpiaSalesModule } from '../sellpia-sales.module';
import { SellpiaSalesSourceService } from '../sellpia-sales-source.service';

describe('SellpiaSalesModule wiring', () => {
  it('initializes the source owner with the exported alert service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SellpiaSalesModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    try {
      await moduleRef.init();

      const owner = moduleRef.get(SellpiaSalesSourceService);
      const alerts = moduleRef.get(SourceFailureAlerts);

      expect(owner).toBeInstanceOf(SellpiaSalesSourceService);
      expect(alerts).toBeInstanceOf(SourceFailureAlerts);
      expect((owner as unknown as { alerts: SourceFailureAlerts }).alerts).toBe(alerts);
      expect(moduleRef.select(AlertsModule).get(SourceFailureAlerts)).toBe(alerts);
    } finally {
      await moduleRef.close();
    }
  });
});
