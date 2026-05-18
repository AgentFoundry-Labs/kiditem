import { Inject, Injectable } from '@nestjs/common';
import type {
  ProductManagementListItem,
  ProductManagementListResponse,
  ProductManagementPipelineCounts,
} from '@kiditem/shared/product';
import { ListMastersQuery } from '../../dto/list-masters.query';
import { ProductManagementEnrichmentService, type MasterWithImageRows } from './product-management-enrichment.service';
import { ProductManagementFactsService } from './product-management-facts.service';
import { ProductManagementGradeService } from './product-management-grade.service';
import { buildPipelineCounts, emptyPipelineCounts } from './product-management-pipeline';
import {
  PRODUCT_MANAGEMENT_REPOSITORY_PORT,
  type ProductManagementMasterWhereInput,
  type ProductManagementRepositoryPort,
} from '../port/out/product-management.repository.port';
import type {
  ManagementFacts,
  ProductManagementGradeInfo,
} from './product-management.read-model';

export type { ProductManagementListItem, ProductManagementPipelineCounts } from '@kiditem/shared/product';

@Injectable()
export class ProductManagementService {
  constructor(
    @Inject(PRODUCT_MANAGEMENT_REPOSITORY_PORT)
    private readonly management: ProductManagementRepositoryPort,
    private readonly facts: ProductManagementFactsService,
    private readonly grades: ProductManagementGradeService,
    private readonly enrichment: ProductManagementEnrichmentService,
  ) {}

  async list(
    organizationId: string,
    q: ListMastersQuery,
  ): Promise<ProductManagementListResponse> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const matchingIds = await this.resolveAdvancedFilterMasterIds(organizationId, q);
    if (matchingIds !== null && matchingIds.length === 0) {
      return { items: [], total: 0, page, limit, nextCursor: null } satisfies ProductManagementListResponse;
    }
    const whereInput = this.masterWhere(organizationId, q, matchingIds);
    const gradeByMaster = await this.gradeByMaster(organizationId, q.period ?? 14);

    const [total, rows] = await Promise.all([
      this.management.countMasters(whereInput),
      this.managementPageRows(organizationId, whereInput, page, limit),
    ]);

