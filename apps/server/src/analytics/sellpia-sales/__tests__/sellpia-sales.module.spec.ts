import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../../../prisma/prisma.service';
import { SellpiaSalesModule } from '../sellpia-sales.module';
import { SellpiaSalesOperationOwner } from '../../adapter/in/operation/sellpia-sales-operation-owner';
import { SellpiaSalesPublicationRepository } from '../sellpia-sales-publication.repository';

describe('SellpiaSalesModule wiring', () => {
  it('initializes the sales operation owner over the publication (failures stay on the operation row — KID-355)', async () => {
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

      expect(owner.kind).toBe('analytics.sellpia_sales');
      expect((owner as unknown as { publication: unknown }).publication).toBe(publication);
    } finally {
      await moduleRef.close();
    }
  });
});
