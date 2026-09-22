import { Inject, Injectable } from '@nestjs/common';
import {
  SALES_PRODUCT_CONTENT_ASSET_PORT,
  type SalesProductContentAssetPort,
} from '../../../../ai/application/port/in/content/sales-product-content-asset.port';
import type { SalesProductThumbnailSourcePort } from '../../../application/port/out/ai/sales-product-thumbnail-source.port';

/** 이 판매상품을 위해 만든 생성 썸네일 주소. 초안이 든 사진은 Channels 가 스스로 읽는다. */
@Injectable()
export class SalesProductThumbnailSourceAdapter implements SalesProductThumbnailSourcePort {
  constructor(
    @Inject(SALES_PRODUCT_CONTENT_ASSET_PORT)
    private readonly assets: SalesProductContentAssetPort,
  ) {}

  async listGeneratedThumbnailUrls(organizationId: string, salesProductId: string): Promise<string[]> {
    const assets = await this.assets.listSalesProductAssets({ organizationId, salesProductId });
    return assets.map((asset: { url: string }) => asset.url);
  }
}
