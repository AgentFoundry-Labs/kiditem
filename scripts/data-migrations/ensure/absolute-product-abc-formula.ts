import type { Prisma } from '@prisma/client';
import {
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
} from '@kiditem/shared/product-abc';
import type { EnsureStep } from './types';

/*
 * Products publishes ABC only through a formula state attached to a formula
 * version; a state without one makes every publication answer INPUT_CHANGED.
 * v0.1.31:002 installed the current formula once, for the organizations that
 * existed when it ran. This module installs the same rows for any
 * organization: the step below runs after every post-schema
 * `data:migrate -- up`, and the scripts that create an organization call
 * `ensureAbsoluteProductAbcFormulaForOrganization` in their own transaction.
 *
 * It writes exactly what 002 writes: the formula version keyed by the current
 * payload's `formulaKey` and `version`, with 002's payload JSON and checksum,
 * and a baseline state with formula revision 1 and no publication. It never
 * touches a state that already names a formula, so published organizations
 * are left alone. When the payload moves to a new version, this installs it
 * only for organizations without a formula; moving organizations that already
 * publish with the previous version needs a reviewed data migration.
 */

const FORMULA_KEY = PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.formulaKey;
const FORMULA_VERSION = PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.version;

/**
 * v0.1.31:002's `isMappingOnlyState` as a row predicate: the state
 * `advanceProductMappingGeneration` creates before any formula exists. Only
 * its `mappingGeneration` carries information, and attaching the formula
 * keeps it.
 */
const MAPPING_ONLY_STATE = {
  activeFormulaVersionId: null,
  formulaRevision: 0,
  publicationRevision: 0,
  officialCutoffDate: null,
  publishedSellpiaSourceImportRunId: null,
  publishedAdvertisingSourceImportRunId: null,
  publishedMappingGeneration: null,
  publishedAt: null,
} as const satisfies Prisma.MasterProductAbcFormulaStateWhereInput;

/**
 * The server's advisory lock keys for one organization, in the order the
 * server takes them (`apps/server/src/products/transaction/product-mapping-lock.ts`
 * and `MasterProductAbcRepositoryAdapter.publish`).
 *
 * Publication takes four locks: Sellpia profitability, Coupang ad
 * profitability, product mapping, then master-product ABC. This step changes
 * only formula state, so it takes only the last two, in the same relative
 * order. A mapping-generation change or a publication for the organization
 * waits for this transaction, or this transaction waits for it. Every holder
 * takes these locks in this order, so neither side can hold the second lock
 * while waiting for the first, and the wait cannot become a deadlock.
 */
export function absoluteProductAbcFormulaLockKeys(
  organizationId: string,
): readonly [productMapping: string, masterProductAbc: string] {
  return [
    `kiditem.product-mapping:${organizationId}`,
    `kiditem.master-product-abc:${organizationId}`,
  ];
}

export type AbsoluteProductAbcFormulaOutcome = {
  formulaVersionId: string;
  createdFormulaVersion: boolean;
  createdFormulaState: boolean;
  attachedMappingOnlyState: boolean;
};

/**
 * Raised when an organization's stored formula cannot take the current one.
 * Callers let it end their transaction, so nothing this module wrote stays.
 */
export class AbsoluteProductAbcFormulaConflictError extends Error {
  constructor(
    readonly checksumMismatchOrganizationIds: readonly string[],
    readonly unattachedStateOrganizationIds: readonly string[],
  ) {
    super(conflictMessage(checksumMismatchOrganizationIds, unattachedStateOrganizationIds));
    this.name = 'AbsoluteProductAbcFormulaConflictError';
  }
}

/**
 * Installs the current absolute ABC formula for one organization inside the
 * caller's transaction and returns what changed. Running it again changes
 * nothing.
 */
