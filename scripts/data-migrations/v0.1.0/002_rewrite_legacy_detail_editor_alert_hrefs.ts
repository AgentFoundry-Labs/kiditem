import type { DataMigration } from '../types';

export function rewriteLegacyDetailEditorHref(href: string): string {
  const legacyDetailPageEditor = href.match(
    /^\/sourcing\/([^/?#]+)\/editor(?:\?([^#]*))?(?:#.*)?$/,
  );
  if (!legacyDetailPageEditor) return href;

  const [, productId, rawQuery = ''] = legacyDetailPageEditor;
  const query = new URLSearchParams(rawQuery);
  const generationId =
    query.get('generationId') ?? query.get('boldId') ?? query.get('kpId') ?? query.get('agentId');
  const encodedProductId = encodeURIComponent(decodeURIComponent(productId));
  if (!generationId) return `/product-content/${encodedProductId}/editor`;
  const params = new URLSearchParams({ generationId });
  return `/product-content/${encodedProductId}/editor?${params.toString()}`;
}

export function isLegacyDetailEditorHref(href: string): boolean {
  return rewriteLegacyDetailEditorHref(href) !== href;
}

export const rewriteLegacyDetailEditorAlertHrefs: DataMigration = {
  id: 'v0.1.0:002_rewrite_legacy_detail_editor_alert_hrefs',
  releaseVersion: '0.1.0',
  name: 'Rewrite persisted legacy detail editor alert hrefs to product-content',
  async run(tx) {
    const alertsUpdated = await tx.$executeRaw`
      UPDATE alerts
      SET href = regexp_replace(
            href,
            '^/sourcing/([^/?#]+)/editor\\?(?:generationId|boldId|kpId|agentId)=([^&#]+).*$',
            '/product-content/\\1/editor?generationId=\\2'
          ),
          updated_at = now()
      WHERE href ~ '^/sourcing/[^/?#]+/editor\\?(generationId|boldId|kpId|agentId)='
    `;

    return {
      affectedRows: alertsUpdated,
      details: { alertsUpdated },
    };
  },
};
