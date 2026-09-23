import { channelDelivery, type ChannelDelivery } from '@kiditem/shared/channel-registry';
import { MALL_ADMIN_LISTING_READERS } from '@kiditem/shared/mall-admin-listings';
import type {
  AvailabilityOptionKind,
  ChannelAccountIdentity,
  ChannelAdapter,
  ConfirmationEvidenceInput,
  ProviderEvidenceDecision,
} from '../../../application/port/out/channel/channel-adapter.port';
import { decideConfirmationEvidence, trimmed } from './channel-evidence';

/**
 * 전용 어댑터가 없는 몰(KID-321). 몰이 보는 계정 식별자는 계정의 `externalAccountId`, 관리자 화면은
 * `MALL_ADMIN_LISTING_READERS` 의 origin 이고, 실행 준비에 얼릴 몰 사실도 대표이미지 runner 도 없다.
 */
export class GenericMallChannelAdapter implements ChannelAdapter {
  readonly delivery: ChannelDelivery;
  readonly externalListingIdPattern = null;
  readonly representativeImage = null;
  private readonly adminOrigin: string | null;

  constructor(readonly channel: string) {
    this.delivery = channelDelivery(channel);
    const reader = (MALL_ADMIN_LISTING_READERS as Record<string, { origin: string } | undefined>)[channel];
    this.adminOrigin = reader ? originOf(reader.origin) : null;
  }

  providerAccountId(account: ChannelAccountIdentity): string | null {
    return trimmed(account.externalAccountId);
  }

  validateConfirmationEvidence(
    account: ChannelAccountIdentity,
    expectedProviderAccountId: string | null,
    evidence: ConfirmationEvidenceInput,
  ): ProviderEvidenceDecision {
    return decideConfirmationEvidence({
      account,
      accountProviderId: this.providerAccountId(account),
      expectedProviderAccountId,
      evidence,
      isTrustedAdminUrl: (url) => this.adminOrigin !== null && url.origin === this.adminOrigin,
      externalListingIdPattern: this.externalListingIdPattern,
    });
  }

  async prepareAdapterPayload(): Promise<Record<string, unknown>> {
    return {};
  }

  availabilityOption(): AvailabilityOptionKind {
    return 'sendable';
  }
}

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
