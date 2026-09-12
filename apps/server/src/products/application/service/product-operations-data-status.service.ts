import { Inject, Injectable } from '@nestjs/common';
import {
  ProductOperationsDataStatusSchema,
  ProductOperationsPeriodDaysSchema,
  type ProductOperationsDataStatus,
} from '@kiditem/shared/product-operations';
import {
  PRODUCT_OPERATIONS_DATA_STATUS_REPOSITORY_PORT,
  type ProductOperationsDataStatusRepositoryPort,
} from '../port/out/repository/product-operations-data-status.repository.port';

@Injectable()
export class ProductOperationsDataStatusService {
  constructor(
    @Inject(PRODUCT_OPERATIONS_DATA_STATUS_REPOSITORY_PORT)
    private readonly repository: ProductOperationsDataStatusRepositoryPort,
  ) {}

  async getStatus(
    organizationId: string,
    rawPeriodDays: unknown,
  ): Promise<ProductOperationsDataStatus> {
    const periodDays = ProductOperationsPeriodDaysSchema.parse(rawPeriodDays);
    const facts = await this.repository.read(organizationId, periodDays);
    const classifiedProductCount = facts.products.filter(
      ({ abcGrade }) => abcGrade !== null,
    ).length;
    const unclassifiedProductCount = Math.max(
      0,
      facts.products.length - classifiedProductCount,
    );
    const mappingRequiredProductCount = facts.products.filter(
      ({ mappingValid }) => !mappingValid,
    ).length;

    return ProductOperationsDataStatusSchema.parse({
      displayDataAsOf: facts.displayDataAsOf,
      formulaRevision: facts.formulaState.formulaRevision,
      publicationRevision: facts.formulaState.publicationRevision,
      officialCutoff: facts.formulaState.officialCutoff,
      publishedAt: facts.formulaState.publishedAt,
      actualCutoff: facts.actualCutoff,
      sources: {
        traffic: facts.traffic,
        sellpia: facts.sellpia,
        advertising: facts.advertising,
        mapping: {
          ready: facts.mappingReady,
          generation: facts.formulaState.mappingGeneration,
        },
      },
      abcSummary: {
        classifiedProductCount,
        unclassifiedProductCount,
        mappingRequiredProductCount,
        otherPendingProductCount: Math.max(
          0,
          unclassifiedProductCount - mappingRequiredProductCount,
        ),
      },
    });
  }
}
