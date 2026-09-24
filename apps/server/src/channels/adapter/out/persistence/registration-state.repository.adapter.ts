import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  AVAILABILITY_EXECUTION_KINDS,
  LISTING_SHAPING_EXECUTION_KINDS,
  type FrozenRegistrationFacts,
} from '../../../domain/registration/registration-account-state';
import type {
  RegistrationStateAccountFacts,
  RegistrationStateExecutionFact,
  RegistrationStateListingFact,
  RegistrationStatePersistencePort,
  RegistrationStateProductFacts,
  RegistrationStateTargetFact,
} from '../../../application/port/out/persistence/registration-state.persistence.port';

type ExecutionRow = {
  id: string;
  registration_target_id: string;
  execution_kind: string;
  status: string;
  provider_outcome: string;
  created_at: Date;
  completed_at: Date | null;
};

type FrozenRow = {
  registration_target_id: string;
  target_version: string | null;
  product_version: string | null;
  detail_page_revision_id: string | null;
  representative_image_asset_id: string | null;
};

type AvailabilityRow = {
  registration_target_id: string | null;
  channel_listing_id: string | null;
  channel_account_id: string;
  execution_kind: string;
  status: string;
  created_at: Date;
};

/**
 * 등록 상태 reader 의 Channels 행 읽기(KID-320). `product_registration_executions` 를 상태용으로 읽는 등록된
 * reader 다(ADR-0009, `scripts/ledger-readers.json`). 판정은 `RegistrationStateService` 가 도메인 규칙으로 한다.
 *
 * 상품 수와 무관하게 쿼리 일곱 번이다 — 상품 · 설정 · 리스팅 · 계정, 그리고 대상별 최신 등록성 실행,
 * 대상별 마지막 성공 등록성 실행이 얼린 값, (대상 · 리스팅)별 최신 가용성 실행을 `DISTINCT ON` 으로 한 번씩.
 */
@Injectable()
export class RegistrationStateRepositoryAdapter implements RegistrationStatePersistencePort {
  constructor(private readonly prisma: PrismaService) {}

  async readFacts(organizationId: string, salesProductIds: readonly string[]): Promise<Map<string, RegistrationStateProductFacts>> {
    const result = new Map<string, RegistrationStateProductFacts>();
    const ids = [...new Set(salesProductIds.filter(Boolean))];
    if (ids.length === 0) return result;

    const products = await this.prisma.salesProduct.findMany({
      where: { organizationId, id: { in: ids } },
      select: { id: true, version: true },
    });
    if (products.length === 0) return result;
    const productIds = products.map((product) => product.id);

    const [targets, listings] = await Promise.all([
      this.prisma.registrationTarget.findMany({
        where: { organizationId, salesProductId: { in: productIds }, archivedAt: null },
        select: { id: true, salesProductId: true, channelAccountId: true, version: true, selectedThumbnailAssetId: true, selectedDetailPageRevisionId: true },
      }),
      this.prisma.channelListing.findMany({
        where: { organizationId, salesProductId: { in: productIds }, isActive: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, salesProductId: true, channelAccountId: true, externalId: true, status: true, isActive: true },
      }),
    ]);

    const targetIds = targets.map((row) => row.id);
    const listingIds = listings.map((row) => row.id);
    const accountIds = [...new Set([...targets.map((row) => row.channelAccountId), ...listings.map((row) => row.channelAccountId)])];
    const [accounts, latestShaping, frozen, availability] = await Promise.all([
      accountIds.length === 0 ? [] : this.prisma.channelAccount.findMany({
        where: { organizationId, id: { in: accountIds } },
        select: { id: true, channel: true, name: true },
      }),
      this.readLatestListingShaping(organizationId, targetIds),
      this.readLastSucceededFrozen(organizationId, targetIds),
      this.readLatestAvailability(organizationId, targetIds, listingIds),
    ]);

    const accountById = new Map(accounts.map((row) => [row.id, row]));
    const shapingByTarget = new Map(latestShaping.map((row) => [row.registration_target_id, row]));
    const frozenByTarget = new Map(frozen.map((row) => [row.registration_target_id, row]));
    const key = (salesProductId: string, channelAccountId: string) => `${salesProductId}:${channelAccountId}`;

    const targetByAccount = new Map(targets.map((row) => [key(row.salesProductId, row.channelAccountId), row]));
    const listingByAccount = new Map<string, typeof listings[number]>();
    for (const row of listings) {
      if (!row.salesProductId) continue;
      const accountKey = key(row.salesProductId, row.channelAccountId);
      // 가장 최근 리스팅이 먼저 온다.
      if (!listingByAccount.has(accountKey)) listingByAccount.set(accountKey, row);
    }

    const productByTarget = new Map(targets.map((row) => [row.id, row.salesProductId]));
    const productByListing = new Map(listings.map((row) => [row.id, row.salesProductId]));
    const availabilityByAccount = new Map<string, AvailabilityRow>();
    for (const row of availability) {
      const salesProductId = (row.registration_target_id ? productByTarget.get(row.registration_target_id) : undefined)
        ?? (row.channel_listing_id ? productByListing.get(row.channel_listing_id) : undefined);
      if (!salesProductId) continue;
      const accountKey = key(salesProductId, row.channel_account_id);
      const previous = availabilityByAccount.get(accountKey);
      if (!previous || row.created_at > previous.created_at) availabilityByAccount.set(accountKey, row);
    }

    for (const product of products) {
      const productAccountIds = accountIds.filter((accountId) =>
        targetByAccount.has(key(product.id, accountId)) || listingByAccount.has(key(product.id, accountId)));
      const rows = productAccountIds.flatMap((channelAccountId): RegistrationStateAccountFacts[] => {
        const account = accountById.get(channelAccountId);
        if (!account) return [];
        const target = targetByAccount.get(key(product.id, channelAccountId));
        const listing = listingByAccount.get(key(product.id, channelAccountId));
        const availabilityRow = availabilityByAccount.get(key(product.id, channelAccountId));
        return [{
          channelAccountId,
          channel: account.channel,
          channelAccountName: account.name,
          target: target ? toTarget(target) : null,
          listing: listing ? toListing(listing) : null,
          latestListingShaping: target ? toExecution(shapingByTarget.get(target.id)) : null,
          lastSucceededFrozen: target ? toFrozen(frozenByTarget.get(target.id)) : null,
          latestAvailability: availabilityRow ? { kind: availabilityRow.execution_kind, status: availabilityRow.status } : null,
        }];
      });
      result.set(product.id, { salesProductId: product.id, productVersion: product.version, accounts: rows });
    }
    return result;
  }

