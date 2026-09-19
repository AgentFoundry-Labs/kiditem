import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  SalesProductExternalImages,
  SalesProductImageMirrorResult,
} from '@kiditem/shared/sales-product';
import { pendingMirrorImages } from '../../domain/sales-product-images';
import {
  SALES_PRODUCT_REPOSITORY_PORT,
  type SalesProductRepositoryPort,
} from '../port/out/repository/sales-product.repository.port';
import {
  SALES_PRODUCT_IMAGE_MIRROR_PORT,
  type SalesProductImageMirrorOutcome,
  type SalesProductImageMirrorPort,
} from '../port/out/storage/sales-product-image-mirror.port';

const DEFAULT_BATCH = 60;
const MAX_BATCH = 200;
const CONCURRENCY = 6;

/**
 * 사방넷 서버의 판매상품 사진을 우리 저장소로 옮긴다(ADR-0014). 한 번에 한 묶음씩 옮기고, 판매상품은 버전이 그대로일
 * 때만 고친다 — 그사이 사람이 고쳤으면 그 상품은 다음 묶음에서 다시 옮긴다.
 */
@Injectable()
export class SalesProductImageService {
  private readonly logger = new Logger(SalesProductImageService.name);

  constructor(
    @Inject(SALES_PRODUCT_REPOSITORY_PORT)
    private readonly repository: SalesProductRepositoryPort,
    @Inject(SALES_PRODUCT_IMAGE_MIRROR_PORT)
    private readonly images: SalesProductImageMirrorPort,
  ) {}

  async external(organizationId: string): Promise<SalesProductExternalImages> {
    const products = await this.repository.listImageUrls(organizationId);
    const pending = new Set(pendingMirrorImages(organizationId, products).map((image) => image.url));
    return {
      images: pending.size,
      products: products.filter((product) => product.imageUrls.some((url) => pending.has(url))).length,
    };
  }

  async mirror(
    organizationId: string,
    options: { limit?: number; skip?: number } = {},
  ): Promise<SalesProductImageMirrorResult> {
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? DEFAULT_BATCH), 1), MAX_BATCH);
    const skip = Math.max(Math.trunc(options.skip ?? 0), 0);
    const products = await this.repository.listImageUrls(organizationId);
    const pending = pendingMirrorImages(organizationId, products);
    const tried = pending.slice(0, skip + limit).map((image) => image.url);
    const batch = pending.slice(skip, skip + limit);

    const outcomes = new Map<string, SalesProductImageMirrorOutcome>();
    for (let start = 0; start < batch.length; start += CONCURRENCY) {
      const slice = batch.slice(start, start + CONCURRENCY);
      const results = await Promise.all(slice.map((image) => this.images.mirror({ sourceUrl: image.url, key: image.key })));
      slice.forEach((image, index) => outcomes.set(image.url, results[index]!));
    }

    let productsUpdated = 0;
    let productsSkipped = 0;
    for (const product of products) {
      const imageUrls = product.imageUrls.map((url) => {
        const outcome = outcomes.get(url);
        return outcome?.ok ? outcome.url : url;
      });
      if (imageUrls.every((url, index) => url === product.imageUrls[index])) continue;
      const written = await this.repository.replaceImageUrls({
        organizationId,
        salesProductId: product.id,
        expectedVersion: product.version,
        imageUrls,
      });
      if (written) productsUpdated += 1;
      else productsSkipped += 1;
    }

    const after = pendingMirrorImages(organizationId, await this.repository.listImageUrls(organizationId));
    const triedSet = new Set(tried);
    const failed = [...outcomes.entries()].flatMap(([url, outcome]) => (outcome.ok ? [] : [{ url, reason: outcome.reason }]));
    const result: SalesProductImageMirrorResult = {
      mirrored: outcomes.size - failed.length,
      failedCount: failed.length,
      failed: failed.slice(0, 20),
      productsUpdated,
      productsSkipped,
      remaining: after.length,
      // 순서가 늘 같으므로, 이번 묶음까지 시도했는데 아직 남은 사진만큼 건너뛰면 새 사진부터 옮긴다.
      nextSkip: after.filter((image) => triedSet.has(image.url)).length,
    };
    this.logger.log(
      `판매상품 사진 옮기기 org=${organizationId} 옮김 ${result.mirrored} · 실패 ${result.failedCount} · 남음 ${result.remaining}`,
    );
    return result;
  }
}
