import { Inject, Injectable } from '@nestjs/common';
import {
  REGISTRATION_CONTENT_WORKSPACE_PORT,
  type RegistrationContentWorkspacePort,
} from '../../../../content/application/port/in/workspace/registration-content-workspace.port';
import type { RegistrationDraftPort } from '../../../application/port/out/persistence/registration-draft.port';
import type { ChannelsRepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';

/**
 * 등록 확인이 판매 상품의 콘텐츠 작업공간을 몰 상품에 붙인다(KID-321). 작업공간은 Content 가 소유하므로
 * Content 의 공개 포트만 부른다.
 */
@Injectable()
export class RegistrationDraftAdapter implements RegistrationDraftPort {
  constructor(
    @Inject(REGISTRATION_CONTENT_WORKSPACE_PORT)
    private readonly contentWorkspaces: RegistrationContentWorkspacePort,
  ) {}

  async attachContentToListing(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; salesProductId: string; listingId: string },
  ): Promise<{ workspaceId: string } | null> {
    // 작업공간이 없는 판매 상품(옛 행)은 붙일 것이 없다 — 몰에 올라간 등록 확인을 막지 않는다.
    const workspaceId = await this.contentWorkspaces.findSalesProductWorkspaceId(input);
    if (!workspaceId) return null;
    return this.contentWorkspaces.attachToListing(tx, input);
  }
}
