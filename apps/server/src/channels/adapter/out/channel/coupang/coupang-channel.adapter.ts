import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type {
  AvailabilityOptionKind,
  ChannelAccountIdentity,
  ChannelAdapter,
  ConfirmationEvidenceInput,
  PrepareAdapterPayloadInput,
  ProviderEvidenceDecision,
} from '../../../../application/port/out/channel/channel-adapter.port';
import {
  CHANNEL_REGISTRATION_PORT,
  type ChannelRegistrationPort,
} from '../../../../application/port/in/registration/channel-registration.port';
import type { RepresentativeImageRunnerPort } from '../../../../application/port/out/automation/representative-image-runner.port';
import { decideConfirmationEvidence } from '../channel-evidence';
import { resolveCoupangVendorId } from '../../../../domain/account/coupang-account-identity';
import { CoupangRepresentativeImageRunnerAdapter } from './representative-image-runner.adapter';

export const COUPANG_CHANNEL_KEY = 'coupang';
const WING_ADMIN_ORIGIN = 'https://wing.coupang.com';
/** WING 등록상품ID 형식. */
const WING_LISTING_ID_PATTERN = /^\d{6,20}$/;

/**
 * 쿠팡 WING 채널 어댑터(KID-321). 등록 실행은 몰 중립 fence 를 그대로 지나고, 여기에는 WING 만의
 * 사실만 있다:
 *  - 몰이 보는 계정은 vendorId(옛 행은 `externalAccountId` 로 대신한다).
 *  - 확인 증거는 `wing.coupang.com` 화면과 숫자 등록상품ID.
 *  - 등록 준비는 셀피아 매칭을 하고, 대상의 `adapter.coupang.wingProduct` 와 판매 상품으로 WING 상품
 *    문서를 만들어 얼린다(업체상품코드 = 선택한 옵션의 KID).
 *  - 옵션 판매 방식이 `NORMAL` 인 옵션만 판매자 재고를 받는다 — 로켓그로스(`RFM`)는 받지 않는다.
 *  - 대표이미지는 개발 서버 Playwriter runner 로 WING 상품 수정 화면에 넣는다.
 */
@Injectable()
export class CoupangChannelAdapter implements ChannelAdapter {
  readonly channel = COUPANG_CHANNEL_KEY;

  constructor(
    @Inject(CHANNEL_REGISTRATION_PORT)
    private readonly registration: Pick<ChannelRegistrationPort, 'preflightExternalProductRegistration'>,
    @Inject(CoupangRepresentativeImageRunnerAdapter)
    readonly representativeImage: RepresentativeImageRunnerPort,
  ) {}

  providerAccountId(account: ChannelAccountIdentity): string | null {
    return resolveCoupangVendorId(account);
  }

  validateConfirmationEvidence(
    expectedProviderAccountId: string | null,
    evidence: ConfirmationEvidenceInput,
  ): ProviderEvidenceDecision {
    return decideConfirmationEvidence({
      expectedProviderAccountId,
      evidence,
      isTrustedAdminUrl: (url) => url.origin === WING_ADMIN_ORIGIN,
      externalListingIdPattern: WING_LISTING_ID_PATTERN,
    });
  }

  async prepareAdapterPayload(_transaction: OwnerTransaction, input: PrepareAdapterPayloadInput): Promise<Record<string, unknown>> {
    if (input.kind !== 'register') return {};
    if (!this.providerAccountId(input.account)) {
      throw new ConflictException('Wing registration requires an account with a vendor identity.');
    }
    const [option, ...rest] = input.product.options;
    if (!option || rest.length > 0) {
      throw new ConflictException('A Wing registration registers exactly one option.');
    }
    if (!option.optionCode) {
      throw new ConflictException('A KID must be issued for the option before a Wing registration.');
    }
    const saved = record(record(record(input.registrationInput.adapter)[COUPANG_CHANNEL_KEY]).wingProduct);
    const savedVariants = Array.isArray(saved.variants) ? saved.variants : [];
    if (savedVariants.length > 1) throw new ConflictException('A Wing registration registers exactly one variant.');
    const listingName = text(saved.sellerProductName) ?? input.product.name;
    const itemName = text(saved.productName) ?? input.product.name;
    const selectedSkuId = text(input.adapterValues.sellpiaInventorySkuId);
    const preflight = await this.registration.preflightExternalProductRegistration({
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      channelListingOptionId: input.salesProductId,
      listingName,
      itemName,
      ...(selectedSkuId ? {
        selectedSellpiaInventorySkuId: selectedSkuId,
        selectedQuantity: Number(input.adapterValues.sellpiaQuantity ?? ''),
      } : {}),
    });
    const vendorItemCode = option.optionCode;
    return {
      wingProduct: {
        ...saved,
        sellerProductName: listingName,
        productName: itemName,
        variants: [{ ...record(savedVariants[0]), vendorItemCode }],
      },
      sellpiaMatch: {
        sellpiaInventorySkuId: preflight.sellpiaMatch.sellpiaInventorySkuId,
        code: preflight.sellpiaMatch.code,
        name: preflight.sellpiaMatch.name,
        optionName: preflight.sellpiaMatch.optionName,
        quantity: preflight.sellpiaMatch.quantity,
      },
      existingChannelListing: preflight.existingListing,
      vendorItemCode,
    };
  }

  availabilityOption(option: { registrationType: string | null }): AvailabilityOptionKind {
    if (option.registrationType === 'NORMAL') return 'sendable';
    if (option.registrationType === 'RFM') return 'excluded';
    return 'unknown';
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
