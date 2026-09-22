import { Inject, Injectable } from '@nestjs/common';
import {
  SALES_PRODUCT_CONTENT_ASSET_PORT as AI_SALES_PRODUCT_CONTENT_ASSET_PORT,
  type SalesProductContentAssetPort as AiSalesProductContentAssetPort,
} from '../../../../ai/application/port/in/workspace/sales-product-content-asset.port';
import type {
  SalesProductContentAssetPort,
  SalesProductCurrentThumbnail,
  SalesProductRegistrationImages,
} from '../../../application/port/out/cross-domain/sales-product-content-asset.port';

@Injectable()
export class CandidateContentAssetAdapter implements SalesProductContentAssetPort {
  constructor(
    @Inject(AI_SALES_PRODUCT_CONTENT_ASSET_PORT)
    private readonly assets: AiSalesProductContentAssetPort,
  ) {}

  loadRegistrationMedia(input: {
    organizationId: string;
    salesProductId: string;
  }): Promise<{
    registrationImages: SalesProductRegistrationImages;
    currentThumbnail: SalesProductCurrentThumbnail | null;
  }> {
    return this.assets.loadRegistrationMedia(input);
  }

  listRegistrationImages(input: {
    organizationId: string;
    salesProductId: string;
  }): Promise<SalesProductRegistrationImages> {
    return this.assets.listRegistrationImages(input);
  }

  findCurrentThumbnail(input: {
    organizationId: string;
    salesProductId: string;
  }): Promise<SalesProductCurrentThumbnail | null> {
    return this.assets.findCurrentThumbnail(input);
  }

  findCurrentThumbnails(input: {
    organizationId: string;
    salesProductIds: string[];
  }): Promise<Map<string, SalesProductCurrentThumbnail>> {
    return this.assets.findCurrentThumbnails(input);
  }
}
