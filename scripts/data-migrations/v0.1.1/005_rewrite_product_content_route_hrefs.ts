import type { DataMigration } from '../types';

const COLLECTED_PRODUCTS_HREF = '/product-pipeline/collected-products';
const REGISTERED_DETAIL_EDITOR_HREF =
  '/product-pipeline/registered-products/detail-pages';
const DETAIL_TEMPLATE_GENERATION_HREF = '/product-pipeline/detail-template-generation';
const THUMBNAIL_GENERATION_HREF = '/product-pipeline/thumbnail-generation';
const THUMBNAIL_GENERATION_EDITOR_HREF = '/product-pipeline/thumbnail-generation/edit';
const REGISTERED_PRODUCTS_HREF = '/product-pipeline/registered-products';

export function rewriteProductContentRouteHref(href: string): string {
  if (href === '/sourcing' || href === '/product-content') return COLLECTED_PRODUCTS_HREF;
  if (href === '/generate') return DETAIL_TEMPLATE_GENERATION_HREF;
  if (href === '/thumbnails') return THUMBNAIL_GENERATION_HREF;
  if (href === '/thumbnail-editor' || href === '/thumbnail-editor/edit') {
    return THUMBNAIL_GENERATION_EDITOR_HREF;
  }

  const productContentQuery = href.match(/^\/product-content\?(.+)$/);
  if (productContentQuery) {
    return `${REGISTERED_PRODUCTS_HREF}?${productContentQuery[1]}`;
  }

  const legacyGenerateWithQuery = href.match(/^\/generate\?(.+)$/);
  if (legacyGenerateWithQuery) return `${DETAIL_TEMPLATE_GENERATION_HREF}?${legacyGenerateWithQuery[1]}`;

  const legacyThumbnailsWithQuery = href.match(/^\/thumbnails\?(.+)$/);
  if (legacyThumbnailsWithQuery) return `${THUMBNAIL_GENERATION_HREF}?${legacyThumbnailsWithQuery[1]}`;

  const legacyThumbnailEditorWithQuery = href.match(/^\/thumbnail-editor(?:\/edit)?\?(.+)$/);
  if (legacyThumbnailEditorWithQuery) {
    return `${THUMBNAIL_GENERATION_EDITOR_HREF}?${legacyThumbnailEditorWithQuery[1]}`;
  }

  const legacySourcingDetailEditor = href.match(
    /^\/sourcing\/detail-pages\/([^/?#]+)\/editor(?:[?#].*)?$/,
  );
  if (legacySourcingDetailEditor) {
    return `${REGISTERED_DETAIL_EDITOR_HREF}/${encodeURIComponent(decodeURIComponent(legacySourcingDetailEditor[1]))}/editor`;
  }

  const legacySourcingCandidateEditor = href.match(
    /^\/sourcing\/([^/?#]+)\/editor(?:\?([^#]*))?(?:#.*)?$/,
  );
  if (legacySourcingCandidateEditor) {
    const [, rawCandidateId, rawQuery = ''] = legacySourcingCandidateEditor;
    const query = new URLSearchParams(rawQuery);
    const generationId =
      query.get('generationId') ?? query.get('boldId') ?? query.get('kpId') ?? query.get('agentId');
    const candidateEditor = `${COLLECTED_PRODUCTS_HREF}/${encodeURIComponent(decodeURIComponent(rawCandidateId))}/editor`;
    if (!generationId) return candidateEditor;
    return `${candidateEditor}?generationId=${encodeURIComponent(generationId)}`;
  }

  const legacySourcingCandidate = href.match(/^\/sourcing\/([^/?#]+)(?:[?#].*)?$/);
  if (legacySourcingCandidate) {
    return `${COLLECTED_PRODUCTS_HREF}/${encodeURIComponent(decodeURIComponent(legacySourcingCandidate[1]))}`;
  }

  const productContentDetailEditor = href.match(
    /^\/product-content\/detail-pages\/([^/?#]+)\/editor(?:[?#].*)?$/,
  );
  if (productContentDetailEditor) {
    return `${REGISTERED_DETAIL_EDITOR_HREF}/${encodeURIComponent(decodeURIComponent(productContentDetailEditor[1]))}/editor`;
  }

  const productContentNamespacedCandidateEditor = href.match(
    /^\/product-content\/candidates\/([^/?#]+)\/editor(?:\?([^#]*))?(?:#.*)?$/,
  );
  if (productContentNamespacedCandidateEditor) {
    const [, rawCandidateId, rawQuery = ''] = productContentNamespacedCandidateEditor;
    const query = new URLSearchParams(rawQuery);
    const generationId =
      query.get('generationId') ?? query.get('boldId') ?? query.get('kpId') ?? query.get('agentId');
    const candidateEditor = `${COLLECTED_PRODUCTS_HREF}/${encodeURIComponent(decodeURIComponent(rawCandidateId))}/editor`;
    if (!generationId) return candidateEditor;
    return `${candidateEditor}?generationId=${encodeURIComponent(generationId)}`;
  }

  const productContentNamespacedCandidate = href.match(
    /^\/product-content\/candidates\/([^/?#]+)(?:[?#].*)?$/,
  );
  if (productContentNamespacedCandidate) {
    return `${COLLECTED_PRODUCTS_HREF}/${encodeURIComponent(decodeURIComponent(productContentNamespacedCandidate[1]))}`;
  }

  const oldProductContentCandidateEditor = href.match(
    /^\/product-content\/([^/?#]+)\/editor(?:\?([^#]*))?(?:#.*)?$/,
  );
  if (oldProductContentCandidateEditor) {
    const [, rawCandidateId, rawQuery = ''] = oldProductContentCandidateEditor;
    if (rawCandidateId === 'candidates' || rawCandidateId === 'detail-pages') return href;
    const query = new URLSearchParams(rawQuery);
    const generationId =
      query.get('generationId') ?? query.get('boldId') ?? query.get('kpId') ?? query.get('agentId');
    const candidateEditor = `${COLLECTED_PRODUCTS_HREF}/${encodeURIComponent(decodeURIComponent(rawCandidateId))}/editor`;
    if (!generationId) return candidateEditor;
    return `${candidateEditor}?generationId=${encodeURIComponent(generationId)}`;
  }

  return href;
}

export function isProductContentRouteHrefRewriteNeeded(href: string): boolean {
  return rewriteProductContentRouteHref(href) !== href;
}

export const rewriteProductContentRouteHrefs: DataMigration = {
  id: 'v0.1.1:005_rewrite_product_content_route_hrefs',
  releaseVersion: '0.1.1',
  name: 'Rewrite persisted product pipeline hrefs to canonical routes',
  async run(tx) {
    const sourcingRootUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = '/product-pipeline/collected-products',
          updated_at = now()
      WHERE href = '/sourcing'
    `;
    const productContentRootUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = '/product-pipeline/collected-products',
          updated_at = now()
      WHERE href = '/product-content'
    `;
    const productContentQueryUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = regexp_replace(
            href,
            '^/product-content\\?(.*)$',
            '/product-pipeline/registered-products?\\1'
          ),
          updated_at = now()
      WHERE href ~ '^/product-content\\?'
    `;
    const generateUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = regexp_replace(
            href,
            '^/generate(\\?.*)?$',
            '/product-pipeline/detail-template-generation\\1'
          ),
          updated_at = now()
      WHERE href ~ '^/generate(\\?|$)'
    `;
    const thumbnailsUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = regexp_replace(
            href,
            '^/thumbnails(\\?.*)?$',
            '/product-pipeline/thumbnail-generation\\1'
          ),
          updated_at = now()
      WHERE href ~ '^/thumbnails(\\?|$)'
    `;
    const thumbnailEditorUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = regexp_replace(
            href,
            '^/thumbnail-editor(?:/edit)?(\\?.*)?$',
            '/product-pipeline/thumbnail-generation/edit\\1'
          ),
          updated_at = now()
      WHERE href ~ '^/thumbnail-editor(/edit)?(\\?|$)'
    `;
    const sourcingDetailUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = regexp_replace(
            href,
            '^/sourcing/detail-pages/([^/?#]+)/editor.*$',
            '/product-pipeline/registered-products/detail-pages/\\1/editor'
          ),
          updated_at = now()
      WHERE href ~ '^/sourcing/detail-pages/[^/?#]+/editor'
    `;
    const sourcingCandidateEditorWithGenerationUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = regexp_replace(
            href,
            '^/sourcing/([^/?#]+)/editor\\?(?:generationId|boldId|kpId|agentId)=([^&#]+).*$',
            '/product-pipeline/collected-products/\\1/editor?generationId=\\2'
          ),
          updated_at = now()
      WHERE href !~ '^/sourcing/detail-pages/'
        AND href ~ '^/sourcing/[^/?#]+/editor\\?(generationId|boldId|kpId|agentId)='
    `;
    const sourcingCandidateEditorUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = regexp_replace(
            href,
            '^/sourcing/([^/?#]+)/editor.*$',
            '/product-pipeline/collected-products/\\1/editor'
          ),
          updated_at = now()
      WHERE href !~ '^/sourcing/detail-pages/'
        AND href ~ '^/sourcing/[^/?#]+/editor'
    `;
    const sourcingCandidateUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = regexp_replace(
            href,
            '^/sourcing/([^/?#]+).*$',
            '/product-pipeline/collected-products/\\1'
          ),
          updated_at = now()
      WHERE href !~ '^/sourcing/detail-pages/'
        AND href !~ '^/sourcing/[^/?#]+/editor'
        AND href ~ '^/sourcing/[^/?#]+'
    `;
    const productContentDetailUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = regexp_replace(
            href,
            '^/product-content/detail-pages/([^/?#]+)/editor.*$',
            '/product-pipeline/registered-products/detail-pages/\\1/editor'
          ),
          updated_at = now()
      WHERE href ~ '^/product-content/detail-pages/[^/?#]+/editor'
    `;
    const productContentNamespacedCandidateEditorWithGenerationUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = regexp_replace(
            href,
            '^/product-content/candidates/([^/?#]+)/editor\\?(?:generationId|boldId|kpId|agentId)=([^&#]+).*$',
            '/product-pipeline/collected-products/\\1/editor?generationId=\\2'
          ),
          updated_at = now()
      WHERE href ~ '^/product-content/candidates/[^/?#]+/editor\\?(generationId|boldId|kpId|agentId)='
    `;
    const productContentNamespacedCandidateEditorUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = regexp_replace(
            href,
            '^/product-content/candidates/([^/?#]+)/editor.*$',
            '/product-pipeline/collected-products/\\1/editor'
          ),
          updated_at = now()
      WHERE href ~ '^/product-content/candidates/[^/?#]+/editor'
    `;
    const productContentNamespacedCandidateUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = regexp_replace(
            href,
            '^/product-content/candidates/([^/?#]+).*$',
            '/product-pipeline/collected-products/\\1'
          ),
          updated_at = now()
      WHERE href ~ '^/product-content/candidates/[^/?#]+'
        AND href !~ '^/product-content/candidates/[^/?#]+/editor'
    `;
    const oldProductContentCandidateEditorUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = regexp_replace(
            href,
            '^/product-content/([^/?#]+)/editor\\?(?:generationId|boldId|kpId|agentId)=([^&#]+).*$',
            '/product-pipeline/collected-products/\\1/editor?generationId=\\2'
          ),
          updated_at = now()
      WHERE href !~ '^/product-content/(candidates|detail-pages)/'
        AND href ~ '^/product-content/[^/?#]+/editor\\?(generationId|boldId|kpId|agentId)='
    `;
    const oldProductContentCandidateEditorWithoutGenerationUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = regexp_replace(
            href,
            '^/product-content/([^/?#]+)/editor.*$',
            '/product-pipeline/collected-products/\\1/editor'
          ),
          updated_at = now()
      WHERE href !~ '^/product-content/(candidates|detail-pages)/'
        AND href ~ '^/product-content/[^/?#]+/editor'
    `;

    const alertsUpdated =
      sourcingRootUpdated +
      productContentRootUpdated +
      productContentQueryUpdated +
      generateUpdated +
      thumbnailsUpdated +
      thumbnailEditorUpdated +
      sourcingDetailUpdated +
      sourcingCandidateEditorWithGenerationUpdated +
      sourcingCandidateEditorUpdated +
      sourcingCandidateUpdated +
      productContentDetailUpdated +
      productContentNamespacedCandidateEditorWithGenerationUpdated +
      productContentNamespacedCandidateEditorUpdated +
      productContentNamespacedCandidateUpdated +
      oldProductContentCandidateEditorUpdated +
      oldProductContentCandidateEditorWithoutGenerationUpdated;

    return {
      affectedRows: alertsUpdated,
      details: {
        alertsUpdated,
        sourcingRootUpdated,
        productContentRootUpdated,
        productContentQueryUpdated,
        generateUpdated,
        thumbnailsUpdated,
        thumbnailEditorUpdated,
        sourcingDetailUpdated,
        sourcingCandidateEditorWithGenerationUpdated,
        sourcingCandidateEditorUpdated,
        sourcingCandidateUpdated,
        productContentDetailUpdated,
        productContentNamespacedCandidateEditorWithGenerationUpdated,
        productContentNamespacedCandidateEditorUpdated,
        productContentNamespacedCandidateUpdated,
        oldProductContentCandidateEditorUpdated,
        oldProductContentCandidateEditorWithoutGenerationUpdated,
      },
    };
  },
};
