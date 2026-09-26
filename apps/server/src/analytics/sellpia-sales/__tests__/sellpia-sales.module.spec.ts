import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AlertsModule } from '../../../alerts/alerts.module';
import { SourceFailureAlerts } from '../../../alerts/alerts.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SellpiaSalesModule } from '../sellpia-sales.module';
import { SellpiaSalesOperationOwner } from '../../adapter/in/operation/sellpia-sales-operation-owner';
import { SellpiaSalesPublicationRepository } from '../sellpia-sales-publication.repository';

describe('SellpiaSalesModule wiring', () => {
  it('initializes the sales operation owner over the publication and the exported alert service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SellpiaSalesModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    try {
      await moduleRef.init();

      const owner = moduleRef.get(SellpiaSalesOperationOwner);
      const publication = moduleRef.get(SellpiaSalesPublicationRepository);
      const alerts = moduleRef.get(SourceFailureAlerts);

      expect(owner.kind).toBe('analytics.sellpia_sales');
      expect((owner as unknown as { publication: unknown }).publication).toBe(publication);
      expect((publication as unknown as { alerts: SourceFailureAlerts }).alerts).toBe(alerts);
      expect(moduleRef.select(AlertsModule).get(SourceFailureAlerts)).toBe(alerts);
    } finally {
      await moduleRef.close();
    }
  });
});
