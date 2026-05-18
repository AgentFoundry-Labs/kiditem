import type { PrismaClient } from '@prisma/client';
import { MasterCodeRepositoryAdapter } from '../adapter/out/repository/master-code.repository.adapter';
import { MasterProductRepositoryAdapter } from '../adapter/out/repository/master-product.repository.adapter';
import { ProductOptionRepositoryAdapter } from '../adapter/out/repository/product-option.repository.adapter';
import { BundleRepositoryAdapter } from '../adapter/out/repository/bundle.repository.adapter';
import { ProductsTransactionAdapter } from '../adapter/out/repository/products-transaction.adapter';
import { MastersService } from '../application/service/masters.service';
import { OptionsService } from '../application/service/options.service';
import { BundleStockService } from '../application/service/bundle-stock.service';
import { BundleComponentsService } from '../application/service/bundle-components.service';
import { StorageService } from '../../common/storage/storage.service';

export function createProductsTestServices(
  prisma: PrismaClient,
  storage: StorageService = null as unknown as StorageService,
): {
  mastersSvc: MastersService;
  optionsSvc: OptionsService;
  bundleStockSvc: BundleStockService;
  bundleComponentsSvc: BundleComponentsService;
  codeRepo: MasterCodeRepositoryAdapter;
} {
  const codeRepo = new MasterCodeRepositoryAdapter(prisma as any);
  const mastersRepo = new MasterProductRepositoryAdapter(prisma as any);
  const optionRepo = new ProductOptionRepositoryAdapter(prisma as any);
  const bundleRepo = new BundleRepositoryAdapter(prisma as any);
  const transactions = new ProductsTransactionAdapter(prisma as any);
  const bundleStockSvc = new BundleStockService(bundleRepo, transactions);
  const mastersSvc = new MastersService(mastersRepo, codeRepo, transactions, storage);
  const optionsSvc = new OptionsService(optionRepo, transactions, bundleStockSvc);
  const bundleComponentsSvc = new BundleComponentsService(bundleRepo, transactions, bundleStockSvc);

  return {
    mastersSvc,
    optionsSvc,
    bundleStockSvc,
    bundleComponentsSvc,
    codeRepo,
  };
}
