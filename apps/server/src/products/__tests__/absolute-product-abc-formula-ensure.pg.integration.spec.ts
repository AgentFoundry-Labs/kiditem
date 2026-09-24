import type { PrismaClient } from '@prisma/client';
import {
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
} from '@kiditem/shared/product-abc';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lockProductMapping } from '../transaction/product-mapping-lock';
import { advanceProductMappingGeneration } from '../adapter/out/persistence/product-mapping-generation';
import { ProductTransactionalReadRepositoryAdapter } from '../adapter/out/persistence/product-transactional-read.repository.adapter';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { MasterProductAbcRepositoryAdapter } from '../adapter/out/persistence/master-product-abc.repository.adapter';
import type { ProductAbcPublicationInput } from '../application/port/out/persistence/master-product-abc.repository.port';
import { runEnsureSteps } from '../../../../../scripts/data-migrations/ensure/index';
import {
  AbsoluteProductAbcFormulaConflictError,
  absoluteProductAbcFormulaLockKeys,
  absoluteProductAbcFormulaStep,
  ensureAbsoluteProductAbcFormulaForOrganization,
} from '../../../../../scripts/data-migrations/ensure/absolute-product-abc-formula';
import { initializeAbsoluteProductAbcFormula } from '../../../../../scripts/data-migrations/v0.1.31/002_initialize_absolute_product_abc_formula';

/** Sorts after TEST_ORGANIZATION_ID and OTHER_ORGANIZATION_ID. */
const THIRD_ORGANIZATION_ID = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f';
const WRONG_CHECKSUM = '0'.repeat(64);

/**
 * `ensure:absolute_product_abc_formula` runs after every post-schema
 * `data:migrate -- up` and inside organization-creating scripts. It must write
 * what v0.1.31:002 writes, keep a mapping-only state's generation, leave any
 * state with a formula alone, and roll back whole when an organization cannot
 * take the formula, naming every such organization.
 */
