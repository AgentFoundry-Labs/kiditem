import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { SellpiaOrderTransmissionRepositoryAdapter } from '../adapter/out/repository/sellpia-order-transmission.repository.adapter';
import { SellpiaOrderTransmissionService } from '../application/service/sellpia-order-transmission.service';

const INTENT_KEY = '1721000000000-kidkids-browser';

describe('Sellpia order transmission repository (PG integration)', () => {
  let prisma: PrismaClient;
  let service: SellpiaOrderTransmissionService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    service = new SellpiaOrderTransmissionService(
      new SellpiaOrderTransmissionRepositoryAdapter(
        prisma as unknown as PrismaService,
      ),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('durably fences duplicate submissions without reading or advancing inventory', async () => {
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceAccountKey: 'kiditem',
        lastVerifiedAt: new Date(),
        requestedGeneration: 3n,
        verifiedGeneration: 3n,
        refreshReason: 'legacy_manual_import',
      },
    });
    const actor = {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      intentKey: INTENT_KEY,
    };

    await expect(service.prepare(actor)).resolves.toMatchObject({
      disposition: 'prepared',
    });
    await expect(service.prepare(actor)).resolves.toMatchObject({
      disposition: 'already_prepared',
    });
    await expect(service.finalize(actor)).resolves.toEqual({
      intentKey: INTENT_KEY,
      status: 'finalized',
    });
    await expect(service.finalize(actor)).resolves.toEqual({
      intentKey: INTENT_KEY,
      status: 'finalized',
    });

    await expect(prisma.sellpiaOrderTransmissionIntent.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, intentKey: INTENT_KEY },
    })).resolves.toMatchObject({
      status: 'finalized',
      finalizedGeneration: null,
    });
    await expect(prisma.sellpiaInventoryState.findUniqueOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toMatchObject({
      requestedGeneration: 3n,
      verifiedGeneration: 3n,
      refreshReason: 'legacy_manual_import',
    });
  });
});
