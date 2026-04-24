import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  MoneyRange,
  ProductCatalogCounts,
  ProductCatalogDetail,
  ProductCatalogListItem,
  ProductCatalogListResponse,
} from '@kiditem/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { toSerializable } from '../util/serialize';
import { normalizeMasterImages } from './product-image-normalizer';
import { ListProductCatalogQuery } from '../dto/list-product-catalog.query';

type CatalogOptionRow = {
  id: string;
  masterId: string;
  companyId: string;
  sku: string;
  barcode: string | null;
  legacyCode: string | null;
  optionName: string | null;
  sortOrder: number;
  costPrice: number | null;
  sellPrice: number | null;
  commissionRate: Prisma.Decimal | number | null;
  shippingCost: number | null;
  otherCost: number | null;
  isBundle: boolean;
  availableStock: number | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  isTemporary: boolean;
  temporaryReason: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  inventory?: { currentStock: number } | null;
};

type CatalogMasterRow = {
  id: string;
  companyId: string;
  code: string;
  legacyCode: string | null;
  name: string;
  description: string;
  category: string | null;
  brand: string | null;
  tags: unknown;
  optionCounter: number;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  images: unknown;
  abcGrade: string | null;
  profitTag: string | null;
  adTier: string | null;
  adBudgetLimit: number | null;
  healthScore: number | null;
  healthUpdatedAt: Date | null;
  sourceUrl: string | null;
  sourcePlatform: string | null;
  costCny: Prisma.Decimal | number | null;
  marginRate: Prisma.Decimal | number | null;
  pipelineStep: string | null;
  detailPageUrl: string | null;
  thumbnailStrategy: string;
  supplierId: string | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  isTemporary: boolean;
  temporaryReason: string | null;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
  options: CatalogOptionRow[];
};

function range(values: Array<number | null | undefined>): MoneyRange | null {
  const nums = values.filter((v): v is number => typeof v === 'number');
  if (nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

function optionStock(option: CatalogOptionRow): number {
  if (option.isBundle) return option.availableStock ?? 0;
  return option.inventory?.currentStock ?? 0;
}

function activeOptions(row: CatalogMasterRow): CatalogOptionRow[] {
  return row.options
    .filter((o) => o.isActive && !o.isDeleted)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
}

@Injectable()
export class ProductCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string, q: ListProductCatalogQuery): Promise<ProductCatalogListResponse> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const where = this.where(companyId, q);
    const [rows, total] = await Promise.all([
      this.prisma.masterProduct.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: this.include(),
      }),
      this.prisma.masterProduct.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.mapListItem(r as unknown as CatalogMasterRow)),
      total,
      page,
      limit,
    } satisfies ProductCatalogListResponse;
  }

  async detail(companyId: string, id: string): Promise<ProductCatalogDetail> {
    const row = await this.prisma.masterProduct.findFirst({
      where: { id, companyId, isDeleted: false },
      include: this.include(),
    });
    if (!row) throw new NotFoundException('master not found');
    const typed = row as unknown as CatalogMasterRow;
    return {
      ...this.mapListItem(typed),
      options: activeOptions(typed).map((o) => toSerializable(o)),
    } as ProductCatalogDetail;
  }

  async counts(
    companyId: string,
    q: Pick<ListProductCatalogQuery, 'status' | 'pipelineStep'> = {},
  ): Promise<ProductCatalogCounts> {
    const rows = await this.prisma.masterProduct.findMany({
      where: this.where(companyId, q),
      select: { abcGrade: true, adTier: true, pipelineStep: true, isTemporary: true },
    });
    return {
      total: rows.length,
      gradeA: rows.filter((r) => r.abcGrade === 'A').length,
      gradeB: rows.filter((r) => r.abcGrade === 'B').length,
      gradeC: rows.filter((r) => r.abcGrade === 'C').length,
      adCount: rows.filter((r) => !!r.adTier).length,
      noAdCount: rows.filter((r) => !r.adTier).length,
      draftCount: rows.filter((r) => r.pipelineStep === 'draft').length,
      processingCount: rows.filter((r) => r.pipelineStep === 'processing').length,
      processedCount: rows.filter((r) => r.pipelineStep === 'processed').length,
      discontinuedCount: rows.filter((r) => r.pipelineStep === 'discontinued').length,
      temporaryCount: rows.filter((r) => r.isTemporary).length,
    } satisfies ProductCatalogCounts;
  }

  private where(
    companyId: string,
    q: Pick<ListProductCatalogQuery, 'search' | 'grade' | 'pipelineStep' | 'status'>,
  ): Prisma.MasterProductWhereInput {
    const ands: Prisma.MasterProductWhereInput[] = [];
    if (q.search) {
      ands.push({
        OR: [
          { name: { contains: q.search, mode: 'insensitive' } },
          { code: { contains: q.search } },
          { legacyCode: { contains: q.search } },
          { options: { some: { sku: { contains: q.search, mode: 'insensitive' }, isDeleted: false } } },
        ],
      });
    }
    const pipelineStep = q.pipelineStep ?? q.status;
    return {
      companyId,
      isDeleted: false,
      ...(q.grade ? { abcGrade: q.grade } : {}),
      ...(pipelineStep && pipelineStep !== 'all' ? { pipelineStep } : {}),
      ...(ands.length > 0 ? { AND: ands } : {}),
    };
  }

  private include() {
    return {
      options: {
        where: { isDeleted: false, isActive: true },
        orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
        include: { inventory: { select: { currentStock: true } } },
      },
    };
  }

  private mapListItem(row: CatalogMasterRow): ProductCatalogListItem {
    const options = activeOptions(row);
    const serial = toSerializable(row) as Record<string, unknown>;
    delete serial.options;
    return {
      ...serial,
      tags: Array.isArray(row.tags) ? row.tags : [],
      images: normalizeMasterImages(row.images),
      optionCount: options.length,
      representativeSku: options[0]?.sku ?? null,
      priceRange: range(options.map((o) => o.sellPrice)),
      costRange: range(options.map((o) => o.costPrice)),
      totalAvailableStock: options.reduce((sum, option) => sum + optionStock(option), 0),
    } as ProductCatalogListItem;
  }
}
