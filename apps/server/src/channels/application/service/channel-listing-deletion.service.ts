import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CHANNEL_LISTING_REPOSITORY_PORT,
  type ChannelListingDeletionTarget,
  type ChannelListingRepositoryPort,
} from '../port/out/repository/channel-listing.repository.port';
import {
  CHANNELS_DELETION_PASSWORD_PORT,
  type ChannelsDeletionPasswordPort,
} from '../port/out/cross-domain/deletion-password.port';

export interface ChannelListingDeletionAuthorization {
  listingId: string;
  externalId: string;
  displayName: string;
  channel: string;
}

/**
 * 등록상품 삭제 게이트. ⚠️ 되돌릴 수 없는 동작이다.
 *
 * 두 단계로 나뉜다.
 *  1) `authorize()` — 비밀번호와 소유권을 검증하고 **마켓에서 지울 대상만** 알려준다.
 *     아무것도 변경하지 않는다. 확장은 여기서 돌려준 `externalId` 로만 움직인다.
 *  2) `finalize()` — 확장이 마켓 삭제를 마친 뒤 우리 리스팅을 비활성화한다.
 *
 * 순서가 중요하다. 우리 DB 를 먼저 지우면 마켓 삭제가 실패했을 때
 * "쿠팡에는 살아 있는데 우리는 지운 것으로 아는" 상태가 된다.
 *
 * 두 단계 **모두** 비밀번호와 소유권을 다시 검증한다. 1단계 통과가
 * 2단계의 통행증이 되어서는 안 된다(클라이언트가 2단계만 직접 호출할 수 있다).
 */
@Injectable()
export class ChannelListingDeletionService {
  constructor(
    @Inject(CHANNEL_LISTING_REPOSITORY_PORT)
    private readonly listings: ChannelListingRepositoryPort,
    @Inject(CHANNELS_DELETION_PASSWORD_PORT)
    private readonly deletionPassword: ChannelsDeletionPasswordPort,
  ) {}

  async authorize(
    organizationId: string,
    listingId: string,
    password: string,
  ): Promise<ChannelListingDeletionAuthorization> {
    const target = await this.assertDeletable(organizationId, listingId, password);
    return {
      listingId: target.id,
      externalId: target.externalId,
      displayName: target.displayName ?? target.externalId,
      channel: target.channel,
    };
  }

  async finalize(
    organizationId: string,
    listingId: string,
    password: string,
  ): Promise<{ listingId: string; externalId: string; isActive: false }> {
    const target = await this.assertDeletable(organizationId, listingId, password);
    await this.listings.deactivate(organizationId, target.id);
    return { listingId: target.id, externalId: target.externalId, isActive: false };
  }

  /**
   * 삭제해도 되는 대상인지 서버에서 판정한다.
   *
   * 클라이언트가 보낸 어떤 값도 이 판정의 근거가 아니다. 특히 **우리가 등록한
   * 상품인지**는 `sourceCandidateId` 유무로만 정한다 — 카탈로그 수집으로 들어온
   * 기존/남의 상품에는 이 값이 없고, 등록으로 생긴 리스팅에는 immutable provenance 로
   * 남는다. UI 가 삭제 버튼을 감추더라도 서버가 다시 막는다.
   */
  private async assertDeletable(
    organizationId: string,
    listingId: string,
    password: string,
  ): Promise<ChannelListingDeletionTarget> {
    // 비밀번호부터 검증한다. 통과하지 못하면 리스팅의 존재 여부도 알려주지 않는다.
    await this.deletionPassword.assertPassword(organizationId, password);

    const target = await this.listings.findDeletionTarget(organizationId, listingId);
    if (!target) throw new NotFoundException('등록 상품을 찾을 수 없습니다.');
    if (!target.sourceCandidateId) {
      throw new ForbiddenException(
        '우리가 등록한 상품만 삭제할 수 있습니다. 카탈로그 수집으로 들어온 상품은 쿠팡에서 직접 관리하세요.',
      );
    }
    if (!target.isActive) {
      throw new BadRequestException('이미 삭제된 상품입니다.');
    }
    return target;
  }
}