describe('ensure:absolute_product_abc_formula (PostgreSQL)', () => {
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

  it('installs the current formula and a baseline state for organizations without one', async () => {
    await expect(runStep()).resolves.toEqual({
      affectedRows: 4,
      details: {
        organizationCount: 2,
        createdFormulaVersionCount: 2,
        createdFormulaStateCount: 2,
        attachedMappingOnlyStateCount: 0,
      },
    });

    for (const organizationId of [TEST_ORGANIZATION_ID, OTHER_ORGANIZATION_ID]) {
      const versions = await prisma.masterProductAbcFormulaVersion.findMany({
        where: { organizationId },
        select: { id: true, formulaKey: true, version: true, formulaJson: true, formulaChecksum: true },
      });
      expect(versions).toEqual([{
        id: expect.any(String),
        formulaKey: 'PRODUCT_ABC_ABSOLUTE',
        version: 2,
        formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD)),
        formulaChecksum: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
      }]);
      await expect(readState(organizationId)).resolves.toEqual({
        activeFormulaVersionId: versions[0]!.id,
        formulaRevision: 1,
        publicationRevision: 0,
        officialCutoffDate: null,
        publishedSellpiaSourceImportRunId: null,
        publishedAdvertisingSourceImportRunId: null,
        publishedMappingGeneration: null,
        mappingGeneration: 0n,
        publishedAt: null,
      });
    }
  });

  it('attaches the formula to a mapping-only state and keeps its mapping generation', async () => {
    await prisma.$transaction(async (tx) => {
      for (let generation = 0; generation < 5; generation += 1) {
        await advanceProductMappingGeneration(tx, TEST_ORGANIZATION_ID);
      }
    });
    await expect(readState(TEST_ORGANIZATION_ID)).resolves.toMatchObject({
      activeFormulaVersionId: null,
      formulaRevision: 0,
      mappingGeneration: 5n,
    });

    await expect(runStep()).resolves.toMatchObject({
      affectedRows: 4,
      details: { createdFormulaVersionCount: 2, createdFormulaStateCount: 1, attachedMappingOnlyStateCount: 1 },
    });
    const formula = await currentFormula(TEST_ORGANIZATION_ID);
    await expect(readState(TEST_ORGANIZATION_ID)).resolves.toEqual({
      activeFormulaVersionId: formula.id,
      formulaRevision: 1,
      publicationRevision: 0,
      officialCutoffDate: null,
      publishedSellpiaSourceImportRunId: null,
      publishedAdvertisingSourceImportRunId: null,
      publishedMappingGeneration: null,
      mappingGeneration: 5n,
      publishedAt: null,
    });
  });

  it('leaves a baseline state and a published state untouched', async () => {
    await runStep();
    const sellpiaRun = await createCompletedRun('kid243_sellpia');
    const advertisingRun = await createCompletedRun('kid243_advertising');
    await prisma.masterProductAbcFormulaState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: {
        publicationRevision: 2,
        officialCutoffDate: new Date('2026-09-15T00:00:00.000Z'),
        publishedSellpiaSourceImportRunId: sellpiaRun.id,
        publishedAdvertisingSourceImportRunId: advertisingRun.id,
        publishedMappingGeneration: 0n,
        publishedAt: new Date('2026-09-16T00:00:00.000Z'),
      },
    });
    const before = await snapshot();

    await expect(runStep()).resolves.toEqual({
      affectedRows: 0,
      details: {
        organizationCount: 2,
        createdFormulaVersionCount: 0,
        createdFormulaStateCount: 0,
        attachedMappingOnlyStateCount: 0,
      },
    });
    await expect(snapshot()).resolves.toEqual(before);
    expect(before.states.find((state) => state.organizationId === TEST_ORGANIZATION_ID))
      .toMatchObject({ publicationRevision: 2, publishedMappingGeneration: 0n });
  });

  it('changes nothing on a second run and installs only an organization created between runs', async () => {
    await runStep();
    const afterFirst = await snapshot();

    await expect(runStep()).resolves.toMatchObject({ affectedRows: 0 });
    await expect(snapshot()).resolves.toEqual(afterFirst);

    await createOrganization(THIRD_ORGANIZATION_ID);
    await expect(runStep()).resolves.toEqual({
      affectedRows: 2,
      details: {
        organizationCount: 3,
        createdFormulaVersionCount: 1,
        createdFormulaStateCount: 1,
        attachedMappingOnlyStateCount: 0,
      },
    });
    const afterThird = await snapshot();
    expect(afterThird.states.filter((state) => state.organizationId !== THIRD_ORGANIZATION_ID))
      .toEqual(afterFirst.states);
    expect(afterThird.states.find((state) => state.organizationId === THIRD_ORGANIZATION_ID))
      .toMatchObject({ activeFormula: { formulaKey: 'PRODUCT_ABC_ABSOLUTE', version: 2 }, formulaRevision: 1 });
  });

  it('refuses stored formulas with another checksum, names every organization, and writes nothing until they are fixed', async () => {
    await createOrganization(THIRD_ORGANIZATION_ID);
    for (const organizationId of [TEST_ORGANIZATION_ID, OTHER_ORGANIZATION_ID]) {
      await prisma.masterProductAbcFormulaVersion.create({
        data: {
          organizationId,
          formulaKey: 'PRODUCT_ABC_ABSOLUTE',
          version: 2,
          formulaJson: { changed: true },
          formulaChecksum: WRONG_CHECKSUM,
        },
      });
    }
    const before = await snapshot();

    const failure = await runStep().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AbsoluteProductAbcFormulaConflictError);
    expect(failure).toMatchObject({
      checksumMismatchOrganizationIds: [TEST_ORGANIZATION_ID, OTHER_ORGANIZATION_ID],
      unattachedStateOrganizationIds: [],
    });
    expect((failure as Error).message).toContain(
      `for organizations ${TEST_ORGANIZATION_ID}, ${OTHER_ORGANIZATION_ID}`,
    );
    // The third organization was installed before the error and rolled back with it.
    await expect(snapshot()).resolves.toEqual(before);

    await prisma.masterProductAbcFormulaVersion.updateMany({
      data: {
        formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD)),
        formulaChecksum: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
      },
    });
    await expect(runStep()).resolves.toMatchObject({
      affectedRows: 4,
      details: { createdFormulaVersionCount: 1, createdFormulaStateCount: 3 },
    });
  });

  it('refuses a formula-less state that is not mapping-only, names every organization, and writes nothing until it is fixed', async () => {
    await createOrganization(THIRD_ORGANIZATION_ID);
    await prisma.masterProductAbcFormulaState.create({
      data: { organizationId: TEST_ORGANIZATION_ID, publicationRevision: 3, mappingGeneration: 4n },
    });
    await prisma.masterProductAbcFormulaVersion.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        formulaKey: 'PRODUCT_ABC_ABSOLUTE',
        version: 2,
        formulaJson: { changed: true },
        formulaChecksum: WRONG_CHECKSUM,
      },
    });
    const before = await snapshot();

    const failure = await runStep().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AbsoluteProductAbcFormulaConflictError);
    expect(failure).toMatchObject({
      checksumMismatchOrganizationIds: [OTHER_ORGANIZATION_ID],
      unattachedStateOrganizationIds: [TEST_ORGANIZATION_ID],
    });
    expect((failure as Error).message).toMatch(
      new RegExp(`not mapping-only .* for organizations ${TEST_ORGANIZATION_ID}`),
    );
    await expect(snapshot()).resolves.toEqual(before);

    // The same refusal ends a caller's transaction when it installs one organization.
    await expect(prisma.$transaction((tx) =>
      ensureAbsoluteProductAbcFormulaForOrganization(tx, TEST_ORGANIZATION_ID)))
      .rejects.toMatchObject({ unattachedStateOrganizationIds: [TEST_ORGANIZATION_ID] });
    await expect(snapshot()).resolves.toEqual(before);

    await prisma.masterProductAbcFormulaState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: { publicationRevision: 0 },
    });
    await prisma.masterProductAbcFormulaVersion.deleteMany({
      where: { organizationId: OTHER_ORGANIZATION_ID },
    });
    await expect(runStep()).resolves.toMatchObject({
      affectedRows: 6,
      details: { createdFormulaVersionCount: 3, createdFormulaStateCount: 2, attachedMappingOnlyStateCount: 1 },
    });
    await expect(readState(TEST_ORGANIZATION_ID)).resolves.toMatchObject({
      formulaRevision: 1,
      mappingGeneration: 4n,
    });
  });

  it('writes exactly what v0.1.31:002 writes, and 002 then finds nothing to do', async () => {
    const arrange = async () => {
      await prisma.$transaction(async (tx) => {
        for (let generation = 0; generation < 5; generation += 1) {
          await advanceProductMappingGeneration(tx, OTHER_ORGANIZATION_ID);
        }
      });
    };

    await arrange();
    await expect(prisma.$transaction((tx) => initializeAbsoluteProductAbcFormula.run(tx, { target: 'local' })))
      .resolves.toMatchObject({ affectedRows: 4 });
    const written002 = withoutTimestamps(await snapshot());

    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await arrange();
    await expect(runStep()).resolves.toMatchObject({ affectedRows: 4 });
    const writtenByStep = withoutTimestamps(await snapshot());

    expect(writtenByStep).toEqual(written002);
    expect(writtenByStep.states.find((state) => state.organizationId === OTHER_ORGANIZATION_ID))
      .toMatchObject({ mappingGeneration: 5n });
    await expect(prisma.$transaction((tx) => initializeAbsoluteProductAbcFormula.run(tx, { target: 'local' })))
      .resolves.toEqual({
        affectedRows: 0,
        details: { createdFormulaVersionCount: 0, initializedFormulaStateCount: 0 },
      });
  });

  it('holds the same ABC lock as server publication', async () => {
    const [, masterProductAbcLock] = absoluteProductAbcFormulaLockKeys(TEST_ORGANIZATION_ID);
    const release = deferred();
    const acquired = deferred();
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${masterProductAbcLock}, 0))::text AS "lock"`;
      acquired.resolve();
      await release.promise;
    }, { timeout: 20_000 });
    await acquired.promise;

    const publication = settleLater(
      new MasterProductAbcRepositoryAdapter(
        prisma as never,
        new ProductTransactionalReadRepositoryAdapter(),
      ).publish(publicationInput()),
    );
    try {
      await waitForAdvisoryLockWaiter();
      expect(publication.settled()).toBe(false);
    } finally {
      release.resolve();
      await holder;
    }
    await expect(publication.promise).resolves.toEqual({ outcome: 'INPUT_CHANGED' });
  });

  it('waits for a server mapping change on the same organization', async () => {
    const release = deferred();
    const acquired = deferred();
    const mappingChange = prisma.$transaction(async (tx) => {
      await lockProductMapping(tx, TEST_ORGANIZATION_ID);
      acquired.resolve();
      await release.promise;
      await advanceProductMappingGeneration(tx, TEST_ORGANIZATION_ID);
    }, { timeout: 20_000 });
    await acquired.promise;

    const ensured = settleLater(runStep());
    try {
      await waitForAdvisoryLockWaiter();
      expect(ensured.settled()).toBe(false);
    } finally {
      release.resolve();
      await mappingChange;
    }
    // The step read the state the mapping change committed and kept its generation.
    await expect(ensured.promise).resolves.toMatchObject({
      affectedRows: 4,
      details: { createdFormulaVersionCount: 2, createdFormulaStateCount: 1, attachedMappingOnlyStateCount: 1 },
    });
    await expect(readState(TEST_ORGANIZATION_ID)).resolves.toMatchObject({
      formulaRevision: 1,
      mappingGeneration: 1n,
    });
  });

  async function runStep() {
    const [result] = await runEnsureSteps(prisma, [absoluteProductAbcFormulaStep], { target: 'local' }, 30_000);
    return { affectedRows: result!.affectedRows, details: result!.details };
  }

  function createOrganization(id: string) {
    return prisma.organization.create({
      data: { id, name: 'KID-243 Third Co', slug: 'kid243-third-co' },
    });
  }

  function createCompletedRun(sourceType: string) {
    return prisma.sourceImportRun.create({
      data: { organizationId: TEST_ORGANIZATION_ID, sourceType, status: 'completed' },
    });
  }

  function readState(organizationId: string) {
    return prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId },
      select: {
        activeFormulaVersionId: true,
        formulaRevision: true,
        publicationRevision: true,
        officialCutoffDate: true,
        publishedSellpiaSourceImportRunId: true,
        publishedAdvertisingSourceImportRunId: true,
        publishedMappingGeneration: true,
        mappingGeneration: true,
        publishedAt: true,
      },
    });
  }

  function currentFormula(organizationId: string) {
    return prisma.masterProductAbcFormulaVersion.findUniqueOrThrow({
      where: {
        organizationId_formulaKey_version: {
          organizationId,
          formulaKey: 'PRODUCT_ABC_ABSOLUTE',
          version: 2,
        },
      },
      select: { id: true },
    });
  }

  /** Every formula row, with the active formula named by key instead of id. */
  async function snapshot() {
    const versions = await prisma.masterProductAbcFormulaVersion.findMany({
      orderBy: [{ organizationId: 'asc' }, { formulaKey: 'asc' }, { version: 'asc' }],
      select: {
        id: true,
        organizationId: true,
        formulaKey: true,
        version: true,
        formulaJson: true,
        formulaChecksum: true,
        createdAt: true,
      },
    });
    const states = await prisma.masterProductAbcFormulaState.findMany({
      orderBy: { organizationId: 'asc' },
    });
    const versionById = new Map(versions.map((version) => [version.id, version]));
    return {
      versions: versions.map(({ id: _id, ...version }) => version),
      states: states.map(({ activeFormulaVersionId, ...state }) => {
        const active = activeFormulaVersionId === null ? null : versionById.get(activeFormulaVersionId);
        return {
          ...state,
          activeFormula: active
            ? { organizationId: active.organizationId, formulaKey: active.formulaKey, version: active.version }
            : activeFormulaVersionId,
        };
      }),
    };
  }
});

type FormulaSnapshot = {
  versions: Array<Record<string, unknown>>;
  states: Array<Record<string, unknown>>;
};

function withoutTimestamps(rows: FormulaSnapshot): FormulaSnapshot {
  const strip = ({ createdAt: _createdAt, updatedAt: _updatedAt, ...row }: Record<string, unknown>) => row;
  return { versions: rows.versions.map(strip), states: rows.states.map(strip) };
}

function publicationInput(): ProductAbcPublicationInput {
  const noSelection = {
    selectedComplete: {
      sourceImportRunId: null,
      publicationSequence: null,
      mappingGeneration: null,
      coverageStartDate: null,
      coverageEndDate: null,
      capturedAt: null,
    },
  };
  return {
    organizationId: TEST_ORGANIZATION_ID,
    expectedFormulaRevision: 1,
    expectedPublicationRevision: 0,
    formulaVersionId: '00000000-0000-4000-8000-000000000243',
    targetCutoff: '2026-09-16',
    actualCutoff: '2026-09-16',
    mappingGeneration: '0',
    sourceFences: { sellpia: noSelection, advertising: noSelection },
    saleAgeInputs: [],
    targetProductIds: [],
    candidates: [],
    calculatedAt: new Date('2026-09-17T00:00:00.000Z'),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function settleLater<T>(promise: Promise<T>) {
  let settled = false;
  const tracked = promise.finally(() => {
    settled = true;
  });
  // Observed below; keep an early rejection from being reported as unhandled.
  tracked.catch(() => undefined);
  return { promise: tracked, settled: () => settled };
}

/** Resolves once another session waits on an advisory lock. */
async function waitForAdvisoryLockWaiter(): Promise<void> {
  const observer = makeTestPrisma();
  try {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const [row] = await observer.$queryRaw<Array<{ waiting: number }>>`
        SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted
      `;
      if ((row?.waiting ?? 0) > 0) return;
      if (Date.now() > deadline) throw new Error('No session waited on an advisory lock.');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  } finally {
    await observer.$disconnect();
  }
}
