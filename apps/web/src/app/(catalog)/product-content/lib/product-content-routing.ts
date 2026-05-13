interface ProductContentEditorHrefInput {
  productId?: string | null;
  generationId?: string | null;
}

export function buildProductContentEditorHref({
  productId,
  generationId,
}: ProductContentEditorHrefInput): string {
  if (generationId) {
    return `/product-content/detail-pages/${encodeURIComponent(generationId)}/editor`;
  }
  if (!productId) return '/product-content';
  const encodedProductId = encodeURIComponent(productId);
  return `/product-content/${encodedProductId}/editor`;
}

export function normalizeProductContentHref(href: string | null): string | null {
  if (!href) return null;

  const legacyDetailPageEditor = href.match(
    /^\/sourcing\/([^/?#]+)\/editor(?:\?([^#]*))?(?:#.*)?$/,
  );
  if (legacyDetailPageEditor) {
    const [, productId, rawQuery = ''] = legacyDetailPageEditor;
    const query = new URLSearchParams(rawQuery);
    const generationId =
      query.get('generationId') ?? query.get('boldId') ?? query.get('kpId') ?? query.get('agentId');
    return buildProductContentEditorHref({
      productId: decodeURIComponent(productId),
      generationId,
    });
  }

  const oldProductContentEditor = href.match(
    /^\/product-content\/([^/?#]+)\/editor(?:\?([^#]*))?(?:#.*)?$/,
  );
  if (!oldProductContentEditor) return href;

  const [, productId, rawQuery = ''] = oldProductContentEditor;
  const query = new URLSearchParams(rawQuery);
  const generationId =
    query.get('generationId') ?? query.get('boldId') ?? query.get('kpId') ?? query.get('agentId');
  return buildProductContentEditorHref({
    productId: decodeURIComponent(productId),
    generationId,
  });
}
