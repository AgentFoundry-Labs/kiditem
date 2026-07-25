import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DETAIL_PAGE_RASTER_VARIANT_VERSION,
  DetailPageRasterJobOutputSchema,
  type DetailPageRasterJobInput,
  type DetailPageRasterJobOutput,
} from '../../domain/direct-job/detail-page-raster-job';
import {
  DETAIL_PAGE_QUERY_REPOSITORY_PORT,
  type DetailPageQueryRepositoryPort,
} from '../port/out/repository/detail-page-query.repository.port';
import {
  DETAIL_PAGE_TEMPLATE_STYLES_PORT,
  type DetailPageTemplateStylesPort,
} from '../port/out/runtime/detail-page-template-styles.port';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../port/out/storage/image-storage.port';
import { DetailPageRasterizationService } from './detail-page-rasterization.service';
import {
  buildRenderDocument,
  COUPANG_DETAIL_JPEG_QUALITY,
  COUPANG_DETAIL_LAYOUT_WIDTH,
  detailPageServerOrigin,
} from './detail-page-render-document';

@Injectable()
export class DetailPageRasterJobExecutorService {
  private readonly logger = new Logger(DetailPageRasterJobExecutorService.name);

  constructor(
    @Inject(DETAIL_PAGE_QUERY_REPOSITORY_PORT)
    private readonly detailPages: DetailPageQueryRepositoryPort,
    private readonly rasterization: DetailPageRasterizationService,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly storage: ImageStoragePort,
    @Inject(DETAIL_PAGE_TEMPLATE_STYLES_PORT)
    private readonly templateStyles: DetailPageTemplateStylesPort,
  ) {}

  async preflight(input: {
    organizationId: string;
    input: DetailPageRasterJobInput;
  }): Promise<boolean> {
    const revision = await this.detailPages.findDetailPageRevisionHtml({
      organizationId: input.organizationId,
      revisionId: input.input.revisionId,
      artifactId: input.input.artifactId,
    });
    return Boolean(revision?.html.trim());
  }

  async execute(input: {
    organizationId: string;
    input: DetailPageRasterJobInput;
    signal: AbortSignal;
  }): Promise<DetailPageRasterJobOutput> {
    throwIfAborted(input.signal);
    const revision = await this.detailPages.findDetailPageRevisionHtml({
      organizationId: input.organizationId,
      revisionId: input.input.revisionId,
      artifactId: input.input.artifactId,
    });
    if (!revision || !revision.html.trim()) {
      throw Object.assign(new Error('Saved detail-page revision is missing or empty.'), {
        code: 'direct_ai_input_invalid',
      });
    }

    throwIfAborted(input.signal);
    const rendered = await this.rasterization.render({
      html: buildRenderDocument(
        revision.html,
        detailPageServerOrigin(),
        this.templateStyles.getCompiledCss(),
      ),
      viewportWidth: COUPANG_DETAIL_LAYOUT_WIDTH,
      outputWidth: input.input.outputWidth,
      format: 'jpeg',
      quality: COUPANG_DETAIL_JPEG_QUALITY,
    });
    if (rendered.contentType !== 'image/jpeg') {
      throw Object.assign(new Error('Detail-page rasterizer returned a non-JPEG result.'), {
        code: 'direct_ai_output_invalid',
      });
    }

    throwIfAborted(input.signal);
    const key = `detail-page-images/${input.organizationId}/${revision.revisionId}/${DETAIL_PAGE_RASTER_VARIANT_VERSION}-${input.input.outputWidth}.jpg`;
    const imageUrl = await this.storage.save(
      key,
      rendered.buffer,
      rendered.contentType,
    );
    const output = DetailPageRasterJobOutputSchema.parse({
      revisionId: revision.revisionId,
      artifactId: revision.artifactId,
      imageUrl,
      outputWidth: input.input.outputWidth,
      contentType: rendered.contentType,
      byteLength: rendered.buffer.byteLength,
    });
    this.logger.log(
      `Rendered saved detail-page revision ${revision.revisionId} asynchronously (${output.byteLength} bytes).`,
    );
    return output;
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw Object.assign(new Error('Detail-page raster job aborted.'), {
      code: 'direct_ai_aborted',
    });
  }
}
