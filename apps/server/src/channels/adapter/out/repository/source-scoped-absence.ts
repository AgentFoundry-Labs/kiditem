import type { Prisma } from '@prisma/client';

/**
 * 한 원천이 만든 리스팅 가운데 이번 완료 목록에 없는 것만 끈다.
 *
 * 같은 몰 계정에 다른 경로(KidItem 등록, 다른 가져오기)로 생긴 리스팅은 이 원천의 목록에
 * 없어도 몰에서 내려간 것이 아니다. 그래서 `raw_json.source` 가 이 원천인 행만 본다.
 * 지우지 않고 끄기만 하므로 레시피는 남는다. 완전한 스냅샷을 발행할 때만 부른다.
 *
 * 옵션도 같은 외부 ID 목록으로 거른다 — 리스팅 하나에 옵션 한 줄이고 둘의 외부 ID 가 같은
 * 원천(사방넷 송신 기록, 몰 관리자 목록)만 쓴다.
 */
export async function deactivateSourceAbsence(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    channelAccountId: string;
    sourceType: string;
    sourceImportRunId: string;
    externalIds: string[];
  },
): Promise<{ listings: number; options: number }> {
  const fromThisSource = {
    path: ['source'],
    equals: input.sourceType,
  } satisfies Prisma.JsonNullableFilter;
  const options = await tx.channelListingOption.updateMany({
    where: {
      organizationId: input.organizationId,
      listing: {
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
      },
      rawJson: fromThisSource,
      externalOptionId: { notIn: input.externalIds },
      isActive: true,
    },
    data: { isActive: false, lastImportRunId: input.sourceImportRunId },
  });
  const listings = await tx.channelListing.updateMany({
    where: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      rawJson: fromThisSource,
      externalId: { notIn: input.externalIds },
      isActive: true,
    },
    data: { isActive: false, lastImportRunId: input.sourceImportRunId },
  });
  return { listings: listings.count, options: options.count };
}
