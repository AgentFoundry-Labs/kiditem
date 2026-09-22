import type { Prisma } from '@prisma/client';

/**
 * 이번 완료 목록에 없는 리스팅·옵션을 끄는 범위.
 *
 * `account` — 이 원천이 몰 계정의 상품 목록 전체를 덮는다. 쿠팡 윙은 브라우저 수집과 엑셀
 * 가져오기 둘 다 계정의 전체 목록을 한 번에 보므로, 다른 갈래가 만든 행도 목록에서 사라졌으면
 * 몰에서 내려간 것이다.
 *
 * `source` — 이 원천이 만든 행만 덮는다. 같은 몰 계정에 다른 경로(KidItem 등록, 다른
 * 가져오기)로 생긴 리스팅은 이 원천의 목록에 없어도 몰에서 내려간 것이 아니다. 그래서
 * `raw_json.source` 가 이 원천인 행만 본다.
 */
export type ChannelCatalogAbsenceScope =
  | { kind: 'account' }
  | { kind: 'source'; sourceType: string };

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
    sourceImportRunId: string;
    scope: ChannelCatalogAbsenceScope;
    presentExternalProductIds: readonly string[] | null;
    presentExternalOptionIds: readonly string[] | null;
  },
): Promise<{ listings: number; options: number }> {
  const fromThisSource = input.scope.kind === 'source'
    ? {
      rawJson: {
        path: ['source'],
        equals: input.scope.sourceType,
      } satisfies Prisma.JsonNullableFilter,
    }
    : {};
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
      data: { isActive: false, lastImportRunId: input.sourceImportRunId },
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
      data: { isActive: false, lastImportRunId: input.sourceImportRunId },
    });
  return { listings: listings.count, options: options.count };
}
