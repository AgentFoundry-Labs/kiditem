import type { DataMigration } from "../types";

/**
 * 대표 키워드 직접 지정값은 과거 `CoupangKeywordTracker.vendorItemIds`에 섞여
 * 저장됐다. 전용 override 테이블로 옮겨 공개검색 트래커 설정과 상품별 사용자
 * 선택을 분리한다. 같은 상품이 여러 트래커에 있으면 기존 런타임과 동일하게
 * 가장 오래된 지정값을 보존하며, 자사 카탈로그에 없는 옵션ID는 건너뛴다.
 */
export const migrateRepresentativeKeywordOverrides: DataMigration = {
  id: "v0.1.18:001_migrate_representative_keyword_overrides",
  releaseVersion: "0.1.18",
  name: "Migrate representative keyword overrides from keyword trackers",
  async run(tx) {
    const trackers = await tx.coupangKeywordTracker.findMany({
      where: { vendorItemIds: { isEmpty: false } },
      orderBy: { createdAt: "asc" },
      select: {
        organizationId: true,
        keyword: true,
        vendorItemIds: true,
      },
    });
    const allIds = [...new Set(trackers.flatMap((row) => row.vendorItemIds))];
    const ownProducts =
      allIds.length > 0
        ? await tx.channelListingOption.findMany({
            where: {
              externalOptionId: { in: allIds },
              isActive: true,
              listing: {
                isActive: true,
                channelAccount: { channel: "coupang" },
              },
            },
            select: { organizationId: true, externalOptionId: true },
          })
        : [];
    const ownKeys = new Set(
      ownProducts.map(
        (row) => `${row.organizationId}\u0000${row.externalOptionId}`,
      ),
    );
    const seen = new Set<string>();
    const candidates: Array<{
      organizationId: string;
      vendorItemId: string;
      keyword: string;
    }> = [];
    let skippedMissingProduct = 0;
    let skippedDuplicateAssignment = 0;

    for (const tracker of trackers) {
      for (const vendorItemId of tracker.vendorItemIds) {
        const key = `${tracker.organizationId}\u0000${vendorItemId}`;
        if (seen.has(key)) {
          skippedDuplicateAssignment += 1;
          continue;
        }
        seen.add(key);
        if (!ownKeys.has(key)) {
          skippedMissingProduct += 1;
          continue;
        }
        candidates.push({
          organizationId: tracker.organizationId,
          vendorItemId,
          keyword: tracker.keyword,
        });
      }
    }

    const created =
      candidates.length > 0
        ? await tx.coupangRepresentativeKeywordOverride.createMany({
            data: candidates,
            skipDuplicates: true,
          })
        : { count: 0 };

    return {
      affectedRows: created.count,
      details: {
        trackerCount: trackers.length,
        candidateCount: candidates.length,
        created: created.count,
        skippedMissingProduct,
        skippedDuplicateAssignment,
      },
    };
  },
};
