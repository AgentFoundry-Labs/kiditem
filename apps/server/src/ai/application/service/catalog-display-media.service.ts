import { Inject, Injectable } from '@nestjs/common';
import {
  CATALOG_DISPLAY_MEDIA_PORT,
  type CatalogDisplayMedia,
  type CatalogDisplayMediaPort,
  type CatalogDisplayMediaRequest,
  type CatalogDisplayMediaTarget,
} from '../port/in/workspace/catalog-display-media.port';
import {
  CATALOG_DISPLAY_MEDIA_REPOSITORY_PORT,
  type CatalogDisplayMediaCandidate,
  type CatalogDisplayMediaRepositoryPort,
} from '../port/out/repository/catalog-display-media.repository.port';

@Injectable()
export class CatalogDisplayMediaService implements CatalogDisplayMediaPort {
  constructor(
    @Inject(CATALOG_DISPLAY_MEDIA_REPOSITORY_PORT)
    private readonly repository: CatalogDisplayMediaRepositoryPort,
  ) {}

  async findCoupangDisplayMedia(input: {
    organizationId: string;
    requests: CatalogDisplayMediaRequest[];
  }): Promise<Map<string, CatalogDisplayMedia>> {
    assertUniqueRequestKeys(input.requests);
    const channelListingIds = [...new Set(
      input.requests.flatMap((request) =>
        request.candidates.map((candidate) => candidate.channelListingId)),
    )].sort((left, right) => left.localeCompare(right));
    if (channelListingIds.length === 0) return new Map();

    const candidates = await this.repository.findCoupangCandidates({
      organizationId: input.organizationId,
      channelListingIds,
    });
    const result = new Map<string, CatalogDisplayMedia>();
    for (const request of input.requests) {
      const picked = pickRequestMedia(request, candidates);
      if (!picked) continue;
      result.set(request.key, {
        url: picked.asset.url,
        source: 'coupang_catalog',
        channelListingId: picked.target.channelListingId,
        externalOptionId: picked.target.externalOptionId,
      });
    }
    return result;
  }
}

export function pickRequestMedia(
  request: CatalogDisplayMediaRequest,
  candidates: readonly CatalogDisplayMediaCandidate[],
): Readonly<{
  target: CatalogDisplayMediaTarget;
  asset: CatalogDisplayMediaCandidate;
}> | undefined {
  for (const target of request.candidates) {
    const ordered = candidates
      .filter((candidate) => candidate.channelListingId === target.channelListingId)
      .sort(compareCandidates);
    const asset = ordered.find((candidate) =>
      candidate.role === 'option'
      && target.externalOptionId !== null
      && candidate.externalOptionId === target.externalOptionId,
    ) ?? ordered.find((candidate) => candidate.role === 'primary');
    if (asset) return { target, asset };
  }
  return undefined;
}

function assertUniqueRequestKeys(requests: readonly CatalogDisplayMediaRequest[]): void {
  const seen = new Set<string>();
  for (const request of requests) {
    if (seen.has(request.key)) {
      throw new Error(`Duplicate catalog display media request key: ${request.key}`);
    }
    seen.add(request.key);
  }
}

function compareCandidates(
  left: CatalogDisplayMediaCandidate,
  right: CatalogDisplayMediaCandidate,
): number {
  return left.sortOrder - right.sortOrder
    || left.url.localeCompare(right.url)
    || left.id.localeCompare(right.id);
}