export async function ensureAbsoluteProductAbcFormulaForOrganization(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<AbsoluteProductAbcFormulaOutcome> {
  for (const key of absoluteProductAbcFormulaLockKeys(organizationId)) {
    await tx.$queryRaw`
      -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
      SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS "lock"
    `;
  }

  const stored = await tx.masterProductAbcFormulaVersion.findUnique({
    where: {
      organizationId_formulaKey_version: {
        organizationId,
        formulaKey: FORMULA_KEY,
        version: FORMULA_VERSION,
      },
    },
    select: { id: true, formulaChecksum: true },
  });
  if (stored && stored.formulaChecksum !== PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH) {
    throw new AbsoluteProductAbcFormulaConflictError([organizationId], []);
  }
  const formula = stored ?? await tx.masterProductAbcFormulaVersion.create({
    data: {
      organizationId,
      formulaKey: FORMULA_KEY,
      version: FORMULA_VERSION,
      formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD)),
      formulaChecksum: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
    },
    select: { id: true },
  });

  const createdState = await tx.masterProductAbcFormulaState.createMany({
    data: [{
      organizationId,
      activeFormulaVersionId: formula.id,
      formulaRevision: 1,
      publicationRevision: 0,
      mappingGeneration: 0n,
    }],
    skipDuplicates: true,
  });
  const attachedState = createdState.count > 0
    ? { count: 0 }
    : await tx.masterProductAbcFormulaState.updateMany({
      where: { organizationId, ...MAPPING_ONLY_STATE },
      data: { activeFormulaVersionId: formula.id, formulaRevision: 1 },
    });

  const state = await tx.masterProductAbcFormulaState.findUniqueOrThrow({
    where: { organizationId },
    select: { activeFormulaVersionId: true },
  });
  if (state.activeFormulaVersionId === null) {
    throw new AbsoluteProductAbcFormulaConflictError([], [organizationId]);
  }

  return {
    formulaVersionId: formula.id,
    createdFormulaVersion: stored === null,
    createdFormulaState: createdState.count > 0,
    attachedMappingOnlyState: attachedState.count > 0,
  };
}

/**
 * Checks every organization in id order in one transaction and reports every
 * conflicting organization at once; any conflict rolls the whole step back.
 */
export const absoluteProductAbcFormulaStep: EnsureStep = {
  id: 'ensure:absolute_product_abc_formula',
  name: 'Attach the current absolute product ABC formula to every organization',
  async run(tx) {
    const organizations = await tx.organization.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const checksumMismatchOrganizationIds: string[] = [];
    const unattachedStateOrganizationIds: string[] = [];
    let createdFormulaVersionCount = 0;
    let createdFormulaStateCount = 0;
    let attachedMappingOnlyStateCount = 0;

    for (const organization of organizations) {
      let outcome: AbsoluteProductAbcFormulaOutcome;
      try {
        outcome = await ensureAbsoluteProductAbcFormulaForOrganization(tx, organization.id);
      } catch (error) {
        if (error instanceof AbsoluteProductAbcFormulaConflictError) {
          // Raised before any failed statement, so the transaction can go on
          // to report the remaining organizations.
          checksumMismatchOrganizationIds.push(...error.checksumMismatchOrganizationIds);
          unattachedStateOrganizationIds.push(...error.unattachedStateOrganizationIds);
          continue;
        }
        throw Object.assign(
          new Error(
            `${absoluteProductAbcFormulaStep.id} failed for organization ${organization.id}: `
              + (error instanceof Error ? error.message : String(error)),
          ),
          { cause: error },
        );
      }
      if (outcome.createdFormulaVersion) createdFormulaVersionCount += 1;
      if (outcome.createdFormulaState) createdFormulaStateCount += 1;
      if (outcome.attachedMappingOnlyState) attachedMappingOnlyStateCount += 1;
    }

    if (checksumMismatchOrganizationIds.length > 0 || unattachedStateOrganizationIds.length > 0) {
      throw new AbsoluteProductAbcFormulaConflictError(
        checksumMismatchOrganizationIds,
        unattachedStateOrganizationIds,
      );
    }
    return {
      changedRows: createdFormulaVersionCount + createdFormulaStateCount + attachedMappingOnlyStateCount,
      details: {
        organizationCount: organizations.length,
        createdFormulaVersionCount,
        createdFormulaStateCount,
        attachedMappingOnlyStateCount,
      },
    };
  },
};

function conflictMessage(
  checksumMismatchOrganizationIds: readonly string[],
  unattachedStateOrganizationIds: readonly string[],
): string {
  const problems: string[] = [];
  if (checksumMismatchOrganizationIds.length > 0) {
    problems.push(
      `${FORMULA_KEY} v${FORMULA_VERSION} is stored with a checksum other than `
        + `${PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH} (a changed payload needs a new formula version) `
        + `for organizations ${checksumMismatchOrganizationIds.join(', ')}`,
    );
  }
  if (unattachedStateOrganizationIds.length > 0) {
    problems.push(
      'a formula state names no formula but is not mapping-only (repair it with a reviewed data migration) '
        + `for organizations ${unattachedStateOrganizationIds.join(', ')}`,
    );
  }
  return `The current absolute product ABC formula was not installed: ${problems.join('; ')}. `
    + 'Nothing was written; the command can run again once these organizations are fixed.';
}
