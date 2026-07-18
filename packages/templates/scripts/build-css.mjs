import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Scanner } from '@tailwindcss/oxide';
import { transform } from 'esbuild';
import { compile } from 'tailwindcss';

const require = createRequire(import.meta.url);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(packageRoot, 'src');
const outputPath = resolve(packageRoot, 'dist/styles.css');

function collectTemplateSources(dir) {
  const sources = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      sources.push(...collectTemplateSources(path));
      continue;
    }
    const extension = extname(path).slice(1);
    if (extension !== 'ts' && extension !== 'tsx') continue;
    sources.push({ extension, content: readFileSync(path, 'utf8') });
  }
  return sources;
}

const sourceCss = readFileSync(resolve(sourceRoot, 'styles.css'), 'utf8')
  .replace(/^@import[^;]+;\s*/m, '')
  .replace(/^@source[^;]+;\s*/gm, '');
const frameworkCss = readFileSync(require.resolve('tailwindcss/index.css'), 'utf8');
const compiler = await compile(`${frameworkCss}\n${sourceCss}`, { base: sourceRoot });
const candidates = new Scanner({ sources: [] }).scanFiles(collectTemplateSources(sourceRoot));

// Tailwind 4.2 can stall when a mixed TS/TSX candidate set is compiled in one
// cold call. Incremental batches use the same public build API and produce the
// same final stylesheet without filesystem-wide auto-scanning.
const batchSize = 50;
let compiledCss = '';
for (let end = batchSize; end < candidates.length; end += batchSize) {
  compiledCss = compiler.build(candidates.slice(0, end));
}
compiledCss = compiler.build(candidates);

const minifiedCss = (await transform(compiledCss, {
  loader: 'css',
  minify: true,
})).code;

const webPublicDir = resolve(packageRoot, '../../apps/web/public');
mkdirSync(dirname(outputPath), { recursive: true });
mkdirSync(webPublicDir, { recursive: true });
writeFileSync(outputPath, minifiedCss);
copyFileSync(outputPath, resolve(webPublicDir, 'templates-styles.css'));
