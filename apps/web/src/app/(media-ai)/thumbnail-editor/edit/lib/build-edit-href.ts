export function buildEditHref(opts: {
  productId: string;
  imageUrl?: string | null;
  generationId?: string;
}): string {
  const params = new URLSearchParams({ productId: opts.productId, mode: 'edit', editCase: 'single' });
  if (opts.generationId) params.set('generationId', opts.generationId);
  if (opts.imageUrl) params.set('imageUrl', opts.imageUrl);
  return `/thumbnail-editor/edit?${params.toString()}`;
}
