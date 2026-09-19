import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SalesProductMallPriceAdoption } from '@kiditem/shared/sales-product';
import { planMallPriceAdoption } from '../../domain/sales-product-mall-prices';
import {
  SALES_PRODUCT_REPOSITORY_PORT,
  type SalesProductRepositoryPort,
} from '../port/out/repository/sales-product.repository.port';

const CONFLICT_SAMPLES = 20;

/**
 * 몰 가격을 몰별 값으로 가져온다(사장님 2026-09-19). 몰에 지금 걸린 가격이 판매상품 기준과 다르면 그 몰의 몰별 판매가를
 * 몰 가격에 맞춘다 — 몰은 건드리지 않는다. 앞으로 KidItem 에서 가격을 바꾸면 그때 몰로 보낸다.
 */
@Injectable()
export class SalesProductMallPriceService {
  private readonly logger = new Logger(SalesProductMallPriceService.name);

  constructor(
    @Inject(SALES_PRODUCT_REPOSITORY_PORT)
    private readonly repository: SalesProductRepositoryPort,
  ) {}

  async adopt(organizationId: string, apply: boolean): Promise<SalesProductMallPriceAdoption> {
    const [candidates, accounts] = await Promise.all([
      this.repository.readMallPriceCandidates(organizationId),
      this.repository.listChannelAccounts(organizationId),
    ]);
    const plan = planMallPriceAdoption(candidates);
    if (apply && plan.writes.length > 0) {
      await this.repository.setChannelOverrideSalePrices(organizationId, plan.writes);
    }
    const productById = new Map(candidates.products.map((product) => [product.id, product]));
    const mallNameById = new Map(accounts.map((account) => [account.id, account.name]));
    const byMall: Record<string, number> = {};
    for (const write of plan.writes) {
      const mallName = mallNameById.get(write.channelAccountId) ?? write.channelAccountId;
      byMall[mallName] = (byMall[mallName] ?? 0) + 1;
    }
    const result: SalesProductMallPriceAdoption = {
      applied: apply,
      pairs: plan.writes.length,
      products: new Set(plan.writes.map((write) => write.salesProductId)).size,
      unchanged: plan.unchanged,
      conflicts: plan.conflicts.length,
      conflictSamples: plan.conflicts.slice(0, CONFLICT_SAMPLES).map((conflict) => ({
        code: productById.get(conflict.salesProductId)?.code ?? '',
        name: productById.get(conflict.salesProductId)?.name ?? '',
        mallName: mallNameById.get(conflict.channelAccountId) ?? '',
        reason: conflict.reason,
        prices: conflict.prices,
      })),
      byMall,
    };
    if (apply) {
      this.logger.log(
        `몰 가격을 몰별 값으로 org=${organizationId} 상품 × 몰 ${result.pairs} · 그대로 ${result.unchanged} · 엇갈림 ${result.conflicts}`,
      );
    }
    return result;
  }
}
