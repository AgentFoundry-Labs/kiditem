import type { Prisma } from '@prisma/client';

/**
 * 대표이미지가 될 수 있는 자산(KID-313 W3 리뷰 S3): 그 작업공간의 `thumbnail`(업로드 · AI 후보)이고, 리스팅 소유
 * 작업공간이면 카탈로그 `primary` 사진도 된다. 상세 사진(`detail_source` · `detail_image`)은 몰 대표이미지가 아니다.
 */
export function representativeAssetWhere(ownerType: string): Prisma.ContentAssetWhereInput {
  return ownerType === 'channel_listing'
    ? { OR: [{ role: 'thumbnail' }, { role: 'primary', source: 'catalog' }] }
    : { role: 'thumbnail' };
}

export function isRepresentativeAsset(ownerType: string, asset: { role: string | null; source: string }): boolean {
  if (asset.role === 'thumbnail') return true;
  return ownerType === 'channel_listing' && asset.role === 'primary' && asset.source === 'catalog';
}
