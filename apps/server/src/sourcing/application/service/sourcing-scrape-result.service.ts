import { Inject, Injectable } from '@nestjs/common';
import {
  SOURCING_CANDIDATE_REPOSITORY_PORT,
  type SourcingCandidateRepositoryPort,
} from '../port/out/repository/sourcing-candidate.repository.port';
import {
  extractSupplierOfferId,
  parseAllowedSupplierUrl,
} from '../../domain/supplier-source-url-policy';
import {
  normalizeSourcingVariantKey,
  stableSourcingCandidateIdentity,
} from '../../domain/sourcing-candidate-identity';

export interface PersistSourcingScrapeResultInput {
  organizationId: string;
  triggeredByUserId: string | null;
  output: Record<string, unknown>;
}

export interface PersistSourcingScrapeResult {
  candidateId: string;
  href: string;
}

export class SourcingScrapeResultError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SourcingScrapeResultError';
  }
}

const PLATFORM_MAP = {
  '1688': 'ALIBABA_1688',
  alibaba: 'ALIBABA',
} as const;

const PRODUCT_IMAGE_FIELD_KEYS = [
  'images',
  'imageUrls',
  'image_urls',
  'mainImages',
  'main_images',
  'mainImage',
  'main_image',
  'offerImgList',
] as const;

@Injectable()
export class SourcingScrapeResultService {
  constructor(
    @Inject(SOURCING_CANDIDATE_REPOSITORY_PORT)
    private readonly candidates: SourcingCandidateRepositoryPort,
  ) {}

  async persist(
    input: PersistSourcingScrapeResultInput,
  ): Promise<PersistSourcingScrapeResult> {
    if (input.output.ok !== true) {
      throw new SourcingScrapeResultError(
        'sourcing_scrape_failed',
        nonEmptyString(input.output.error) ??
          'Sourcing scrape did not succeed.',
      );
    }
    const scraped = isRecord(input.output.scraped_data)
      ? input.output.scraped_data
      : null;
    if (!scraped) {
      throw new SourcingScrapeResultError(
        'sourcing_scrape_missing_output',
        'Sourcing scrape returned no scraped_data.',
      );
    }

    const rawSourceUrl =
      nonEmptyString(scraped.source_url) ??
      nonEmptyString(input.output.source_url);
    if (!rawSourceUrl) {
      throw new SourcingScrapeResultError(
        'sourcing_scrape_missing_source_url',
        'Scraped sourcing result requires a source URL.',
      );
    }
    const source = parseSupplierUrl(rawSourceUrl);
    const title = nonEmptyString(scraped.title);
    if (!title) {
      throw new SourcingScrapeResultError(
        'sourcing_scrape_missing_title',
        'Scraped sourcing result requires a title.',
      );
    }

    const sourcePlatform = PLATFORM_MAP[source.platform];
    const externalOfferId =
      extractSupplierOfferId(source) ?? nonEmptyString(scraped.product_id);
    const variantKeyNormalized = normalizeSourcingVariantKey(
      scraped.variant_key,
    );
    const images = extractImageUrls(scraped);
    const candidate = await this.candidates.upsertSourced({
      organizationId: input.organizationId,
      sourceUrl: source.normalizedUrl,
      sourcePlatform,
      externalOfferId,
      variantKeyNormalized,
      sourceIdentityHash: externalOfferId
        ? stableSourcingCandidateIdentity(
            sourcePlatform,
            externalOfferId,
            variantKeyNormalized,
          )
        : null,
      rawData: {
        ...scraped,
        source_url: source.normalizedUrl,
        page_type: scraped.page_type ?? 'detail',
      },
      name: title,
      description:
        nonEmptyString(scraped.description) ??
        nonEmptyString(scraped.description_text) ??
        '',
      category: nonEmptyString(scraped.category_name),
      tags: stringList(scraped.tags),
      thumbnailUrl: images[0] ?? null,
      imageUrl: images[0] ?? null,
      costCny: extractCostCny(scraped, sourcePlatform),
      triggeredByUserId: input.triggeredByUserId,
      images: images.map((url, index) => ({
        url,
        role: 'product',
        label: null,
        sortOrder: index,
        source: 'sourcing-scrape-url',
        isPrimary: index === 0,
      })),
    });

    return {
      candidateId: candidate.id,
      href: `/product-pipeline/collected-products/${encodeURIComponent(candidate.id)}`,
    };
  }
}

function parseSupplierUrl(value: string) {
  try {
    return parseAllowedSupplierUrl(value);
  } catch {
    throw new SourcingScrapeResultError(
      'sourcing_scrape_invalid_source_url',
      'Scraped sourcing result contains an unsupported supplier URL.',
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(nonEmptyString)
    .filter((entry): entry is string => entry !== null);
}

function extractCostCny(
  data: Record<string, unknown>,
  sourcePlatform: string,
): number | null {
  const currency = nonEmptyString(data.currency)?.toUpperCase();
  if (currency && currency !== 'CNY') return null;
  if (!currency && sourcePlatform !== 'ALIBABA_1688') return null;

  for (const key of ['price', 'price_min']) {
    const raw = data[key];
    const value =
      typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
    if (Number.isFinite(value) && value > 0) return value;
  }
  const priceRange =
    nonEmptyString(data.priceRange) ?? nonEmptyString(data.price_range);
  if (priceRange?.includes('-')) {
    const value = Number.parseFloat(priceRange.split('-')[0]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  const offer = isRecord(data.offer) ? data.offer : null;
  if (offer?.price != null) {
    const value = Number.parseFloat(String(offer.price));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function extractImageUrls(data: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    const url = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
    if (
      (!url.startsWith('https://') && !url.startsWith('http://')) ||
      seen.has(url)
    ) {
      return;
    }
    seen.add(url);
    urls.push(url);
  };
  PRODUCT_IMAGE_FIELD_KEYS.forEach((key) => collect(data[key]));
  return urls;
}
