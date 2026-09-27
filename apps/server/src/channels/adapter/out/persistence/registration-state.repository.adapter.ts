import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  AVAILABILITY_EXECUTION_KINDS,
  DOCUMENT_BASELINE_EXECUTION_KINDS,
  LISTING_SHAPING_EXECUTION_KINDS,
  type FrozenRegistrationFacts,
} from '../../../domain/registration/registration-account-state';
import { OPERATION_EXPIRED_ERROR_CODE, OPERATION_EXPIRED_ERROR_MESSAGE } from '../../../../common/operation/domain/operation-fence';
import { frozenSnapshot, isFillOnly, readRegistrationOperations, type RegistrationOperationFact } from '../repository/registration-operation-facts';
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
 * 등록 상태 reader 의 Channels 행 읽기(KID-320). 등록 실행은 `channels.registration` 실행이고(KID-364) 실행 계약의 읽기
 * 함수로만 읽는다 — 옛 등록 실행 표는 읽지 않는다. 판정은 `RegistrationStateService` 가 도메인 규칙으로 한다.
 *
 * 상품 수와 무관하게 쿼리 일곱 번이다 — 상품 · 설정 · 리스팅 · 계정, 그리고 대상별 최신 등록성 실행,
 * 대상별 마지막 성공 문서 전송 실행(register · composition_change)이 얼린 값, (대상 · 리스팅)별 최신 가용성 실행을
 * 실행 계약의 읽기 함수로 한 번씩(최신 하나는 시작 역순에서 고른다). 리스팅은 계정마다 가장 최근 것을 활성 여부와 상관없이 읽는다 — 2026-09-23 사용자 결정
 * "비활성화는 등록된 상태에서 내린 것".
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
        where: { organizationId, salesProductId: { in: productIds } },
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

  /** 대상별 최신 등록성 실행(register · update · composition_change). */
  private async readLatestListingShaping(organizationId: string, targetIds: readonly string[]): Promise<ExecutionRow[]> {
    if (targetIds.length === 0) return [];
    const operations = await readRegistrationOperations(this.prisma, {
      organizationId,
      planContainsAny: targetIds.flatMap((registrationTargetId) =>
        LISTING_SHAPING_EXECUTION_KINDS.map((executionKind) => ({ registrationTargetId, executionKind }))),
    });
    return latestPer(operations.filter((operation) => !isFillOnly(operation)), (operation) => operation.plan.registrationTargetId).map((operation) => ({
      id: operation.id,
      registration_target_id: operation.plan.registrationTargetId!,
      execution_kind: operation.plan.executionKind,
      // 제출하던 실행이 브라우저를 잃고 임대로 끝났으면 몰에 올라갔을 수 있다 — 실패가 아니라 확인 대기로 읽는다(중복 등록 방지).
      status: lapsedWhileSubmitting(operation) ? 'reconciling' : operation.status,
      provider_outcome: lapsedWhileSubmitting(operation) ? 'uncertain' : providerOutcomeOf(operation),
      created_at: operation.startedAt,
      completed_at: operation.finishedAt,
    }));
  }

  /** 대상별 마지막 성공 문서 전송 실행(register · composition_change)이 얼린 값. */
  private async readLastSucceededFrozen(organizationId: string, targetIds: readonly string[]): Promise<FrozenRow[]> {
    if (targetIds.length === 0) return [];
    const operations = await readRegistrationOperations(this.prisma, {
      organizationId,
      planContainsAny: targetIds.flatMap((registrationTargetId) =>
        DOCUMENT_BASELINE_EXECUTION_KINDS.map((executionKind) => ({ registrationTargetId, executionKind }))),
      statuses: ['succeeded'],
    });
    return latestPer(operations.filter((operation) => !isFillOnly(operation)), (operation) => operation.plan.registrationTargetId).map((operation) => {
      const snapshot = frozenSnapshot(operation.plan) ?? {};
      return {
        registration_target_id: operation.plan.registrationTargetId!,
        target_version: textOf(snapshot.targetVersion),
        product_version: textOf(field(snapshot.product, 'version')),
        detail_page_revision_id: textOf(field(snapshot.detailPage, 'revisionId')),
        representative_image_asset_id: textOf(field(field(snapshot.adapterPayload, 'representativeImage'), 'assetId')),
      };
    });
  }

  /** (대상 · 리스팅)별 최신 가용성 실행. 품절 · 재개는 계정의 리스팅 묶음이라 리스팅마다 한 줄로 편다(KID-364). */
  private async readLatestAvailability(organizationId: string, _targetIds: readonly string[], listingIds: readonly string[]): Promise<AvailabilityRow[]> {
    if (listingIds.length === 0) return [];
    const operations = await readRegistrationOperations(this.prisma, {
      organizationId,
      planContainsAny: listingIds.map((channelListingId) => ({ payload: { listings: [{ channelListingId }] } })),
    });
    const wanted = new Set(listingIds);
    const rows: AvailabilityRow[] = [];
    const seen = new Set<string>();
    for (const operation of operations) {
      if (!(AVAILABILITY_EXECUTION_KINDS as readonly string[]).includes(operation.plan.executionKind) || isFillOnly(operation)) continue;
      const listings = field(operation.plan.payload, 'listings');
      if (!Array.isArray(listings)) continue;
      for (const listing of listings) {
        const channelListingId = textOf(field(listing, 'channelListingId'));
        if (!channelListingId || !wanted.has(channelListingId) || seen.has(channelListingId)) continue;
        seen.add(channelListingId);
        rows.push({
          registration_target_id: null,
          channel_listing_id: channelListingId,
          channel_account_id: operation.plan.channelAccountId,
          execution_kind: operation.plan.executionKind,
          status: operation.status,
          created_at: operation.startedAt,
        });
      }
    }
    return rows;
  }
}

/** 시작 역순으로 읽은 실행에서 열쇠마다 가장 최근 것 하나. */
function latestPer(operations: readonly RegistrationOperationFact[], key: (operation: RegistrationOperationFact) => string | null): RegistrationOperationFact[] {
  const latest = new Map<string, RegistrationOperationFact>();
  for (const operation of operations) {
    const id = key(operation);
    if (id && !latest.has(id)) latest.set(id, operation);
  }
  return [...latest.values()];
}

/** `submit` 이 허락된 문서 실행이 결과 보고 없이 임대 만료로 끝났다(계약의 만료 코드 · 문장). */
function lapsedWhileSubmitting(operation: RegistrationOperationFact): boolean {
  return operation.plan.submit && operation.status === 'failed'
    && operation.errorCode === OPERATION_EXPIRED_ERROR_CODE && operation.errorMessage === OPERATION_EXPIRED_ERROR_MESSAGE;
}

/** 실행 `result.providerOutcome`(확장 · owner 가 적은 것). 없으면 상태로 비춘다. */
function providerOutcomeOf(operation: RegistrationOperationFact): string {
  const value = operation.result.providerOutcome;
  if (typeof value === 'string') return value;
  if (operation.status === 'succeeded') return 'succeeded';
  if (operation.status === 'failed') return 'definitive_failure';
  if (operation.status === 'executing' || operation.status === 'reconciling') return 'uncertain';
  return 'not_attempted';
}

function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined;
}

function textOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
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
