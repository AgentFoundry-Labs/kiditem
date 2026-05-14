import type { DataMigration } from '../types';

export function rewriteLegacyDetailEditorHref(href: string): string {
  const productContentDetailEditor = href.match(
    /^\/product-content\/detail-pages\/([^/?#]+)\/editor(?:[?#].*)?$/,
  );
  if (productContentDetailEditor) {
    return `/sourcing/detail-pages/${encodeURIComponent(decodeURIComponent(productContentDetailEditor[1]))}/editor`;
  }

  const productContentProductEditor = href.match(
    /^\/product-content\/([^/?#]+)\/editor(?:\?([^#]*))?(?:#.*)?$/,
  );
  if (productContentProductEditor) {
    const [, , rawQuery = ''] = productContentProductEditor;
    const query = new URLSearchParams(rawQuery);
    const generationId =
      query.get('generationId') ?? query.get('boldId') ?? query.get('kpId') ?? query.get('agentId');
    if (!generationId) return '/sourcing';
    return `/sourcing/detail-pages/${encodeURIComponent(generationId)}/editor`;
  }

  const legacyDetailPageEditor = href.match(
    /^\/sourcing\/([^/?#]+)\/editor(?:\?([^#]*))?(?:#.*)?$/,
  );
  if (!legacyDetailPageEditor) return href;

  const [, productId, rawQuery = ''] = legacyDetailPageEditor;
  const query = new URLSearchParams(rawQuery);
  const generationId =
    query.get('generationId') ?? query.get('boldId') ?? query.get('kpId') ?? query.get('agentId');
  const encodedProductId = encodeURIComponent(decodeURIComponent(productId));
  if (!generationId) return `/sourcing/${encodedProductId}/editor`;
  const params = new URLSearchParams({ generationId });
  return `/sourcing/${encodedProductId}/editor?${params.toString()}`;
}

export function isLegacyDetailEditorHref(href: string): boolean {
  return rewriteLegacyDetailEditorHref(href) !== href;
}

export const rewriteLegacyDetailEditorAlertHrefs: DataMigration = {
  id: 'v0.1.0:002_rewrite_legacy_detail_editor_alert_hrefs',
  releaseVersion: '0.1.0',
  name: 'Rewrite persisted legacy detail editor alert hrefs to sourcing',
  async run(tx) {
    const legacySourcingUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = regexp_replace(
            href,
            '^/sourcing/([^/?#]+)/editor\\?(?:generationId|boldId|kpId|agentId)=([^&#]+).*$',
            '/sourcing/\\1/editor?generationId=\\2'
          ),
          updated_at = now()
      WHERE href ~ '^/sourcing/[^/?#]+/editor\\?(generationId|boldId|kpId|agentId)='
    `;
    const productContentDetailUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = regexp_replace(
            href,
            '^/product-content/detail-pages/([^/?#]+)/editor.*$',
            '/sourcing/detail-pages/\\1/editor'
          ),
          updated_at = now()
      WHERE href ~ '^/product-content/detail-pages/[^/?#]+/editor'
    `;
    const productContentProductUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = regexp_replace(
            href,
            '^/product-content/[^/?#]+/editor\\?(?:generationId|boldId|kpId|agentId)=([^&#]+).*$',
            '/sourcing/detail-pages/\\1/editor'
          ),
          updated_at = now()
      WHERE href ~ '^/product-content/[^/?#]+/editor\\?(generationId|boldId|kpId|agentId)='
    `;
    const alertsUpdated =
      legacySourcingUpdated + productContentDetailUpdated + productContentProductUpdated;

    return {
      affectedRows: alertsUpdated,
      details: {
        alertsUpdated,
        legacySourcingUpdated,
        productContentDetailUpdated,
        productContentProductUpdated,
      },
    };
  },
};
