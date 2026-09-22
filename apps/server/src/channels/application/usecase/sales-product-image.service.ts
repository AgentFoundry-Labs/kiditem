import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  SalesProductExternalImages,
  SalesProductImageMirrorResult,
} from '@kiditem/shared/sales-product';
import {
  imageReferenceUrls,
  normalizeImageReferenceUrl,
  pendingMirrorImages,
  rewriteImageHtml,
  rewriteImageUrls,
  type PendingMirrorImage,
  type SalesProductImageSnapshot,
} from '../../domain/sales-product-images';
import {
  SALES_PRODUCT_REPOSITORY_PORT,
  type SalesProductRepositoryPort,
} from '../port/out/persistence/sales-product.repository.port';
import {
  SALES_PRODUCT_IMAGE_MIRROR_PORT,
  type SalesProductImageMirrorOutcome,
  type SalesProductImageMirrorPort,
} from '../port/out/storage/sales-product-image-mirror.port';

const DEFAULT_BATCH = 60;
const MAX_BATCH = 200;
const CONCURRENCY = 6;

type ProductImageRow = SalesProductImageSnapshot & {
  id: string;
  version: number;
  detailHtml: string | null;
  extraDetailHtml: string[];
};

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
    const pending = pendingMirrorImages(organizationId, products, { isOwnedUrl: (url) => this.isOwnedUrl(url) });
    const pendingUrls = new Set(pending.map((image) => image.url));
    const productsWithPendingImages = products.filter((product) => imageReferenceUrls(product).some((url) => {
      const normalized = normalizeImageReferenceUrl(url);
      return normalized !== null && pendingUrls.has(normalized);
    })).length;
    return { images: pending.length, products: productsWithPendingImages };
  }

  async mirror(
    organizationId: string,
    options: { limit?: number; skip?: number } = {},
  ): Promise<SalesProductImageMirrorResult> {
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? DEFAULT_BATCH), 1), MAX_BATCH);
    const skip = Math.max(Math.trunc(options.skip ?? 0), 0);
    const products = await this.repository.listImageUrls(organizationId);
    const pending = pendingMirrorImages(organizationId, products, { isOwnedUrl: (url) => this.isOwnedUrl(url) });
    const tried = pending.slice(0, skip + limit).map((image) => image.url);
    const batch = pending.slice(skip, skip + limit);

    const outcomes = new Map<string, SalesProductImageMirrorOutcome>();
    for (let start = 0; start < batch.length; start += CONCURRENCY) {
      const slice = batch.slice(start, start + CONCURRENCY);
      const results = await Promise.all(slice.map((image) => this.mirrorOne(image)));
      slice.forEach((image, index) => outcomes.set(image.url, results[index]!));
    }

    const replacements = new Map(
      [...outcomes.entries()]
        .filter((entry): entry is [string, { ok: true; url: string }] => entry[1].ok)
        .map(([sourceUrl, outcome]) => [sourceUrl, outcome.url]),
    );
    let productsUpdated = 0;
    let productsSkipped = 0;
    for (const product of products) {
      const imageUrls = rewriteImageUrls(product.imageUrls, replacements);
      const detailHtml = rewriteImageHtml(product.detailHtml, replacements);
      const extraDetailHtml = product.extraDetailHtml.map((html) => rewriteImageHtml(html, replacements) ?? html);
      const imagesChanged = imageUrls.some((url, index) => url !== product.imageUrls[index]);
      const detailChanged = detailHtml !== product.detailHtml;
      const extraDetailChanged = extraDetailHtml.some((html, index) => html !== product.extraDetailHtml[index]);
      if (!imagesChanged && !detailChanged && !extraDetailChanged) continue;

      const written = await this.repository.replaceImageUrls({
        organizationId,
        salesProductId: product.id,
        expectedVersion: product.version,
        imageUrls,
        ...(detailChanged ? { detailHtml } : {}),
        ...(extraDetailChanged ? { extraDetailHtml } : {}),
      });
      if (written) productsUpdated += 1;
      else productsSkipped += 1;
    }

    const after = pendingMirrorImages(
      organizationId,
      await this.repository.listImageUrls(organizationId),
      { isOwnedUrl: (url) => this.isOwnedUrl(url) },
    );
    const triedSet = new Set(tried);
    const failed = [...outcomes.entries()].flatMap(([url, outcome]) => {
      if (outcome.ok === false) return [{ url, reason: outcome.reason }];
      return [];
    });
    const result: SalesProductImageMirrorResult = {
      mirrored: outcomes.size - failed.length,
      failedCount: failed.length,
      failed: failed.slice(0, 20),
      productsUpdated,
      productsSkipped,
      remaining: after.length,
      // 순서가 늘 같으므로, 이번까지 시도했는데 아직 남은 사진만큼 건너뛰면 새 사진부터 옮긴다.
      nextSkip: after.filter((image) => triedSet.has(image.url)).length,
    };
    this.logger.log(
      `판매상품 사진 옮기기 org=${organizationId} 옮김 ${result.mirrored} · 실패 ${result.failedCount} · 남음 ${result.remaining}`,
    );
    return result;
  }

  private isOwnedUrl(url: string): boolean {
    return this.images.isOwnedUrl?.(url) ?? false;
  }

  private async mirrorOne(image: PendingMirrorImage): Promise<SalesProductImageMirrorOutcome> {
    if (image.key === null) return { ok: false, reason: image.reason ?? '지원하지 않는 외부 이미지 주소' };
    try {
      return await this.images.mirror({ sourceUrl: image.url, key: image.key });
    } catch {
      // 저장소 장애도 이 사진을 pending 상태로 남겨 다음 실행에서 재시도한다.
      return { ok: false, reason: '사진 저장 실패' };
    }
  }
}