  private readLatestListingShaping(organizationId: string, targetIds: readonly string[]): Promise<ExecutionRow[]> {
    if (targetIds.length === 0) return Promise.resolve([]);
    return this.prisma.$queryRaw<ExecutionRow[]>(Prisma.sql`
      SELECT DISTINCT ON (registration_target_id)
        id::text AS id,
        registration_target_id::text AS registration_target_id,
        execution_kind, status, provider_outcome, created_at, completed_at
      FROM product_registration_executions
      WHERE organization_id = ${organizationId}::uuid
        AND registration_target_id = ANY(${[...targetIds]}::uuid[])
        AND execution_kind IN (${Prisma.join([...LISTING_SHAPING_EXECUTION_KINDS])})
      ORDER BY registration_target_id, created_at DESC, id DESC
    `);
  }

  private readLastSucceededFrozen(organizationId: string, targetIds: readonly string[]): Promise<FrozenRow[]> {
    if (targetIds.length === 0) return Promise.resolve([]);
    return this.prisma.$queryRaw<FrozenRow[]>(Prisma.sql`
      SELECT DISTINCT ON (registration_target_id)
        registration_target_id::text AS registration_target_id,
        submission_payload_json->>'targetVersion' AS target_version,
        submission_payload_json#>>'{product,version}' AS product_version,
        submission_payload_json#>>'{detailPage,revisionId}' AS detail_page_revision_id,
        submission_payload_json#>>'{adapterPayload,representativeImage,assetId}' AS representative_image_asset_id
      FROM product_registration_executions
      WHERE organization_id = ${organizationId}::uuid
        AND registration_target_id = ANY(${[...targetIds]}::uuid[])
        AND execution_kind IN (${Prisma.join([...LISTING_SHAPING_EXECUTION_KINDS])})
        AND status = 'succeeded'
      ORDER BY registration_target_id, created_at DESC, id DESC
    `);
  }

  private readLatestAvailability(organizationId: string, targetIds: readonly string[], listingIds: readonly string[]): Promise<AvailabilityRow[]> {
    if (targetIds.length === 0 && listingIds.length === 0) return Promise.resolve([]);
    return this.prisma.$queryRaw<AvailabilityRow[]>(Prisma.sql`
      SELECT DISTINCT ON (registration_target_id, channel_listing_id)
        registration_target_id::text AS registration_target_id,
        channel_listing_id::text AS channel_listing_id,
        channel_account_id::text AS channel_account_id,
        execution_kind, status, created_at
      FROM product_registration_executions
      WHERE organization_id = ${organizationId}::uuid
        AND (registration_target_id = ANY(${[...targetIds]}::uuid[]) OR channel_listing_id = ANY(${[...listingIds]}::uuid[]))
        AND execution_kind IN (${Prisma.join([...AVAILABILITY_EXECUTION_KINDS])})
      ORDER BY registration_target_id, channel_listing_id, created_at DESC, id DESC
    `);
  }
}

function toTarget(row: { id: string; version: number; selectedThumbnailAssetId: string | null; selectedDetailPageRevisionId: string | null }): RegistrationStateTargetFact {
  return {
    id: row.id,
    version: row.version,
    selectedThumbnailAssetId: row.selectedThumbnailAssetId,
    selectedDetailPageRevisionId: row.selectedDetailPageRevisionId,
  };
}

function toListing(row: { id: string; externalId: string; status: string | null; isActive: boolean }): RegistrationStateListingFact {
  return { id: row.id, externalId: row.externalId, status: row.status, isActive: row.isActive };
}

function toExecution(row: ExecutionRow | undefined): RegistrationStateExecutionFact | null {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.execution_kind,
    status: row.status,
    providerOutcome: row.provider_outcome,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function toFrozen(row: FrozenRow | undefined): FrozenRegistrationFacts | null {
  if (!row) return null;
  return {
    targetVersion: integerOrNull(row.target_version),
    productVersion: integerOrNull(row.product_version),
    detailPageRevisionId: row.detail_page_revision_id || null,
    representativeImageAssetId: row.representative_image_asset_id || null,
  };
}

function integerOrNull(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}
