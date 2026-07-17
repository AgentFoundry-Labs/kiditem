import { Inject, Injectable } from '@nestjs/common';
import {
  COUPANG_MOMENTUM_READ_CAPABILITY_PORT,
  type CoupangMomentumReadCapabilityPort,
  type CoupangSerpMomentumSnapshot,
  type CoupangWingSalesMomentumRow,
} from '../../../../advertising/application/port/in/capability/coupang-momentum-read.port';
import type {
  CoupangMomentumPort,
  CoupangSerpSnapshot,
  CoupangWingSalesRow,
} from '../../../application/port/out/cross-domain/coupang-momentum.port';

/**
 * Binds sourcing's local {@link CoupangMomentumPort} to advertising's published
 * read capability. Advertising owns the SERP/Wing fact projection; sourcing only
 * reads it. Mapping is a normalized passthrough kept explicit so the two domains
 * stay decoupled.
 */
@Injectable()
export class CoupangMomentumAdapter implements CoupangMomentumPort {
  constructor(
    @Inject(COUPANG_MOMENTUM_READ_CAPABILITY_PORT)
    private readonly reader: CoupangMomentumReadCapabilityPort,
  ) {}

  async readSerpMomentum(
    organizationId: string,
    days: number,
  ): Promise<CoupangSerpSnapshot[]> {
    const rows = await this.reader.readSerpMomentum(organizationId, days);
    return rows.map(toSerpSnapshot);
  }

  async readWingSalesMomentum(
    organizationId: string,
    days: number,
  ): Promise<CoupangWingSalesRow[]> {
    const rows = await this.reader.readWingSalesMomentum(organizationId, days);
    return rows.map(toWingSalesRow);
  }
}

function toSerpSnapshot(row: CoupangSerpMomentumSnapshot): CoupangSerpSnapshot {
  return {
    keyword: row.keyword,
    businessDate: row.businessDate,
    capturedAt: row.capturedAt,
    itemCount: row.itemCount,
    items: row.items.map((item) => ({ ...item })),
  };
}

function toWingSalesRow(row: CoupangWingSalesMomentumRow): CoupangWingSalesRow {
  return {
    keyword: row.keyword,
    businessDate: row.businessDate,
    vendorItemId: row.vendorItemId,
    productName: row.productName,
    categoryHierarchy: row.categoryHierarchy,
    salesRank: row.salesRank,
    salesLast28d: row.salesLast28d,
    viewsLast28d: row.viewsLast28d,
    revenueLast28d: row.revenueLast28d,
    conversionRate28d: row.conversionRate28d,
    salePrice: row.salePrice,
    reviewCount: row.reviewCount,
    capturedAt: row.capturedAt,
  };
}
