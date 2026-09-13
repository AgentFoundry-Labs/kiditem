import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputPath = path.join(repoRoot, 'extensions/kiditem-os/shared/source-readiness.js');
const result = await build({
  absWorkingDir: repoRoot,
  entryPoints: ['packages/shared/src/source-readiness-runtime.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'KidItemSourceReadiness',
  target: ['chrome120'],
  write: false,
});
const generated = result.outputFiles[0].contents;

if (process.argv.includes('--check')) {
  const current = await fs.readFile(outputPath).catch(() => null);
  if (!current || !current.equals(generated)) {
    console.error('Generated extension source-readiness runtime is out of sync.');
    process.exitCode = 1;
  }
} else {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, generated);
}
