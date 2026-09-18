import type { Prisma } from '@prisma/client';
import type {
  ProductAbcEvaluation,
  ProductAbcFormulaPayload,
} from '@kiditem/shared/product-abc';
import { productAbcEvaluation } from '../mapper/product-abc-evaluation.mapper';

export type PublishedProductAbcFacts = Readonly<{
  publicationRevision: number;
  officialCutoffDate: string;
  publishedAt: string;
  sellpiaSourceImportRunId: string;
  /** Null under a formula that excludes advertising. */
  advertisingSourceImportRunId: string | null;
  mappingGeneration: string;
  formulaRevision: number | null;
  formula: ProductAbcFormulaPayload | null;
}>;

export type ProductAbcPublicationRead = Readonly<{
  currentFormulaRevision: number;
  currentMappingGeneration: string;
  publication: PublishedProductAbcFacts | null;
  products: readonly Readonly<{
    masterProductId: string;
    evaluation: ProductAbcEvaluation | null;
    contributionEligible: boolean;
  }>[];
}>;

/**
 * Read the one Products-owned ABC publication currently retained for an
 * organization. A configuration or mapping change can precede the next
 * explicit publication, so the retained rows are fenced by the published
 * envelope rather than the currently active formula or mapping generation.
 */
export async function readProductAbcPublication(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    masterProductIds?: readonly string[];
  },
): Promise<ProductAbcPublicationRead> {
  const requestedIds = input.masterProductIds
    ? [...new Set(input.masterProductIds)].sort()
    : null;
  const state = await tx.masterProductAbcFormulaState.findUnique({
    where: { organizationId: input.organizationId },
    select: {
      formulaRevision: true,
      publicationRevision: true,
      officialCutoffDate: true,
      publishedAt: true,
      publishedSellpiaSourceImportRunId: true,
      publishedAdvertisingSourceImportRunId: true,
      publishedMappingGeneration: true,
      mappingGeneration: true,
    },
  });
  const products = await tx.masterProduct.findMany({
    where: {
      organizationId: input.organizationId,
      ...(requestedIds ? { id: { in: requestedIds } } : {}),
    },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  const publication = publicationEnvelope(state);
  if (!publication) {
    return {
      currentFormulaRevision: state?.formulaRevision ?? 0,
      currentMappingGeneration: (state?.mappingGeneration ?? 0n).toString(),
      publication: null,
      products: products.map(({ id }) => ({
        masterProductId: id,
        evaluation: null,
        contributionEligible: false,
      })),
    };
  }
  if (products.length === 0) {
    return {
      currentFormulaRevision: state!.formulaRevision,
      currentMappingGeneration: state!.mappingGeneration.toString(),
      publication: { ...publication, formulaRevision: null, formula: null },
      products: [],
    };
  }

  const evaluations = await tx.masterProductAbcEvaluation.findMany({
    where: {
      organizationId: input.organizationId,
      masterProductId: { in: products.map(({ id }) => id) },
      // The owner deliberately carries a product's last official evaluation
      // forward when a later publication has insufficient facts for it. The
      // one current row may therefore predate the publication envelope.
      publicationRevision: { gt: 0, lte: publication.publicationRevision },
      gradeBasisCutoffDate: { lte: state!.officialCutoffDate! },
    },
    include: { formulaVersion: true },
    orderBy: { masterProductId: 'asc' },
  });
  const evaluationByProductId = new Map(evaluations.map((row) => {
    const evaluation = productAbcEvaluation(row);
    return [row.masterProductId, {
      evaluation,
      contributionEligible: evaluation !== null && matchesPublication(row, state!),
    }] as const;
  }));
  const publishedEvaluations = [...evaluationByProductId.values()]
    .filter(({ contributionEligible }) => contributionEligible)
    .map(({ evaluation }) => evaluation)
    .filter((evaluation): evaluation is ProductAbcEvaluation => evaluation !== null);
  const publishedFormulaRevision = oneValue(
    publishedEvaluations.map(({ formulaRevision }) => formulaRevision),
  );
  const publishedFormula = publishedFormulaRevision === null
    ? null
    : publishedEvaluations.find(({ formulaRevision }) =>
      formulaRevision === publishedFormulaRevision)?.formula ?? null;

  return {
    currentFormulaRevision: state!.formulaRevision,
    currentMappingGeneration: state!.mappingGeneration.toString(),
    publication: {
      ...publication,
      formulaRevision: publishedFormulaRevision,
      formula: publishedFormula,
    },
    products: products.map(({ id }) => ({
      masterProductId: id,
      evaluation: evaluationByProductId.get(id)?.evaluation ?? null,
      contributionEligible: evaluationByProductId.get(id)?.contributionEligible ?? false,
    })),
  };
}

export async function readPublishedProductAbcGrades(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; masterProductIds: readonly string[] },
): Promise<ReadonlyMap<string, 'A' | 'B' | 'C'>> {
  const publication = await readProductAbcPublication(tx, input);
  return new Map(publication.products.flatMap((product) =>
    product.evaluation
      ? [[product.masterProductId, product.evaluation.abcGrade] as const]
      : []));
}

/** Grade transitions authored by the current Products publication. */
export async function readCurrentProductAbcGradeChanges(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; publicationRevision: number | null },
): Promise<readonly Readonly<{ oldGrade: string | null; newGrade: string | null }>[]> {
  if (input.publicationRevision === null || input.publicationRevision <= 0) return [];
  return tx.masterProductAbcGradeHistory.findMany({
    where: {
      organizationId: input.organizationId,
      publicationRevision: input.publicationRevision,
    },
    select: { oldGrade: true, newGrade: true },
    orderBy: { id: 'asc' },
  });
}

