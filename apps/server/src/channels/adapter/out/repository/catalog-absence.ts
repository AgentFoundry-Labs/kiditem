import type { Prisma } from '@prisma/client';

/**
 * 이번 완료 목록에 없는 리스팅·옵션을 끄는 범위: 이 원천이 만든 행만 덮는다. 같은 몰 계정에
 * 다른 경로(KidItem 등록, 다른 가져오기)로 생긴 리스팅은 이 원천의 목록에 없어도 몰에서 내려간
 * 것이 아니다. 그래서 `raw_json.source` 가 이 원천인 행만 본다.
 *
 * 쿠팡 윙 계정 전체를 덮던 `account` 범위는 없앴다: 윙은 삭제 확인을 거쳐서만 상품을 끈다
 * (KID-348).
 */
export type ChannelCatalogAbsenceScope = { kind: 'source'; sourceType: string };

/**
 * 완료한 수집 목록에 없는 리스팅·옵션을 끈다. 지우지 않고 끄기만 하므로 확정 구성은 남는다.
 * 완전한 snapshot 을 발행할 때만 부른다.
 *
 * 차원마다 `null` 을 주면 이번 수집이 그 차원을 완전히 덮지 못했다는 뜻이라 아무것도 끄지
 * 않는다 — 일부만 읽은 수집이 이전 완료 결과를 지우지 않게 한다.
 */
export async function deactivateCatalogAbsence(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    channelAccountId: string;
    /**
     * 끈 행에 남길 출처. 실행 계약으로 옮긴 원천(KID-363)은 `operationId`(`lastOperationId`, `lastImportRunId`는 비운다),
     * 아직 옛 시도로 도는 원천은 `sourceImportRunId`.
     */
    provenance: { operationId: string } | { sourceImportRunId: string };
    scope: ChannelCatalogAbsenceScope;
    presentExternalProductIds: readonly string[] | null;
    presentExternalOptionIds: readonly string[] | null;
  },
): Promise<{ listings: number; options: number }> {
  const provenance = 'operationId' in input.provenance
    ? { lastOperationId: input.provenance.operationId, lastImportRunId: null }
    : { lastImportRunId: input.provenance.sourceImportRunId };
  const fromThisSource = {
    rawJson: {
      path: ['source'],
      equals: input.scope.sourceType,
    } satisfies Prisma.JsonNullableFilter,
  };
  const options = input.presentExternalOptionIds === null
    ? { count: 0 }
    : await tx.channelListingOption.updateMany({
      where: {
        organizationId: input.organizationId,
        listing: {
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
        },
        ...fromThisSource,
        externalOptionId: { notIn: [...input.presentExternalOptionIds] },
        isActive: true,
      },
      data: { isActive: false, ...provenance },
    });
  const listings = input.presentExternalProductIds === null
    ? { count: 0 }
    : await tx.channelListing.updateMany({
      where: {
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
        ...fromThisSource,
        externalId: { notIn: [...input.presentExternalProductIds] },
        isActive: true,
      },
      data: { isActive: false, ...provenance },
    });
  return { listings: listings.count, options: options.count };
}
