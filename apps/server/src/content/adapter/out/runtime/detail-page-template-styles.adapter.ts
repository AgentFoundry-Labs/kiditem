import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { DetailPageTemplateStylesPort } from '../../../application/port/out/runtime';

const nodeRequire = createRequire(__filename);

function loadCompiledTemplateCss(): string {
  const stylesheetPath = nodeRequire.resolve('@kiditem/templates/styles.css');
  const css = readFileSync(stylesheetPath, 'utf8').trim();
  if (!css) {
    throw new Error(`Detail-page template stylesheet is empty: ${stylesheetPath}`);
  }
  return css;
}

/** Filesystem/package adapter for the canonical compiled template CSS. */
@Injectable()
export class DetailPageTemplateStylesAdapter
implements DetailPageTemplateStylesPort {
  private readonly compiledCss = loadCompiledTemplateCss();

  getCompiledCss(): string {
    return this.compiledCss;
  }
}