function publicationEnvelope(state: Readonly<{
  publicationRevision: number;
  officialCutoffDate: Date | null;
  publishedAt: Date | null;
  publishedSellpiaSourceImportRunId: string | null;
  publishedAdvertisingSourceImportRunId: string | null;
  publishedMappingGeneration: bigint | null;
}> | null): Omit<PublishedProductAbcFacts, 'formulaRevision' | 'formula'> | null {
  if (!state || state.publicationRevision <= 0 || !state.officialCutoffDate
    || !state.publishedAt || !state.publishedSellpiaSourceImportRunId
    // Advertising is absent under a formula that excludes it.
    || state.publishedMappingGeneration === null) return null;
  return {
    publicationRevision: state.publicationRevision,
    officialCutoffDate: calendarDate(state.officialCutoffDate),
    publishedAt: state.publishedAt.toISOString(),
    sellpiaSourceImportRunId: state.publishedSellpiaSourceImportRunId,
    advertisingSourceImportRunId: state.publishedAdvertisingSourceImportRunId,
    mappingGeneration: state.publishedMappingGeneration.toString(),
  };
}

function calendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function matchesPublication(
  evaluation: Readonly<{
    publicationRevision: number;
    gradeBasisCutoffDate: Date;
    sellpiaSourceImportRunId: string;
    advertisingSourceImportRunId: string | null;
    mappingGeneration: bigint;
  }>,
  state: Readonly<{
    publicationRevision: number;
    officialCutoffDate: Date | null;
    publishedSellpiaSourceImportRunId: string | null;
    publishedAdvertisingSourceImportRunId: string | null;
    publishedMappingGeneration: bigint | null;
  }>,
): boolean {
  return evaluation.publicationRevision === state.publicationRevision
    && evaluation.gradeBasisCutoffDate.getTime() === state.officialCutoffDate?.getTime()
    && evaluation.sellpiaSourceImportRunId === state.publishedSellpiaSourceImportRunId
    && evaluation.advertisingSourceImportRunId === state.publishedAdvertisingSourceImportRunId
    && evaluation.mappingGeneration === state.publishedMappingGeneration;
}

function oneValue(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.every((value) => value === values[0]) ? values[0]! : null;
}
