import { describe, expect, it, vi } from 'vitest';
import {
  COUPANG_DETAIL_JPEG_QUALITY,
  COUPANG_DETAIL_LAYOUT_WIDTH,
} from './detail-page-render-document';
import { DetailPageRasterJobExecutorService } from './detail-page-raster-job-executor.service';

const ORG = '3bc63d9d-74a1-4806-bbba-1e49710b5467';
const REVISION = '60620087-f5d8-4307-8591-221fd018eaa0';
const ARTIFACT = '71429ba3-af81-409e-a976-029c67d86bcb';

describe('DetailPageRasterJobExecutorService', () => {
  it('loads the exact saved revision and writes a deterministic JPEG rendition', async () => {
    const repository = {
      findDetailPageRevisionHtml: vi.fn().mockResolvedValue({
        revisionId: REVISION,
        artifactId: ARTIFACT,
        html: '<section>saved detail</section>',
        createdAt: new Date('2026-07-25T07:28:24.000Z'),
      }),
    };
    const rasterization = {
      render: vi.fn().mockResolvedValue({
        buffer: Buffer.from('jpeg-bytes'),
        contentType: 'image/jpeg',
      }),
    };
    const storage = {
      save: vi.fn().mockResolvedValue('https://cdn.example.com/detail.jpg'),
    };
    const executor = new DetailPageRasterJobExecutorService(
      repository as never,
      rasterization as never,
      storage as never,
      { getCompiledCss: () => '.detail{}' },
    );

    await expect(executor.execute({
      organizationId: ORG,
      input: { revisionId: REVISION, artifactId: ARTIFACT, outputWidth: 780 },
      signal: new AbortController().signal,
    })).resolves.toMatchObject({
      revisionId: REVISION,
      artifactId: ARTIFACT,
      imageUrl: 'https://cdn.example.com/detail.jpg',
      contentType: 'image/jpeg',
      byteLength: 10,
    });

    expect(repository.findDetailPageRevisionHtml).toHaveBeenCalledWith({
      organizationId: ORG,
      revisionId: REVISION,
      artifactId: ARTIFACT,
    });
    expect(rasterization.render).toHaveBeenCalledWith(expect.objectContaining({
      viewportWidth: COUPANG_DETAIL_LAYOUT_WIDTH,
      outputWidth: 780,
      format: 'jpeg',
      quality: COUPANG_DETAIL_JPEG_QUALITY,
    }));
    expect(storage.save).toHaveBeenCalledWith(
      `detail-page-images/${ORG}/${REVISION}/wing-jpeg-v1-780.jpg`,
      expect.any(Buffer),
      'image/jpeg',
    );
  });
});
