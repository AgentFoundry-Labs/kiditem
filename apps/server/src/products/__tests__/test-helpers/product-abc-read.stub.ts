import {
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  type ProductAbcEvaluation,
  type ProductAbcGrade,
} from '@kiditem/shared/product-abc';
import {
  buildProductAbcReadModel,
  type ProductAbcSourceEvidence,
} from '../../domain/product-abc-read-model';
import type {
  ProductAbcReadPort,
  ProductAbcSnapshot,
} from '../../application/port/in/product-abc-read.port';

const CUTOFF = '2026-06-30';
const SELLPIA_RUN_ID = '00000000-0000-4000-8000-00000000fa01';
const ADVERTISING_RUN_ID = '00000000-0000-4000-8000-00000000fa02';

/**
 * A stand-in for Products' published ABC read, for unit tests whose subject is
 * something else (inventory projection, display media). It answers with real
 * read models built by the owner's own domain builder, so a test can choose a
 * product's grade without choosing its display status.
 */
export function stubProductAbcRead(
  gradeByMasterProductId: Readonly<Record<string, ProductAbcGrade | null>> = {},
): ProductAbcReadPort {
  return {
    async readAbc({ masterProductIds }): Promise<ProductAbcSnapshot> {
      return {
        targetCutoff: CUTOFF,
        actualCutoff: CUTOFF,
        capturedAt: null,
        publication: null,
        products: masterProductIds.map((masterProductId) => {
          const grade = gradeByMasterProductId[masterProductId] ?? null;
          return {
            masterProductId,
            contributionEligible: grade !== null,
            saleStartDate: null,
            abc: buildProductAbcReadModel({
              evaluation: grade === null ? null : publishedEvaluation(grade),
              mappingValid: grade !== null,
              saleStartDate: grade === null ? null : '2026-01-01',
              evidence: {
                actualCutoff: CUTOFF,
                mappingGeneration: '0',
                sellpia: readySource(),
                advertising: readySource(),
              },
              formulaState: {
                formulaRevision: 1,
                publicationRevision: 1,
                officialCutoffDate: CUTOFF,
                publishedAt: null,
                mappingGeneration: '0',
              },
            }),
          };
        }),
      };
    },
  };
}

/** Every named product is unmapped: no evidence, no grade, no evaluation. */
export function stubMissingProductAbcRead(): ProductAbcReadPort {
  return {
    async readAbc({ masterProductIds }): Promise<ProductAbcSnapshot> {
      return {
        targetCutoff: CUTOFF,
        actualCutoff: null,
        capturedAt: null,
        publication: null,
        products: masterProductIds.map((masterProductId) => ({
          masterProductId,
          contributionEligible: false,
          saleStartDate: null,
          abc: buildProductAbcReadModel({
            evaluation: null,
            mappingValid: false,
            saleStartDate: null,
            evidence: {
              actualCutoff: null,
              mappingGeneration: null,
              sellpia: missingSource(),
              advertising: missingSource(),
            },
            formulaState: {
              formulaRevision: 0,
              publicationRevision: 0,
              officialCutoffDate: null,
              publishedAt: null,
              mappingGeneration: '0',
            },
          }),
        })),
      };
    },
  };
}

function readySource(): ProductAbcSourceEvidence {
  return { requiredCutoff: CUTOFF, actualCutoff: CUTOFF, latestAttemptState: 'COMPLETE' };
}

function missingSource(): ProductAbcSourceEvidence {
  return { requiredCutoff: CUTOFF, actualCutoff: null, latestAttemptState: null };
}

function publishedEvaluation(abcGrade: ProductAbcGrade): ProductAbcEvaluation {
  return {
    abcGrade,
    weightedRevenue: 100,
    weightedOrderTimeSupplyCost: 10,
    weightedAdvertisingSpend: 0,
    weightedOperatingProfit: 90,
    operatingProfitVelocity30: 90,
    operatingMargin: 0.9,
    lossPersistence: 0,
    profitScore: 80,
    marginScore: 100,
    consistencyScore: 100,
    economicScore: 90,
    validObservationDays: 30,
    formula: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
    formulaRevision: 1,
    publicationRevision: 1,
    gradeBasisCutoffDate: CUTOFF,
    saleStartDate: '2026-01-01',
    sellpiaOperationId: SELLPIA_RUN_ID,
    advertisingSourceImportRunId: ADVERTISING_RUN_ID,
    sellpiaGeneration: '1',
    advertisingGeneration: '1',
    mappingGeneration: '0',
    calculatedAt: '2026-07-01T00:00:00.000Z',
  };
}
