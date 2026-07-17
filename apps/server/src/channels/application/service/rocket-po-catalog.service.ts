import { createHash } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  RocketPurchasePreviewRequestSchema,
  type RocketPoCatalogRow,
  type RocketPurchasePreviewRequest,
} from '@kiditem/shared/rocket-purchase-preview';
import {
  type RocketPoCatalogPort,
  type RocketPoCatalogResolution,
} from '../port/in/rocket-po-catalog.port';
import {
  ROCKET_PO_CATALOG_REPOSITORY_PORT,
  type RocketPoCatalogRepositoryPort,
} from '../port/out/repository/rocket-po-catalog.repository.port';

const ARTIFACT_FILE_NAME = 'rocket-po-catalog.json' as const;

@Injectable()
export class RocketPoCatalogService implements RocketPoCatalogPort {
  constructor(
    @Inject(ROCKET_PO_CATALOG_REPOSITORY_PORT)
    private readonly repository: RocketPoCatalogRepositoryPort,
  ) {}

  async publishAndResolve(input: {
    organizationId: string;
    userId: string;
    request: RocketPurchasePreviewRequest;
  }): Promise<RocketPoCatalogResolution> {
    const request = RocketPurchasePreviewRequestSchema.parse(input.request);
    if (!isCompleteCollection(request)) {
      return { blockingReason: 'collection_incomplete', catalog: null, identities: [] };
    }

    const account = await this.repository.findActiveRocketAccount({
      organizationId: input.organizationId,
      channelAccountId: request.channelAccountId,
    });
    if (!account) throw new NotFoundException('Active Rocket channel account not found');
    if (request.rows.length === 0) {
      return { blockingReason: null, catalog: null, identities: [] };
    }
    const accountVendorId = account.vendorId?.trim() ?? '';
    const evidenceVendorId = request.collection.vendorId.trim();
    if (accountVendorId.length === 0
      || (evidenceVendorId.length > 0 && accountVendorId !== evidenceVendorId)) {
      return { blockingReason: 'vendor_mismatch', catalog: null, identities: [] };
    }
    const vendorId = evidenceVendorId || accountVendorId;

    const rows = [...request.rows].sort((left, right) =>
      left.poLineId.localeCompare(right.poLineId));
    const artifactHash = canonicalArtifactHash(request, vendorId, rows);
    const published = await this.repository.publish({
      organizationId: input.organizationId,
      userId: input.userId,
      channelAccountId: request.channelAccountId,
      vendorId,
      fileName: ARTIFACT_FILE_NAME,
      artifactHash,
      rows,
    });
    const { identities, ...catalog } = published;
    return { blockingReason: null, catalog, identities };
  }
}

function isCompleteCollection(request: RocketPurchasePreviewRequest): boolean {
  const evidence = request.collection;
  const rowPoNumbers = new Set(request.rows.map(({ poNumber }) => poNumber));
  const requiresVendorEvidence = request.rows.length > 0;
  return (!requiresVendorEvidence || evidence.vendorId.length > 0)
    && !evidence.truncated
    && evidence.failedPoNumbers.length === 0
    && evidence.listPagesRead < 20
    && evidence.detailPoCount < 40
    && evidence.totalListPages <= evidence.listPagesRead
    && evidence.detailPoCount === rowPoNumbers.size
    && (!requiresVendorEvidence
      || request.rows.every(({ vendorId }) => vendorId === evidence.vendorId));
}

function canonicalArtifactHash(
  request: RocketPurchasePreviewRequest,
  vendorId: string,
  rows: RocketPoCatalogRow[],
): string {
  const canonical = JSON.stringify({
    collection: {
      vendorId,
      listPagesRead: request.collection.listPagesRead,
      totalListPages: request.collection.totalListPages,
      truncated: request.collection.truncated,
      detailPoCount: request.collection.detailPoCount,
      failedPoNumbers: [...request.collection.failedPoNumbers].sort(),
    },
    rows,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
