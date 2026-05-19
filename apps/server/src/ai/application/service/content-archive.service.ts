import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CONTENT_ARCHIVE_REPOSITORY_PORT,
  type ContentArchiveRepositoryPort,
} from '../port/out/repository/content-archive.repository.port';
import {
  buildContentArchiveWorkspaces,
  contentArchiveGenerationItem,
  contentArchiveWorkspaceFromRows,
  type ContentArchiveListQuery,
  type ProductContentGenerationItem,
  type ProductContentWorkspaceItem,
} from './content-archive.read-model';

@Injectable()
export class ContentArchiveService {
  constructor(
    @Inject(CONTENT_ARCHIVE_REPOSITORY_PORT)
    private readonly repository: ContentArchiveRepositoryPort,
  ) {}

  async listWorkspaces(
    organizationId: string,
    query: ContentArchiveListQuery = {},
  ): Promise<{ items: ProductContentWorkspaceItem[]; total: number; page: number; limit: number }> {
    const { page, limit } = normalizePage(query.page, query.limit);
    const rows = await this.repository.listWorkspaceGenerations({ organizationId, query });
    const groups = buildContentArchiveWorkspaces(rows);
    const items = groups.slice((page - 1) * limit, page * limit);
    return { items, total: groups.length, page, limit };
  }

  async listProductWorkspace(
    organizationId: string,
    productId: string,
    query: ContentArchiveListQuery = {},
  ): Promise<{
    workspace: ProductContentWorkspaceItem;
    generations: ProductContentGenerationItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const product = await this.repository.findProduct({ organizationId, productId });
    if (!product) throw new NotFoundException('MasterProduct not found');
    const { page, limit } = normalizePage(query.page, query.limit);
    const { total, rows } = await this.repository.listProductWorkspaceGenerations({
      organizationId,
      productId,
      query,
      page,
      limit,
    });
    const workspace = contentArchiveWorkspaceFromRows({
      workspaceType: 'product',
      key: product.id,
      rows,
      fallbackProduct: product,
    });
    return {
      workspace,
      generations: rows.map(contentArchiveGenerationItem),
      total,
      page,
      limit,
    };
  }

  async listGroupWorkspace(
    organizationId: string,
    groupId: string,
    query: ContentArchiveListQuery = {},
  ): Promise<{
    workspace: ProductContentWorkspaceItem;
    generations: ProductContentGenerationItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const group = await this.repository.findGroup({ organizationId, groupId });
    if (!group) throw new NotFoundException('Content generation group not found');
    const { page, limit } = normalizePage(query.page, query.limit);
    const { total, rows } = await this.repository.listGroupWorkspaceGenerations({
      organizationId,
      groupId,
      query,
      page,
      limit,
    });
    if (total === 0) throw new NotFoundException('Unlinked content workspace not found');
    return {
      workspace: contentArchiveWorkspaceFromRows({ workspaceType: 'unlinked_group', key: group.id, rows }),
      generations: rows.map(contentArchiveGenerationItem),
      total,
      page,
      limit,
    };
  }

  async deleteProductWorkspace(
    organizationId: string,
    productId: string,
  ): Promise<{ ok: true; deletedGenerations: number; deletedAssets: number }> {
    const result = await this.repository.deleteProductWorkspace({ organizationId, productId });
    if (result.status === 'workspace_not_found') {
      throw new NotFoundException('Product content workspace not found');
    }
    return {
      ok: true,
      deletedGenerations: result.deletedGenerations,
      deletedAssets: result.deletedAssets,
    };
  }

  async deleteGroupWorkspace(
    organizationId: string,
    groupId: string,
  ): Promise<{ ok: true; deletedGenerations: number; deletedAssets: number }> {
    const result = await this.repository.deleteGroupWorkspace({ organizationId, groupId });
    if (result.status === 'group_not_found') {
      throw new NotFoundException('Content generation group not found');
    }
    if (result.status === 'workspace_not_found') {
      throw new NotFoundException('Unlinked content workspace not found');
    }
    return {
      ok: true,
      deletedGenerations: result.deletedGenerations,
      deletedAssets: result.deletedAssets,
    };
  }

  async listForSourcingCandidate(
    organizationId: string,
    candidateId: string,
    query: ContentArchiveListQuery = {},
  ): Promise<{ items: ProductContentGenerationItem[]; total: number; page: number; limit: number }> {
    const candidate = await this.repository.findSourcingCandidate({ organizationId, candidateId });
    if (!candidate) throw new NotFoundException('Sourcing candidate not found');
    const { page, limit } = normalizePage(query.page, query.limit);
    let { total, rows } = await this.repository.listSourcingCandidateGenerations({
      organizationId,
      candidateId: candidate.id,
      query,
      page,
      limit,
    });
    if (total === 0 && candidate.promotedMasterId) {
      ({ total, rows } = await this.repository.listPromotedProductGenerations({
        organizationId,
        productId: candidate.promotedMasterId,
        query,
        page,
        limit,
      }));
    }
    return {
      items: rows.map(contentArchiveGenerationItem),
      total,
      page,
      limit,
    };
  }
}

function normalizePage(pageRaw?: number, limitRaw?: number): { page: number; limit: number } {
  const page = Number.isFinite(pageRaw) && pageRaw && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Math.min(
    100,
    Math.max(1, Number.isFinite(limitRaw) && limitRaw ? Math.floor(limitRaw) : 24),
  );
  return { page, limit };
}
