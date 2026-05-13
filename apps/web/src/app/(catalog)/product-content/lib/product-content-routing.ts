interface ProductContentEditorHrefInput {
  productId: string;
  generationId?: string | null;
}

export function buildProductContentEditorHref({
  productId,
  generationId,
}: ProductContentEditorHrefInput): string {
  const encodedProductId = encodeURIComponent(productId);
  if (!generationId) return `/product-content/${encodedProductId}/editor`;
  const params = new URLSearchParams({ generationId });
  return `/product-content/${encodedProductId}/editor?${params.toString()}`;
}

export function normalizeProductContentHref(href: string | null): string | null {
  if (!href) return null;

  const legacyDetailPageEditor = href.match(
    /^\/sourcing\/([^/?#]+)\/editor(?:\?([^#]*))?(?:#.*)?$/,
  );
  if (!legacyDetailPageEditor) return href;

  const [, productId, rawQuery = ''] = legacyDetailPageEditor;
  const query = new URLSearchParams(rawQuery);
  const generationId =
    query.get('generationId') ?? query.get('boldId') ?? query.get('kpId') ?? query.get('agentId');
  return buildProductContentEditorHref({
    productId: decodeURIComponent(productId),
    generationId,
  });
}
