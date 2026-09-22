import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ownerTransaction } from '../../prisma/owner-transaction';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG, OTHER_ORGANIZATION_ID as OTHER } from '../../test-helpers/real-prisma';
import { RegistrationSourceAdapter } from '../adapter/out/repository/registration-source.adapter';

describe('Sourcing registration source owner (PG integration)', () => {
  let prisma: PrismaClient;
  const source = new RegistrationSourceAdapter();
  beforeAll(async () => { prisma = makeTestPrisma(); await prisma.$connect(); });
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });
  afterAll(async () => prisma?.$disconnect());

  it('reads KC precedence within the caller transaction and excludes deleted or foreign candidates', async () => {
    await prisma.$transaction(async tx => {
      const ids: string[] = [];
      for (const data of [
        { organizationId: ORG, rawData: { kcCertificationStatus: 'raw', kcCertificationNumber: 'raw-number', manualBasics: { kcCertificationStatus: ' manual ', kcCertificationNumber: ' manual-number ', mallRegisterShared: { certNumber: 'shared-number' } } } },
        { organizationId: ORG, rawData: { manualBasics: { mallRegisterShared: { certNumber: ' shared-number ' } } } },
        { organizationId: ORG, isDeleted: true, rawData: { kcCertificationNumber: 'deleted' } },
        { organizationId: OTHER, rawData: { kcCertificationNumber: 'foreign' } },
      ]) {
        const candidate = await tx.sourcingCandidate.create({ data: { sourceUrl: `https://1688.com/${randomUUID()}`, sourcePlatform: 'ALIBABA_1688', name: 'Candidate', ...data } });
        ids.push(candidate.id);
      }
      const rows = await source.readRegistrationBasics(ownerTransaction(tx), { organizationId: ORG, candidateIds: ids });
      expect(rows).toHaveLength(2);
      expect(rows).toEqual(expect.arrayContaining([
        { candidateId: ids[0], kcStatus: 'manual', kcNumber: 'manual-number' },
        { candidateId: ids[1], kcStatus: null, kcNumber: 'shared-number' },
      ]));
      expect(await source.readRegistrationBasics(ownerTransaction(tx), { organizationId: ORG, candidateIds: [] })).toEqual([]);
    });
  });

  it('accepts only active same-organization candidates through issued transaction handles', async () => {
    const candidate = await prisma.sourcingCandidate.create({ data: { organizationId: ORG, sourceUrl: `https://1688.com/${randomUUID()}`, sourcePlatform: 'ALIBABA_1688', name: 'Candidate', status: 'sourced' } });
    await prisma.$transaction(async tx => {
      await source.lock(ownerTransaction(tx), ORG, candidate.id);
      await expect(source.requireActive(ownerTransaction(tx), ORG, candidate.id)).resolves.toBeUndefined();
      await expect(source.requireActive(ownerTransaction(tx), OTHER, candidate.id)).rejects.toThrow('not active');
      await tx.sourcingCandidate.update({ where: { id: candidate.id, organizationId: ORG }, data: { isDeleted: true } });
      await expect(source.requireActive(ownerTransaction(tx), ORG, candidate.id)).rejects.toThrow('not active');
    });
  });
});
