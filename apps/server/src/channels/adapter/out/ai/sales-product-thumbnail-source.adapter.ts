import { Inject, Injectable } from '@nestjs/common';
import {
  SALES_PRODUCT_CONTENT_ASSET_PORT,
  type SalesProductContentAssetPort,
} from '../../../../content/application/port/in/workspace/sales-product-content-asset.port';
import type { SalesProductThumbnailSourcePort } from '../../../application/port/out/ai/sales-product-thumbnail-source.port';

/** 이 판매상품을 위해 만든 생성 썸네일 주소. 초안이 든 사진은 Channels 가 스스로 읽는다. */
@Injectable()
export class SalesProductThumbnailSourceAdapter implements SalesProductThumbnailSourcePort {
  constructor(
    @Inject(SALES_PRODUCT_CONTENT_ASSET_PORT)
    private readonly assets: SalesProductContentAssetPort,
  ) {}

  async listGeneratedThumbnailUrls(organizationId: string, salesProductId: string): Promise<string[]> {
    // 등록에 쓸 수 있는 역할(primary · thumbnail · detail)만 온다 — 수집 원본(`source`)은
    // 몰 규격에 못 미쳐 AI 가 이미 뺀다.
    const images = await this.assets.listRegistrationImages({ organizationId, salesProductId });
    return [...new Set([...images.primary, ...images.thumbnail, ...images.detail])];
  }

  async findRepresentativeThumbnailUrls(organizationId: string, salesProductIds: readonly string[]): Promise<Map<string, string>> {
    if (salesProductIds.length === 0) return new Map();
    const thumbnails = await this.assets.findCurrentThumbnails({ organizationId, salesProductIds: [...salesProductIds] });
    return new Map([...thumbnails].map(([salesProductId, thumbnail]) => [salesProductId, thumbnail.url]));
  }
}
