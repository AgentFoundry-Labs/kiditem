import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelListingDeletionService } from '../channel-listing-deletion.service';
import type { ChannelListingDeletionTarget } from '../../port/out/repository/channel-listing.repository.port';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '99999999-9999-4999-8999-999999999999';
const LISTING = '22222222-2222-4222-8222-222222222222';

/** 우리가 등록해서 생긴 리스팅(= sourceCandidateId 가 있다). */
const ourListing: ChannelListingDeletionTarget = {
  id: LISTING,
  externalId: '16311428128',
  displayName: '4000과일바구니딸깍이키링',
  channel: 'coupang',
  channelAccountId: '33333333-3333-4333-8333-333333333333',
  sourceCandidateId: '44444444-4444-4444-8444-444444444444',
  isActive: true,
};

function build(overrides: {
  target?: ChannelListingDeletionTarget | null;
  passwordFails?: 'mismatch' | 'unset' | null;
} = {}) {
  const deactivate = vi.fn(async () => {});
  const findDeletionTarget = vi.fn(async (organizationId: string, listingId: string) => {
    // 조직 스코프 조회를 흉내낸다 — 다른 조직이면 못 찾는다.
    if (organizationId !== ORG || listingId !== LISTING) return null;
    return overrides.target === undefined ? ourListing : overrides.target;
  });
  const assertPassword = vi.fn(async () => {
    if (overrides.passwordFails === 'mismatch') {
      throw new ForbiddenException('삭제 비밀번호가 일치하지 않습니다.');
    }
    if (overrides.passwordFails === 'unset') {
      throw new BadRequestException('삭제 비밀번호가 설정되지 않았습니다.');
    }
  });

  const service = new ChannelListingDeletionService(
    { list: vi.fn(), getWorkspace: vi.fn(), findDeletionTarget, deactivate },
    { assertPassword },
  );
  return { service, deactivate, findDeletionTarget, assertPassword };
}

describe('ChannelListingDeletionService', () => {
  let harness: ReturnType<typeof build>;

  beforeEach(() => {
    harness = build();
  });

  it('authorizes our own registration and reports what will be deleted', async () => {
    const result = await harness.service.authorize(ORG, LISTING, 'correct-horse');

    expect(result).toEqual({
      listingId: LISTING,
      externalId: '16311428128',
      displayName: '4000과일바구니딸깍이키링',
      channel: 'coupang',
    });
    // 1단계는 아무것도 변경하지 않는다.
    expect(harness.deactivate).not.toHaveBeenCalled();
  });

  it('deactivates instead of hard-deleting once the marketplace delete is done', async () => {
    const result = await harness.service.finalize(ORG, LISTING, 'correct-horse');

    expect(result).toEqual({ listingId: LISTING, externalId: '16311428128', isActive: false });
    expect(harness.deactivate).toHaveBeenCalledWith(ORG, LISTING);
  });

  it('rejects a wrong deletion password before touching anything', async () => {
    const { service, deactivate, findDeletionTarget } = build({ passwordFails: 'mismatch' });

    await expect(service.finalize(ORG, LISTING, 'wrong')).rejects.toThrow(ForbiddenException);
    // 비밀번호가 틀리면 리스팅 존재 여부조차 조회하지 않는다.
    expect(findDeletionTarget).not.toHaveBeenCalled();
    expect(deactivate).not.toHaveBeenCalled();
  });

  it('rejects when no deletion password has been configured yet', async () => {
    const { service, deactivate } = build({ passwordFails: 'unset' });

    await expect(service.authorize(ORG, LISTING, 'anything')).rejects.toThrow(BadRequestException);
    await expect(service.finalize(ORG, LISTING, 'anything')).rejects.toThrow(BadRequestException);
    expect(deactivate).not.toHaveBeenCalled();
  });

  it('refuses listings we did not register, even with the right password', async () => {
    // 카탈로그 수집으로 들어온 상품 — sourceCandidateId 가 없다.
    const { service, deactivate } = build({
      target: { ...ourListing, sourceCandidateId: null },
    });

    await expect(service.authorize(ORG, LISTING, 'correct-horse')).rejects.toThrow(ForbiddenException);
    await expect(service.finalize(ORG, LISTING, 'correct-horse')).rejects.toThrow(ForbiddenException);
    expect(deactivate).not.toHaveBeenCalled();
  });

  it('refuses a listing owned by another organization', async () => {
    const { service, deactivate } = build();

    await expect(service.finalize(OTHER_ORG, LISTING, 'correct-horse')).rejects.toThrow(
      NotFoundException,
    );
    expect(deactivate).not.toHaveBeenCalled();
  });

  it('refuses an already deleted listing', async () => {
    const { service, deactivate } = build({ target: { ...ourListing, isActive: false } });

    await expect(service.finalize(ORG, LISTING, 'correct-horse')).rejects.toThrow(BadRequestException);
    expect(deactivate).not.toHaveBeenCalled();
  });

  it('re-verifies the password on finalize — step 1 is not a pass for step 2', async () => {
    await harness.service.authorize(ORG, LISTING, 'correct-horse');
    await harness.service.finalize(ORG, LISTING, 'correct-horse');

    expect(harness.assertPassword).toHaveBeenCalledTimes(2);
  });
});
