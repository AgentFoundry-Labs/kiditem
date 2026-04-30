import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { BundleStockService } from '../../../../products/application/service/bundle-stock.service';
import type { BundleStockPort } from '../../../application/port/out/bundle-stock.port';
import type { RepositoryTransaction } from '../../../application/port/out/repository-transaction';

// Cross-owner-domain bridge to products. Inventory's stock-mutation flow calls
// BundleStockService.recomputeForComponent only through this adapter, which
// keeps the products dependency invisible to application/service/** code
// (ADR-0014 single-writer invariant + the architecture contract's
// "no concrete adapter/out/** import in application services" rule).
@Injectable()
export class BundleStockAdapter implements BundleStockPort {
  constructor(private readonly bundleStock: BundleStockService) {}

  recomputeForComponent(
    companyId: string,
    componentOptionId: string,
    tx: RepositoryTransaction,
  ): Promise<string[]> {
    return this.bundleStock.recomputeForComponent(
      companyId,
      componentOptionId,
      tx as Prisma.TransactionClient,
    );
  }
}