    const items = await this.enrichRows(organizationId, rows, q.period ?? 14, gradeByMaster);
    return { items, total, page, limit, nextCursor: null } satisfies ProductManagementListResponse;
  }

  async pipelineStats(
    organizationId: string,
    q: Pick<ListMastersQuery, 'status' | 'period' | 'grade' | 'ad' | 'stock' | 'category' | 'categoryGroup' | 'search'>,
  ): Promise<ProductManagementPipelineCounts> {
    const period = q.period ?? 14;
    const gradeByMaster = await this.gradeByMaster(organizationId, period);
    // NOTE: PR #193 review #1 (yhc125) — pipeline-stats 는 frontend polling
    // read endpoint 이므로 hidden write (`ProductManagementGradeService.syncGradeChanges`
    // 의 abcGrade update + Alert insert) 를 트리거하지 않는다. grade 동기화는
    // explicit command/job 경로에서만 호출해야 한다 (후속 lane).

    const query = q as ListMastersQuery;
    const matchingIds = await this.resolveAdvancedFilterMasterIds(organizationId, query);
    if (matchingIds !== null && matchingIds.length === 0) return this.emptyPipelineCounts();

    const masterIds = await this.management.findPipelineMasterIds(
      this.masterWhere(organizationId, query, matchingIds),
    );
    if (masterIds.length === 0) return this.emptyPipelineCounts();

    const [facts, channelLinkedMasterIds] = await Promise.all([
      this.managementFacts(organizationId, masterIds, period),
      this.channelLinkedMasterIds(organizationId, masterIds),
    ]);
    return buildPipelineCounts({
      masterIds,
      gradeByMaster,
      facts,
      channelLinkedMasterIds,
      emptyInventory: () => this.emptyInventory(),
    });
  }

  private async managementPageRows(
    organizationId: string,
    whereInput: ProductManagementMasterWhereInput,
    page: number,
    limit: number,
  ): Promise<MasterWithImageRows[]> {
    const candidates = await this.management.findManagementCandidates(whereInput);
    if (candidates.length === 0) return [];

    const inventory = await this.facts.inventoryByMaster(organizationId, candidates.map((row) => row.id));
    const orderedIds = candidates
      .sort((a, b) => {
        const stockDiff = (inventory.get(b.id)?.currentStock ?? 0) - (inventory.get(a.id)?.currentStock ?? 0);
        if (stockDiff !== 0) return stockDiff;
        return b.createdAt.getTime() - a.createdAt.getTime();
      })
      .slice((page - 1) * limit, page * limit)
      .map((row) => row.id);

    return this.management.findMastersByIds(organizationId, orderedIds);
  }

  private masterWhere(
    organizationId: string,
    q: ListMastersQuery,
    matchingIds: string[] | null,
  ): ProductManagementMasterWhereInput {
    return { organizationId, query: q, matchingIds };
  }

  private async resolveAdvancedFilterMasterIds(
    organizationId: string,
    q: ListMastersQuery,
  ): Promise<string[] | null> {
    const sets: Array<Set<string>> = [];

    if (q.ad) {
      const ads = await this.facts.currentAdvertisingState(organizationId);
      const allIds = await this.facts.allMasterIds(organizationId);
      sets.push(q.ad === 'ad' ? ads.masterIds : new Set(allIds.filter((id) => !ads.masterIds.has(id))));
    }

    if (q.stock) {
      const allIds = await this.facts.allMasterIds(organizationId);
      const stock = await this.facts.inventoryByMaster(organizationId, allIds);
      sets.push(new Set(allIds.filter((id) => {
        const current = stock.get(id) ?? this.emptyInventory();
        if (q.stock === 'zero') return current.stockStatus === 'out';
        if (q.stock === 'risk') return current.stockStatus !== 'healthy';
        return current.stockStatus === 'healthy';
      })));
    }

    if (q.status) {
      const statuses = await this.facts.statusByMaster(organizationId);
      const allIds = await this.facts.allMasterIds(organizationId);
      sets.push(new Set(allIds.filter((id) => (statuses.get(id) ?? 'unknown') === q.status)));
    }

    if (q.grade === 'minus' || q.grade === 'low') {
      const allIds = await this.facts.allMasterIds(organizationId);
      const [profits, channelLinkedMasterIds] = await Promise.all([
        this.profitByMaster(organizationId, allIds, q.period ?? 14),
        this.channelLinkedMasterIds(organizationId, allIds),
      ]);
      sets.push(new Set(allIds.filter((id) => {
        const profit = profits.get(id);
        if (!channelLinkedMasterIds.has(id) || !profit) return false;
        const rate = profit.profitRate;
        return q.grade === 'minus' ? rate < 0 : rate >= 0 && rate <= 3;
      })));
    }

    if (q.grade === 'A' || q.grade === 'B' || q.grade === 'C') {
      const grades = await this.gradeByMaster(organizationId, q.period ?? 14);
      sets.push(new Set([...grades.entries()]
        .filter(([, info]) => info.grade === q.grade)
        .map(([id]) => id)));
    }

    if (sets.length === 0) return null;
    const [first, ...rest] = sets;
    return [...first].filter((id) => rest.every((s) => s.has(id)));
  }

  private async enrichRows(
    organizationId: string,
    rows: MasterWithImageRows[],
    period: number,
    gradeByMaster: Map<string, ProductManagementGradeInfo>,
  ): Promise<ProductManagementListItem[]> {
    return this.enrichment.enrichRows(organizationId, rows, period, gradeByMaster);
  }

  private async gradeByMaster(
    organizationId: string,
    period: number,
  ): Promise<Map<string, ProductManagementGradeInfo>> {
    return this.grades.gradeByMaster(organizationId, period);
  }

  private async managementFacts(
    organizationId: string,
    masterIds: string[],
    period: number,
  ): Promise<ManagementFacts> {
    return this.facts.managementFacts(organizationId, masterIds, period);
  }

  private async channelLinkedMasterIds(organizationId: string, masterIds: string[]): Promise<Set<string>> {
    return this.facts.channelLinkedMasterIds(organizationId, masterIds);
  }

  private async profitByMaster(
    organizationId: string,
    masterIds?: string[],
    period: number = 14,
  ): Promise<Map<string, { revenue: number; netProfit: number; profitRate: number; orderCount: number }>> {
    return this.facts.profitByMaster(organizationId, masterIds, period);
  }

  private emptyInventory(): ManagementFacts['inventoryByMaster'] extends Map<string, infer T> ? T : never {
    return this.facts.emptyInventory();
  }

  private emptyPipelineCounts(): ProductManagementPipelineCounts {
    return emptyPipelineCounts();
  }
}
