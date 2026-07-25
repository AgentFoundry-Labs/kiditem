import { describe, expect, it } from 'vitest';
import {
  DetailPageRasterJobInputSchema,
  DetailPageRasterJobOutputSchema,
  detailPageRasterJobSourceId,
} from './detail-page-raster-job';

const REVISION_ID = '60620087-f5d8-4307-8591-221fd018eaa0';
const ARTIFACT_ID = '71429ba3-af81-409e-a976-029c67d86bcb';

describe('detail-page raster direct-job contract', () => {
  it('derives a stable UUID per immutable revision and render variant', () => {
    const first = detailPageRasterJobSourceId(REVISION_ID, 780);
    const second = detailPageRasterJobSourceId(REVISION_ID, 780);

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(detailPageRasterJobSourceId(REVISION_ID, 800)).not.toBe(first);
  });

  it('validates the queued input and stored output strictly', () => {
    expect(DetailPageRasterJobInputSchema.parse({
      revisionId: REVISION_ID,
      artifactId: ARTIFACT_ID,
      outputWidth: 780,
    })).toEqual({
      revisionId: REVISION_ID,
      artifactId: ARTIFACT_ID,
      outputWidth: 780,
    });

    expect(DetailPageRasterJobOutputSchema.parse({
      revisionId: REVISION_ID,
      artifactId: ARTIFACT_ID,
      imageUrl: 'https://cdn.example.com/detail.jpg',
      outputWidth: 780,
      contentType: 'image/jpeg',
      byteLength: 1234,
    })).toMatchObject({ imageUrl: 'https://cdn.example.com/detail.jpg' });

    expect(() => DetailPageRasterJobInputSchema.parse({
      revisionId: REVISION_ID,
      artifactId: ARTIFACT_ID,
      outputWidth: 780,
      unexpected: true,
    })).toThrow();
  });
});
