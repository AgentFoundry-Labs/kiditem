import type { Prisma } from '@prisma/client';
import { hashContentAssetUrl } from '../../../domain/content-asset-key';

/**
 * 상세 생성이 쓰는 사진은 워크스페이스의 콘텐츠 자산이다(KID-313 W3b): 생성 입력은 `detail_source`, AI 가 만든
 * 상세 사진은 `detail_image`, 둘 다 `source = 'detail_generation'`. 사용처 표는 없다 — 어느 revision 이 어느 사진을
 * 쓰는지는 revision 의 `image_urls` 가 말한다. 같은 페이지의 같은 주소는 한 행이다(열쇠 = 페이지 + 주소).
 */

export const DETAIL_GENERATION_ASSET_SOURCE = 'detail_generation';
export type DetailGenerationAssetRole = 'detail_source' | 'detail_image';

export function detailPageAssetKey(detailPageId: string, url: string): string {
  return `detail-page:${detailPageId}:${hashContentAssetUrl(url).slice(0, 32)}`;
}

export async function recordDetailPageAssets(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    contentWorkspaceId: string;
    detailPageId: string;
    createdByUserId: string | null;
    role: DetailGenerationAssetRole;
    /** 주소와 (있으면) 사진 이름표 — 생성 사진은 템플릿 칸 이름(`__heroBanner` 등). */
    images: ReadonlyArray<{ url: string; label?: string | null }>;
  },
): Promise<Array<{ id: string; url: string }>> {
  const seen = new Set<string>();
  const out: Array<{ id: string; url: string }> = [];
  for (const [index, image] of input.images.entries()) {
    const url = image.url.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const assetKey = detailPageAssetKey(input.detailPageId, url);
    const row = await tx.contentAsset.upsert({
      where: { organizationId_assetKey: { organizationId: input.organizationId, assetKey } },
      create: {
        organizationId: input.organizationId,
        contentWorkspaceId: input.contentWorkspaceId,
        source: DETAIL_GENERATION_ASSET_SOURCE,
        createdByUserId: input.createdByUserId,
        assetKey,
        url,
        assetType: 'image',
        role: input.role,
        label: image.label ?? null,
        sortOrder: index,
        metadata: { detailPageId: input.detailPageId },
      },
      update: { role: input.role, label: image.label ?? null, sortOrder: index, isDeleted: false, deletedAt: null },
      select: { id: true, url: true },
    });
    out.push(row);
  }
  return out;
}
