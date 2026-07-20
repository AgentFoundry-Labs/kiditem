/**
 * Canonical compiled stylesheet used by detail-page templates.
 *
 * Saved revisions are expected to embed this CSS. The renderer still consumes
 * it through a port so legacy revisions can be hydrated without coupling the
 * application service to a package path or the filesystem.
 */
export const DETAIL_PAGE_TEMPLATE_STYLES_PORT = Symbol(
  'DETAIL_PAGE_TEMPLATE_STYLES_PORT',
);

export interface DetailPageTemplateStylesPort {
  getCompiledCss(): string;
}
