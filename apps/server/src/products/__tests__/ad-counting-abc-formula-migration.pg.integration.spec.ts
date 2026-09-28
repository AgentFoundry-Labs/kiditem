import type { PrismaClient } from '@prisma/client';
import {
  PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD_HASH,
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
} from '@kiditem/shared/product-abc';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { ensureAbsoluteProductAbcFormulaForOrganization } from '../../../../../scripts/data-migrations/ensure/absolute-product-abc-formula';
import { moveAdCountingAbcFormulaStatesMigration } from '../../../../../scripts/data-migrations/v0.1.31/034_move_ad_counting_abc_formula_states';

/**
 * From 2026-09-17 until KID-373 the ensure step installed the advertising
 * formula (version 2) for organizations created after v0.1.31:016 ran.
 * Recalculation refuses that formula, so v0.1.31:034 moves every unpublished
 * state that is not on version 3 to the advertising-free formula, and leaves
 * version 3 states and published states alone.
 */
describe('v0.1.31:034 move advertising-counting ABC formula states (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterAll(async () => {
    if (!prisma) return;
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('moves an unpublished version 2 state to version 3 and leaves a version 3 organization untouched', async () => {
    const adCounting = await installAdCountingFormula(TEST_ORGANIZATION_ID, 4n);
    await prisma.$transaction((tx) => ensureAbsoluteProductAbcFormulaForOrganization(tx, OTHER_ORGANIZATION_ID));
    const otherBefore = await readOrganization(OTHER_ORGANIZATION_ID);

    await expect(runMigration()).resolves.toEqual({
      affectedRows: 2,
      details: { createdFormulaVersionCount: 1, movedFormulaStateCount: 1, publishedStateLeftCount: 0 },
    });

    const adFree = await formulaVersion(TEST_ORGANIZATION_ID, 3);
    expect(adFree.formulaChecksum).toBe(PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD_HASH);
    await expect(readState(TEST_ORGANIZATION_ID)).resolves.toEqual({
      activeFormulaVersionId: adFree.id,
      formulaRevision: 2,
      publicationRevision: 0,
      mappingGeneration: 4n,
      publishedAt: null,
    });
    await expect(formulaVersion(TEST_ORGANIZATION_ID, 2)).resolves.toMatchObject({ id: adCounting.id });
    await expect(readOrganization(OTHER_ORGANIZATION_ID)).resolves.toEqual(otherBefore);
  });

  it('leaves a published version 2 state alone and reports it', async () => {
    const adCounting = await installAdCountingFormula(TEST_ORGANIZATION_ID, 0n);
    await prisma.masterProductAbcFormulaState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: { publicationRevision: 1, publishedAt: new Date('2026-09-20T00:00:00.000Z') },
    });
    const before = await readOrganization(TEST_ORGANIZATION_ID);

    await expect(runMigration()).resolves.toEqual({
      affectedRows: 0,
      details: { createdFormulaVersionCount: 0, movedFormulaStateCount: 0, publishedStateLeftCount: 1 },
    });
    await expect(readOrganization(TEST_ORGANIZATION_ID)).resolves.toEqual(before);
    expect(before.state?.activeFormulaVersionId).toBe(adCounting.id);
  });

  it('changes nothing on a second run', async () => {
    await installAdCountingFormula(TEST_ORGANIZATION_ID, 0n);
    await runMigration();
    const afterFirst = await readOrganization(TEST_ORGANIZATION_ID);

    await expect(runMigration()).resolves.toEqual({
      affectedRows: 0,
      details: { createdFormulaVersionCount: 0, movedFormulaStateCount: 0, publishedStateLeftCount: 0 },
    });
    await expect(readOrganization(TEST_ORGANIZATION_ID)).resolves.toEqual(afterFirst);
  });

  function runMigration() {
    return prisma.$transaction((tx) => moveAdCountingAbcFormulaStatesMigration.run(tx, { target: 'local' }));
  }

  /** The rows the ensure step wrote before KID-373: version 2 and a baseline state on it. */
  async function installAdCountingFormula(organizationId: string, mappingGeneration: bigint) {
    const version = await prisma.masterProductAbcFormulaVersion.create({
      data: {
        organizationId,
        formulaKey: 'PRODUCT_ABC_ABSOLUTE',
        version: 2,
        formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD)),
        formulaChecksum: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
      },
      select: { id: true },
    });
    await prisma.masterProductAbcFormulaState.create({
      data: {
        organizationId,
        activeFormulaVersionId: version.id,
        formulaRevision: 1,
        publicationRevision: 0,
        mappingGeneration,
      },
    });
    return version;
  }

  function formulaVersion(organizationId: string, version: number) {
    return prisma.masterProductAbcFormulaVersion.findUniqueOrThrow({
      where: {
        organizationId_formulaKey_version: { organizationId, formulaKey: 'PRODUCT_ABC_ABSOLUTE', version },
      },
      select: { id: true, formulaChecksum: true },
    });
  }

  function readState(organizationId: string) {
    return prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId },
      select: {
        activeFormulaVersionId: true,
        formulaRevision: true,
        publicationRevision: true,
        mappingGeneration: true,
        publishedAt: true,
      },
    });
  }

  async function readOrganization(organizationId: string) {
    return {
      versions: await prisma.masterProductAbcFormulaVersion.findMany({
        where: { organizationId },
        orderBy: { version: 'asc' },
      }),
      state: await prisma.masterProductAbcFormulaState.findUnique({ where: { organizationId } }),
    };
  }
});
