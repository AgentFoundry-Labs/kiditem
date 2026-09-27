import type {
  ThumbnailExecutionListingChoice,
  ThumbnailExecutionStatus,
  ThumbnailAccountResolutionReason,
} from '@kiditem/shared/thumbnail-execution';
import type { ChannelsThumbnailExecutionPort, ThumbnailExecutionPlan } from '../../port/in/thumbnail-execution.port';
import type { ChannelRegistrableThumbnailPort } from '../../port/out/content/registrable-thumbnail.port';
import type { ThumbnailExecutionPersistencePort } from '../../port/out/persistence/thumbnail-execution.persistence.port';
import { KiditemInvalidValueError, KiditemPreconditionError } from '@kiditem/shared/errors';
import { resolveThumbnailAccount, thumbnailProductName } from '../../../domain/registration/thumbnail-update';

const ACCOUNT_MESSAGES = {
  no_account: '대표이미지를 반영할 수 있는 계정이 없습니다',
  ambiguous_account: '대표이미지를 반영할 수 있는 계정이 여럿입니다 — listing을 고르세요',
  ambiguous_listing: '대표이미지를 반영할 listing 이 여럿입니다 — listing을 고르세요',
} as const satisfies Record<ThumbnailAccountResolutionReason, string>;

/**
 * 대표이미지 몰 반영의 준비와 읽기(KID-364). Content 에서 판매 상품의 대표이미지 자산을 받아 사진 하나를 얼린다.
 * 실행은 `channels.registration` 의 `thumbnail_update` 이고 등록 실행 owner 가 plan 에서 이 서비스를 부른다.
 */
export class ThumbnailExecutionService implements ChannelsThumbnailExecutionPort {
  constructor(
    private readonly content: ChannelRegistrableThumbnailPort,
    private readonly persistence: ThumbnailExecutionPersistencePort,
  ) {}

  /**
   * 판매 상품의 계정 · listing 을 정하고 올릴 자산을 고른다(요청의 자산 → 그 계정 등록 대상이 고른 자산 → 작업공간의
   * 현재 대표이미지). 자산은 Content 가 그 판매 상품의 것인지 확인한다.
   */
  async plan(input: {
    organizationId: string;
    salesProductId: string;
    assetId?: string;
    channelListingId?: string;
  }): Promise<ThumbnailExecutionPlan> {
    const { organizationId, salesProductId } = input;
    const evidence = await this.persistence.readAccountEvidence({
      organizationId,
      pickedListingId: input.channelListingId ?? null,
      salesProductId,
    });
    const account = resolveThumbnailAccount(evidence);
    // 웹 representative-image-execution은 details.reason === 'ambiguous_listing'으로 listing 선택을 연다 — 철자 고정.
    if (!account.ok) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { message: ACCOUNT_MESSAGES[account.reason], details: { reason: account.reason } });
    }
    const productName = thumbnailProductName(evidence.listingChannelName, evidence.salesProductName);
    if (!productName) throw new KiditemPreconditionError('CHANNELS_PREFLIGHT_FAILED', { details: { reason: 'PRODUCT_NAME_MISSING' } });
    const selectedThumbnailAssetId = input.assetId
      ?? await this.persistence.findTargetThumbnailAssetId({ organizationId, salesProductId, channelAccountId: account.channelAccountId });
    const thumbnail = await this.content.read({ organizationId, salesProductId, selectedThumbnailAssetId });
    const image = await this.content.loadImage({ organizationId, assetId: thumbnail.assetId });
    return {
      channelAccountId: account.channelAccountId,
      payload: {
        dataUrl: image.dataUrl,
        filename: image.filename,
        mimeType: image.mimeType,
        salesProductId,
        channelListingId: evidence.channelListingId,
        externalListingId: evidence.listingExternalId,
        assetId: thumbnail.assetId,
        productName,
      },
    };
  }

  async listLatest(input: { organizationId: string; salesProductIds: readonly string[] }): Promise<ThumbnailExecutionStatus[]> {
    return this.persistence.findLatest({ organizationId: input.organizationId, salesProductIds: [...new Set(input.salesProductIds)] });
  }

  async listingChoices(input: { organizationId: string; salesProductId: string }): Promise<ThumbnailExecutionListingChoice[]> {
    const listings = await this.persistence.findListingChoices(input);
    return listings.map((listing) => ({
      channelListingId: listing.id,
      channelName: listing.channelName,
      channelAccountName: listing.channelAccountName,
      externalId: listing.externalId,
    }));
  }
}
