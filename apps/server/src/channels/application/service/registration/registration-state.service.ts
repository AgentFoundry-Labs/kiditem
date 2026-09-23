import type { RegistrationAccountState } from '@kiditem/shared/sales-product';
import { decideRegistrationAccountState } from '../../../domain/registration/registration-account-state';
import { resolveMallListingState } from '../../../domain/listing/mall-listing-state';
import type { RegistrationStatePort, SalesProductRegistrationView } from '../../port/in/registration-state.port';
import type {
  RegistrationStateAccountFacts,
  RegistrationStatePersistencePort,
} from '../../port/out/persistence/registration-state.persistence.port';
import type { ChannelRegistrableContentFactsPort } from '../../port/out/content/registrable-content-facts.port';

/**
 * 판매 상품 × 몰 계정의 등록 상태를 읽는 하나뿐인 reader(KID-313 결정 11, KID-320).
 *
 * Channels 행 사실(설정 · 리스팅 · 실행)은 persistence 포트로, 지금 콘텐츠(작업공간의 현재 상세 revision id ·
 * 대표이미지 자산 id)는 Content 사실 포트로 한 번씩 읽고, 판정은 `decideRegistrationAccountState` 에 맡긴다. 지금 콘텐츠는 등록 대상이 고른
 * 값이 먼저이고, 없으면 작업공간의 현재 값이다 — 등록 실행이 얼릴 때와 같은 순서다. 화면 · 목록 · 매트릭스는
 * 실행 표를 조합하지 않고 이 결과만 싣는다.
 */
export class RegistrationStateService implements RegistrationStatePort {
  constructor(
    private readonly persistence: RegistrationStatePersistencePort,
    private readonly contentFacts: ChannelRegistrableContentFactsPort,
  ) {}

  async readForSalesProducts(organizationId: string, salesProductIds: readonly string[]): Promise<Map<string, SalesProductRegistrationView>> {
    const facts = await this.persistence.readFacts(organizationId, salesProductIds);
    const result = new Map<string, SalesProductRegistrationView>();
    if (facts.size === 0) return result;

    const productIds = [...facts.keys()];
    const content = await this.contentFacts.readCurrentContentIds({ organizationId, salesProductIds: productIds });

    for (const [salesProductId, product] of facts) {
      const workspaceRevisionId = content.get(salesProductId)?.detailPageRevisionId ?? null;
      const workspaceAssetId = content.get(salesProductId)?.thumbnailAssetId ?? null;
      const accounts = product.accounts
        .map((account) => toAccountState(account, {
          productVersion: product.productVersion,
          workspaceRevisionId,
          workspaceAssetId,
        }))
        .sort(byAccount);
      result.set(salesProductId, { accounts });
    }
    return result;
  }
}

function toAccountState(
  account: RegistrationStateAccountFacts,
  current: { productVersion: number; workspaceRevisionId: string | null; workspaceAssetId: string | null },
): RegistrationAccountState {
  const target = account.target;
  const listingState = account.listing
    ? resolveMallListingState({ hasListing: true, listingStatus: account.listing.status }).state
    : null;
  const shaping = account.latestListingShaping;
  const decision = decideRegistrationAccountState({
    hasTarget: target !== null,
    listingState,
    latestListingShaping: shaping,
    lastSucceededFrozen: account.lastSucceededFrozen,
    latestAvailability: account.latestAvailability,
    current: {
      targetVersion: target?.version ?? null,
      productVersion: current.productVersion,
      detailPageRevisionId: target?.selectedDetailPageRevisionId ?? current.workspaceRevisionId,
      thumbnailAssetId: target?.selectedThumbnailAssetId ?? current.workspaceAssetId,
    },
  });
  return {
    channelAccountId: account.channelAccountId,
    channel: account.channel,
    channelAccountName: account.channelAccountName,
    registrationTargetId: target?.id ?? null,
    channelListingId: account.listing?.id ?? null,
    externalListingId: account.listing?.externalId ?? null,
    state: decision.state,
    soldOut: decision.soldOut,
    changedSinceRegistration: decision.changedSinceRegistration,
    selectedThumbnailAssetId: target?.selectedThumbnailAssetId ?? null,
    selectedDetailPageRevisionId: target?.selectedDetailPageRevisionId ?? null,
    lastExecution: shaping
      ? {
        id: shaping.id,
        kind: shaping.kind,
        status: shaping.status,
        providerOutcome: shaping.providerOutcome,
        createdAt: shaping.createdAt.toISOString(),
        completedAt: shaping.completedAt?.toISOString() ?? null,
      }
      : null,
  };
}

function byAccount(left: RegistrationAccountState, right: RegistrationAccountState): number {
  return left.channel.localeCompare(right.channel)
    || (left.channelAccountName ?? '').localeCompare(right.channelAccountName ?? '')
    || left.channelAccountId.localeCompare(right.channelAccountId);
}
