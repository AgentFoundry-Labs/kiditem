interface SourcingEditorHrefInput {
  candidateId?: string | null;
  generationId?: string | null;
}

export function buildSourcingEditorHref({
  candidateId,
  generationId,
}: SourcingEditorHrefInput): string {
  if (candidateId && generationId) {
    return `/sourcing/${encodeURIComponent(candidateId)}/editor?generationId=${encodeURIComponent(generationId)}`;
  }
  if (candidateId) {
    return `/sourcing/${encodeURIComponent(candidateId)}/editor`;
  }
  if (generationId) {
    return `/sourcing/detail-pages/${encodeURIComponent(generationId)}/editor`;
  }
  return '/sourcing';
}

export function normalizeSourcingHref(href: string | null): string | null {
  if (!href) return null;

  const productContentGenerationEditor = href.match(
    /^\/product-content\/detail-pages\/([^/?#]+)\/editor(?:[?#].*)?$/,
  );
  if (productContentGenerationEditor) {
    return buildSourcingEditorHref({
      generationId: decodeURIComponent(productContentGenerationEditor[1]),
    });
  }

  const oldProductContentProductEditor = href.match(
    /^\/product-content\/([^/?#]+)\/editor(?:\?([^#]*))?(?:#.*)?$/,
  );
  if (oldProductContentProductEditor) {
    const [, , rawQuery = ''] = oldProductContentProductEditor;
    const query = new URLSearchParams(rawQuery);
    const generationId =
      query.get('generationId') ?? query.get('boldId') ?? query.get('kpId') ?? query.get('agentId');
    return buildSourcingEditorHref({ generationId });
  }

  return href;
}
